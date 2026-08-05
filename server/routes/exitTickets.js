const express = require('express');
const { db } = require('../config/firebase');
const { simpleAuth } = require('../middleware/simpleAuth');
const { generateSessionCode } = require('../utils/sessionCodeGenerator');
const {
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearActivityFromActiveSession,
  appendSessionActivityHistory,
} = require('../utils/teacherSessionGuard');
const router = express.Router();

const generateId = (prefix = 'exit') =>
  `${prefix}-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

// ERD-aligned RTDB paths
const ticketRef = (id) => db.ref(`exit_tickets/${id}`);
const ticketQuestionsRef = (id) => db.ref(`exit_questions/${id}`);
const ticketResponsesRef = (id) => db.ref(`exit_responses/${id}`);
const ticketJoinCodeRef = (code) => db.ref(`exit_ticket_codes/${String(code).toUpperCase()}`);

async function loadQuestions(ticketId) {
  const qSnap = await ticketQuestionsRef(ticketId).get();
  if (!qSnap.exists()) return [];
  const raw = qSnap.val() || {};
  // Stored by index for stable ordering
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => raw[k]);
}

async function loadTicket(ticketId) {
  const snap = await ticketRef(ticketId).get();
  if (!snap.exists()) return null;
  const ticket = snap.val() || {};
  const questions = await loadQuestions(ticketId);
  return { ...ticket, id: ticketId, questions };
}

async function saveQuestions(ticketId, questions) {
  const payload = {};
  (questions || []).forEach((q, idx) => {
    payload[String(idx)] = q;
  });
  await ticketQuestionsRef(ticketId).set(payload);
}

async function assertTicketPersisted(ticketId, { status, deleted = false } = {}) {
  const snap = await ticketRef(ticketId).get();
  if (deleted) {
    if (snap.exists()) {
      throw new Error('Exit ticket was not removed from the database');
    }
    return;
  }
  if (!snap.exists()) {
    throw new Error('Exit ticket not found in database after update');
  }
  if (status != null && snap.val()?.status !== status) {
    throw new Error(`Exit ticket status is "${snap.val()?.status}" but expected "${status}"`);
  }
}

// Use simple auth for development
router.use(simpleAuth);

// List exit tickets
router.get('/', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { status, limit = 50 } = req.query;
    console.log('Fetching exit tickets with status:', status);
    
    let tickets = [];
    try {
      const indexedSnap = await db.ref('exit_tickets').orderByChild('createdBy').equalTo(uid).get();
      if (indexedSnap.exists()) {
        const raw = indexedSnap.val() || {};
        tickets = Object.entries(raw).map(([id, t]) => ({ id, ...(t || {}) }));
      }
    } catch (indexError) {
      console.warn('Indexed exit ticket list failed, falling back to full scan:', indexError.message);
      const snap = await db.ref('exit_tickets').get();
      const raw = snap.exists() ? (snap.val() || {}) : {};
      tickets = Object.entries(raw)
        .map(([id, t]) => ({ id, ...(t || {}) }))
        .filter((t) => t.createdBy === uid);
    }
    
    if (status && status !== 'All') {
      tickets = tickets.filter((t) => t.status === status);
    }
    
    const lim = Math.max(0, parseInt(limit, 10) || 0);
    if (lim) tickets = tickets.slice(0, lim);
    
    // Sort manually by createdAt (newest first)
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log('Found tickets:', tickets.length);
    return res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('List exit tickets error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create exit ticket
router.post('/', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const body = req.body;
    const id = generateId();
    const now = new Date().toISOString();
    
    console.log('Creating exit ticket with data:', body);
    
    const ticket = {
      id,
      title: body.title || 'Untitled Exit Ticket',
      status: body.status || 'draft',
      responsesCount: 0,
      collectAttendance: body.collectAttendance !== false, // Default true
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      joinCode: null,
      startedAt: null,
      endedAt: null,
    };
    
    console.log('Final ticket object:', ticket);
    
    await ticketRef(id).set(ticket);
    await saveQuestions(id, body.questions || []);
    const full = await loadTicket(id);
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    console.error('Create exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get one
router.get('/:id', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const ticket = await loadTicket(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (ticket.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    return res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('Get exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const id = req.params.id;
    const existing = await loadTicket(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    const allowed = ['title', 'questions', 'status', 'joinCode', 'startedAt', 'endedAt', 'previousStatus'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    
    // If status is being changed to 'archived', store the current status as previousStatus
    if (req.body.status === 'archived' && existing.status !== 'archived') {
      updates.previousStatus = existing.status;
    }

    // Resuming a paused ticket re-activates it — enforce the same one-activity-at-a-time
    // guard used by /start (single source of truth: sessions/{id}.currentActivity).
    let resumeLaunchPrep = null;
    if (req.body.status === 'active' && existing.status !== 'active') {
      resumeLaunchPrep = await prepareActivityLaunch('exitTicket', id);
      if (!resumeLaunchPrep.ok) {
        return res.status(400).json({ success: false, error: resumeLaunchPrep.error });
      }
    }
    
    if (updates.questions) {
      await saveQuestions(id, updates.questions);
      delete updates.questions;
    }
    await ticketRef(id).update(updates);
    if (resumeLaunchPrep) {
      const joinCode = resumeLaunchPrep.sessionCode;
      if (joinCode) {
        await ticketJoinCodeRef(joinCode).set(id);
      }
      const claim = await setSessionCurrentActivity(resumeLaunchPrep.sessionId, 'exitTicket', id);
      if (!claim.ok) {
        await ticketRef(id).update({
          status: existing.status,
          updatedAt: new Date().toISOString(),
        });
        if (joinCode) await ticketJoinCodeRef(joinCode).remove();
        return res.status(400).json({ success: false, error: claim.error });
      }
    }
    if (updates.status) {
      await assertTicketPersisted(id, { status: updates.status });
    }
    const updated = await loadTicket(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const id = req.params.id;
    const existing = await loadTicket(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    const joinCode = existing.joinCode ? String(existing.joinCode).toUpperCase() : null;
    const updates = {
      [`exit_tickets/${id}`]: null,
      [`exit_questions/${id}`]: null,
      [`exit_responses/${id}`]: null,
    };
    if (joinCode) updates[`exit_ticket_codes/${joinCode}`] = null;
    await db.ref().update(updates);
    await assertTicketPersisted(id, { deleted: true });
    return res.json({ success: true, message: 'Exit ticket deleted' });
  } catch (error) {
    console.error('Delete exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Start exit ticket (set active + join code)
router.post('/:id/start', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    console.log('Launching exit ticket:', req.params.id);
    
    const id = req.params.id;
    const existing = await loadTicket(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });

    const launchPrep = await prepareActivityLaunch('exitTicket', id);
    if (!launchPrep.ok) {
      return res.status(400).json({ success: false, error: launchPrep.error });
    }

    const now = new Date().toISOString();
    const joinCode = launchPrep.sessionCode;
    const previousStatus = existing.status;

    const ticketData = {
      status: 'active',
      joinCode,
      sessionCode: joinCode,
      startedAt: now,
      updatedAt: now,
    };
    
    console.log('Setting ticket as active with data:', ticketData);
    
    await ticketRef(id).update(ticketData);
    await ticketJoinCodeRef(joinCode).set(id);
    await assertTicketPersisted(id, { status: 'active' });

    const claim = await setSessionCurrentActivity(launchPrep.sessionId, 'exitTicket', id);
    if (!claim.ok) {
      await ticketRef(id).update({
        status: previousStatus || 'ready',
        joinCode: existing.joinCode || null,
        sessionCode: existing.sessionCode || null,
        updatedAt: now,
      });
      await ticketJoinCodeRef(joinCode).remove();
      return res.status(400).json({ success: false, error: claim.error });
    }

    await appendSessionActivityHistory(launchPrep.sessionId, {
      type: 'exitTicket',
      name: existing.title || 'Exit Ticket',
      activityId: id,
    });
    const updated = await loadTicket(id);
    
    console.log('Exit ticket launched successfully with join code:', joinCode);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Start exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Pause exit ticket
router.post('/:id/pause', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const id = req.params.id;
    const existing = await loadTicket(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    
    if (existing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Exit ticket is not active' });
    }
    
    const now = new Date().toISOString();
    await ticketRef(id).update({
      status: 'paused',
      updatedAt: now,
    });
    await assertTicketPersisted(id, { status: 'paused' });
    
    const updated = await loadTicket(id);
    console.log('Exit ticket paused:', req.params.id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Pause exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// End exit ticket
router.post('/:id/end', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const id = req.params.id;
    const existing = await loadTicket(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    
    const now = new Date().toISOString();
    const joinCode = existing.joinCode ? String(existing.joinCode).toUpperCase() : null;
    await ticketRef(id).update({
      status: 'ended',
      endedAt: now,
      updatedAt: now,
    });
    if (joinCode) {
      await ticketJoinCodeRef(joinCode).remove();
    }
    await assertTicketPersisted(id, { status: 'ended' });
    await clearActivityFromActiveSession('exitTicket', id);
    const updated = await loadTicket(id);

    console.log('Exit ticket ended:', req.params.id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('End exit ticket error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Public route: Get exit ticket by join code (for students)
router.get('/code/:joinCode', async (req, res) => {
  try {
    const { joinCode } = req.params;
    console.log('Student join code:', joinCode);
    
    const idSnap = await ticketJoinCodeRef(joinCode).get();
    if (!idSnap.exists()) {
      console.log('Exit ticket not found or not active for code:', joinCode);
      return res.status(404).json({ success: false, error: 'Invalid or inactive Exit Ticket code' });
    }
    const id = idSnap.val();
    const ticket = await loadTicket(id);
    if (!ticket || ticket.status !== 'active') {
      console.log('Exit ticket not found or not active for code:', joinCode);
      return res.status(404).json({ success: false, error: 'Invalid or inactive Exit Ticket code' });
    }
    
    // Return all questions for student
    const studentTicket = {
      id: ticket.id,
      title: ticket.title,
      questions: ticket.questions || [],
      joinCode: ticket.joinCode
    };
    
    console.log('Student ticket data:', studentTicket);
    return res.json({ success: true, data: studentTicket });
  } catch (error) {
    console.error('Get exit ticket by code error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get responses for a ticket (for feedback viewing)
router.get('/:id/responses', async (req, res) => {
  try {
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const ticketId = req.params.id;
    
    // Verify ticket belongs to this user
    const ticket = await loadTicket(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    }
    if (ticket.createdBy !== uid && req.userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Get all responses for this ticket
    const respSnap = await ticketResponsesRef(ticketId).get();
    const responses = respSnap.exists() ? Object.values(respSnap.val() || {}) : [];
    const attendance = []; // Collect unique students for attendance
    
    responses.forEach((r) => {
      if (r?.studentName && !attendance.find((s) => s.name === r.studentName)) {
        attendance.push({ name: r.studentName, joinedAt: r.submittedAt });
      }
    });
    
    // Sort by submittedAt manually
    responses.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    attendance.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
    
    return res.json({ 
      success: true, 
      data: {
        responses,
        attendance,
        summary: generateResponseSummary(ticket.questions || [], responses)
      }
    });
  } catch (error) {
    console.error('Get responses error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Public route: Submit response to exit ticket
router.post('/:id/respond', async (req, res) => {
  try {
    const { ticketId, answers, studentName: bodyStudentName, studentUid, studentEmail } = req.body;
    const resolvedStudentName = String(bodyStudentName || '').trim();

    console.log('Submitting response for ticket:', req.params.id);
    console.log('Response data:', { ticketId, answers, studentName: resolvedStudentName });

    if (!ticketId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!resolvedStudentName) {
      return res.status(400).json({
        success: false,
        error: 'Student name is required. Please join the session with your name first.',
      });
    }
    
    const id = req.params.id;
    const ticket = await loadTicket(id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    }
    
    // Check if ticket is active
    if (ticket.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Exit ticket is not active' });
    }
    
    // Save response to exit_responses node
    const responseId = generateId('resp');
    const responseData = {
      id: responseId,
      ticketId: id,
      studentName: resolvedStudentName,
      answers: answers,
      submittedAt: new Date().toISOString(),
      ...(studentUid ? { studentUid } : {}),
      ...(studentEmail ? { studentEmail } : {}),
    };
    
    await ticketResponsesRef(id).child(responseId).set(responseData);
    await db.ref(`exit_tickets/${id}/responsesCount`).transaction((cur) => Number(cur || 0) + 1);
    await ticketRef(id).update({ updatedAt: new Date().toISOString() });
    
    console.log('Response submitted successfully for ticket:', req.params.id);
    return res.json({ success: true, message: 'Response submitted successfully' });
  } catch (error) {
    console.error('Submit response error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Generate response summary for analytics
const generateResponseSummary = (questions, responses) => {
  const summary = {};
  
  questions.forEach((question, index) => {
    const questionSummary = {
      type: question.type,
      prompt: question.prompt,
      totalResponses: responses.length,
      data: null
    };
    
    if (question.type === 'multiple_choice' || question.type === 'likert' || question.type === 'true_false') {
      // Count options
      const optionCounts = {};
      responses.forEach(response => {
        const answer = response.answers[index]?.answer;
        if (answer) {
          optionCounts[answer] = (optionCounts[answer] || 0) + 1;
        }
      });
      questionSummary.data = optionCounts;
    } else if (question.type === 'short_text') {
      // Collect all text responses
      const textResponses = [];
      responses.forEach(response => {
        const answer = response.answers[index]?.answer;
        if (answer && answer.trim()) {
          textResponses.push(answer);
        }
      });
      questionSummary.data = textResponses;
    }
    
    summary[`question_${index}`] = questionSummary;
  });
  
  return summary;
};

// Delete all responses for a ticket
router.delete('/:id/responses', async (req, res) => {
  try {
    console.log('DELETE request received for ticket:', req.params.id);
    console.log('User:', req.user);
    console.log('User Role:', req.userRole);
    
    // Get authenticated user ID
    const uid = req.user.uid;
    if (!uid) {
      console.log('No user ID found');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const ticketId = req.params.id;
    
    // Verify ticket belongs to this user
    const ticket = await loadTicket(ticketId);
    if (!ticket) {
      console.log('Ticket not found:', ticketId);
      return res.status(404).json({ success: false, error: 'Exit ticket not found' });
    }
    
    if (ticket.createdBy !== uid && req.userRole !== 'admin') {
      console.log('Access denied. Ticket owner:', ticket.createdBy, 'Requester:', uid);
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Get all responses for this ticket
    const responsesSnap = await ticketResponsesRef(ticketId).get();
    const count = responsesSnap.exists() ? Object.keys(responsesSnap.val() || {}).length : 0;
    console.log(`Found ${count} responses to delete`);
    await ticketResponsesRef(ticketId).remove();
    
    // Reset response count on ticket
    await ticketRef(ticketId).update({
      responsesCount: 0,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`Successfully cleared ${count} responses for ticket: ${ticketId}`);
    
    return res.json({ 
      success: true, 
      message: `Successfully cleared ${count} responses`
    });
  } catch (error) {
    console.error('Clear responses error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
