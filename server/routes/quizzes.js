const express = require('express');
const { db } = require('../config/firebase');
const { verifyFirebaseToken, checkRole } = require('../middleware/auth');
const { generateSessionCode } = require('../utils/sessionCodeGenerator');
const ActiveSessionManager = require('../utils/ActiveSessionManager');
const {
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearActivityFromActiveSession,
  clearSessionCurrentActivity,
  appendSessionActivityHistory,
} = require('../utils/teacherSessionGuard');
const { normalizeQuestionsForScoring } = require('../utils/scoringUtils');
const { validateGenerateAiQuizBody, generateQuizWithAi } = require('../utils/generateAiQuiz');
const { normalizeQuizRecord, normalizeQuizListRecord } = require('../utils/quizNormalization');
const router = express.Router();

const generateId = (prefix = 'quiz') =>
  `${prefix}-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

// ERD-aligned RTDB paths
const quizRef = (id) => db.ref(`quizzes/${id}`);
const quizzesRef = () => db.ref('quizzes');
const quizCodeRef = (code) => db.ref(`quiz_codes/${String(code).toUpperCase()}`); // accessCode -> quizId

// Get quiz by access code (NO AUTH - for students joining a session)
router.get('/code/:accessCode', async (req, res) => {
  try {
    const code = req.params.accessCode.toUpperCase();
    const idSnap = await quizCodeRef(code).get();
    if (!idSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Invalid or expired session code' });
    }
    const id = idSnap.val();
    const snap = await quizRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Invalid or expired session code' });
    }
    const data = snap.val() || {};

    const status = typeof data.status === 'string' ? data.status.toLowerCase() : data.status;
    if (data.launched !== true || !['active', 'launched'].includes(status)) {
      return res.status(404).json({ success: false, error: 'Invalid or expired session code' });
    }
    // Don't expose createdBy or other teacher-only fields to students
    const safe = {
      id,
      title: data.title,
      description: data.description,
      type: data.type,
      questions: data.questions,
      questionCount: data.questionCount,
      timer: data.timer,
      launchSettings: data.launchSettings,
      status: data.status,
    };
    return res.json({ success: true, data: safe });
  } catch (error) {
    console.error('Get quiz by code error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// All routes below require auth and teacher role
router.use(verifyFirebaseToken);
router.use(checkRole(['teacher', 'admin']));

const generateAiQuizHandler = async (req, res) => {
  try {
    const validation = validateGenerateAiQuizBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join('; '),
        errors: validation.errors,
      });
    }

    const result = await generateQuizWithAi({
      prompt: validation.prompt,
      questionTypes: validation.questionTypes,
      difficulty: validation.difficulty,
      numberOfQuestions: validation.numberOfQuestions,
    });

    if (result.kind === 'refusal') {
      return res.status(200).json({
        success: true,
        data: { message: result.message },
      });
    }

    const { kind, ...quiz } = result;
    return res.status(200).json({ success: true, data: quiz });
  } catch (error) {
    console.error('Generate AI quiz error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Failed to generate quiz with AI',
    });
  }
};

router.post('/generate-ai', generateAiQuizHandler);

const normalizeListStatus = (status) => {
  let normalizedStatus = status;
  if (normalizedStatus === null || normalizedStatus === undefined) {
    normalizedStatus = 'draft';
  }
  if (typeof normalizedStatus === 'string') {
    normalizedStatus = normalizedStatus.toLowerCase();
  }
  return normalizedStatus;
};

const mapTeacherQuizzes = (raw, targetUid) =>
  Object.entries(raw || {})
    .map(([id, q]) => ({ id, ...(q || {}) }))
    .filter((q) => q.createdBy === targetUid);

// List quizzes for current teacher
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { status, limit = 50, teacherUid, includeDeleted } = req.query;
    const targetUid = teacherUid || uid;
    const keepDeleted = includeDeleted === 'true' || includeDeleted === '1';

    let quizzes = [];
    try {
      const indexedSnap = await quizzesRef().orderByChild('createdBy').equalTo(targetUid).get();
      if (indexedSnap.exists()) {
        quizzes = mapTeacherQuizzes(indexedSnap.val(), targetUid);
      }
    } catch (indexError) {
      console.warn('Indexed quiz list failed, falling back to full scan:', indexError.message);
      const allSnap = await quizzesRef().get();
      quizzes = mapTeacherQuizzes(allSnap.exists() ? allSnap.val() : {}, targetUid);
    }

    if (status && status !== 'all') {
      quizzes = quizzes.filter((q) => q.status === status);
    }

    quizzes.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    const lim = Math.max(0, parseInt(limit, 10) || 0);
    if (lim) quizzes = quizzes.slice(0, lim);

    const filtered = [];
    quizzes.forEach((quizData) => {
      // Soft-deleted quizzes stay out of the library, but reports can request them
      if (quizData.deletedAt) {
        if (!keepDeleted) return;
        filtered.push(
          normalizeQuizListRecord({
            ...quizData,
            status: normalizeListStatus(quizData.status) || 'ended',
            deletedAt: quizData.deletedAt,
          })
        );
        return;
      }

      const normalizedStatus = normalizeListStatus(quizData.status);
      if (normalizedStatus === 'ended') return;

      filtered.push(
        normalizeQuizListRecord({
          ...quizData,
          status: normalizedStatus,
        })
      );
    });

    return res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('List quizzes error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create quiz
router.post('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const body = req.body;
    const id = body.id || generateId();
    const now = new Date().toISOString();
    
    // Normalize status to consistent values
    let normalizedStatus = body.status || 'draft';
    
    // Don't convert Ready to active - Ready should stay as ready
    if (normalizedStatus === 'Ended') {
      normalizedStatus = 'completed';
    } else {
      // Convert to lowercase for consistency
      normalizedStatus = normalizedStatus.toLowerCase();
    }
    
    console.log('Creating quiz with normalized status:', normalizedStatus, 'from input:', body.status);

    const quizType = body.type || 'Multiple Choice';
    const normalizedQuestions = normalizeQuestionsForScoring(body.questions || [], quizType);
    
    const quiz = {
      id,
      title: body.title || 'Untitled Quiz',
      description: body.description || '',
      type: quizType,
      status: normalizedStatus, // ✅ Use normalized status
      questionCount: body.questionCount ?? normalizedQuestions.length,
      questions: normalizedQuestions,
      timer: body.timer ?? null,
      createdBy: uid,
      createdAt: body.createdAt || now,
      updatedAt: now,
      launched: false,
      launchSettings: null,
      finishedAt: null,
      deletedAt: null,
    };

    if (body.source) {
      quiz.source = body.source;
    }
    
    console.log('Quiz to be created:', {
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      createdBy: quiz.createdBy
    });
    
    await quizRef(id).set(quiz);
    return res.status(201).json({ success: true, data: normalizeQuizRecord({ id, ...quiz }) });
  } catch (error) {
    console.error('Create quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get one quiz
router.get('/:id', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await quizRef(req.params.id).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Quiz not found' });
    const data = snap.val();
    if (data.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    return res.json({ success: true, data: normalizeQuizRecord({ id: req.params.id, ...data }) });
  } catch (error) {
    console.error('Get quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update quiz
router.put('/:id', async (req, res) => {
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    const snap = await quizRef(id).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Quiz not found' });
    const existing = snap.val();
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });

    const allowed = [
      'title', 'description', 'type', 'status', 'questionCount', 'questions', 'timer',
      'launched', 'launchSettings', 'finishedAt', 'source'
    ];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });
    if (Array.isArray(updates.questions)) {
      const quizType = updates.type || existing.type || 'Multiple Choice';
      updates.questions = normalizeQuestionsForScoring(updates.questions, quizType);
      if (updates.questionCount === undefined) {
        updates.questionCount = updates.questions.length;
      }
    }
    await quizRef(id).update(updates);
    const updated = await quizRef(id).get();
    return res.json({ success: true, data: normalizeQuizRecord({ id, ...(updated.val() || {}) }) });
  } catch (error) {
    console.error('Update quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Soft delete quiz
router.delete('/:id', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { permanent = false } = req.query; // Check if permanent delete requested
    
    const id = req.params.id;
    const snap = await quizRef(id).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Quiz not found' });
    const existing = snap.val();
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    
    const now = new Date().toISOString();
    
    if (permanent === 'true') {
      // Permanent delete still keeps quiz_submissions / quiz_participants intact.
      // Prefer soft-delete from the library so Reports can keep showing history.
      console.log('🗑️ Permanently deleting quiz record (submissions preserved):', req.params.id);
      const code = existing?.launchSettings?.accessCode;
      const updates = {
        [`quizzes/${id}`]: null,
      };
      if (code) updates[`quiz_codes/${String(code).toUpperCase()}`] = null;
      await db.ref().update(updates);
      return res.json({ success: true, message: 'Quiz permanently deleted' });
    } else {
      // Soft delete — remove from library / block future joins; keep attempts & reports
      console.log('📝 Soft deleting quiz (preserving submissions):', req.params.id);
      const code = existing?.launchSettings?.accessCode;
      const updates = {
        deletedAt: now,
        updatedAt: now,
        status: 'Ended',
        launched: false,
        launchSettings: null,
      };
      await quizRef(id).update(updates);
      if (code) await quizCodeRef(code).remove();
      return res.json({
        success: true,
        message: 'Quiz removed from library. Student attempts and reports are preserved.',
      });
    }
  } catch (error) {
    console.error('Delete quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Launch quiz
router.post('/:id/launch', async (req, res) => {
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    const snap = await quizRef(id).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Quiz not found' });
    const existing = snap.val();
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });

    const launchPrep = await prepareActivityLaunch('quiz');
    if (!launchPrep.ok) {
      return res.status(400).json({ success: false, error: launchPrep.error });
    }

    const {
      endTime,
      quizAvailabilityMinutes,
      timePerStudentMinutes,
      shuffleQuestions,
      shuffleAnswers,
      showFinalScore,
      oneAttempt,
    } = req.body;
    const joinCode = launchPrep.sessionCode;
    const now = new Date().toISOString();
    const availabilityMinutes = quizAvailabilityMinutes != null ? Number(quizAvailabilityMinutes) : null;
    const perStudentMinutes = timePerStudentMinutes != null ? Number(timePerStudentMinutes) : null;
    let resolvedEndTime = endTime || null;
    if (!resolvedEndTime && availabilityMinutes > 0) {
      resolvedEndTime = new Date(Date.now() + availabilityMinutes * 60 * 1000).toISOString();
    }
    const launchSettings = {
      accessCode: joinCode,
      endTime: resolvedEndTime,
      quizAvailabilityMinutes: availabilityMinutes > 0 ? availabilityMinutes : null,
      timePerStudentMinutes: perStudentMinutes > 0 ? perStudentMinutes : null,
      shuffleQuestions: Boolean(shuffleQuestions),
      shuffleAnswers: Boolean(shuffleAnswers),
      showFinalScore: showFinalScore !== false,
      oneAttempt: Boolean(oneAttempt),
      launchedAt: now,
    };
    
    // Same quiz already launched? Return existing data (no duplicate launch)
    const activeSession = await ActiveSessionManager.getActiveSession();
    if (activeSession?.status === 'active' && activeSession.type === 'quiz' && activeSession.sessionId === req.params.id) {
      const quizSnap = await quizRef(id).get();
      if (quizSnap.exists()) {
        const quizData = quizSnap.val();
        return res.status(200).json({
          success: true,
          data: { id, ...quizData, alreadyActive: true }
        });
      }
    }

    await quizRef(id).update({
      status: 'launched',
      launched: true,
      launchSettings,
      sessionCode: joinCode,
      updatedAt: now,
    });
    await setSessionCurrentActivity(launchPrep.sessionId, 'quiz');
    await quizCodeRef(joinCode).set(id);
    await appendSessionActivityHistory(launchPrep.sessionId, {
      type: 'quiz',
      name: existing.title || 'Quiz',
      activityId: id,
    });

    const updated = await quizRef(id).get();
    console.log('Quiz launched successfully:', {
      quizId: id,
      status: updated.val()?.status,
      launched: updated.val()?.launched,
      accessCode: updated.val()?.launchSettings?.accessCode,
      title: updated.val()?.title
    });
    return res.json({ success: true, data: { id, ...(updated.val() || {}) } });
  } catch (error) {
    console.error('Launch quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Finish quiz
router.post('/:id/finish', async (req, res) => {
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    const snap = await quizRef(id).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Quiz not found' });
    const existing = snap.val();
    if (existing.createdBy !== uid && req.userRole !== 'admin')
      return res.status(403).json({ success: false, error: 'Access denied' });
    const now = new Date().toISOString();

    const sessionCode = String(
      existing?.launchSettings?.accessCode || existing?.sessionCode || ''
    ).trim().toUpperCase();
    if (sessionCode.length === 6) {
      const sessionIdSnap = await db.ref(`session_codes/${sessionCode}`).get();
      if (sessionIdSnap.exists()) {
        await clearSessionCurrentActivity(sessionIdSnap.val());
      }
    }

    await clearActivityFromActiveSession();

    await quizRef(id).update({
      status: 'ready',
      launched: false,
      launchSettings: null,
      sessionCode: null,
      finishedAt: now,
      updatedAt: now,
    });
    // remove code index if any
    const code = existing?.launchSettings?.accessCode;
    if (code) await quizCodeRef(code).remove();
    const updated = await quizRef(id).get();
    return res.json({ success: true, data: { id, ...(updated.val() || {}) } });
  } catch (error) {
    console.error('Finish quiz error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Clear active session (public debug endpoint)
router.post('/clear-session-debug', async (req, res) => {
  try {
    console.log('🧹 Clearing active session via public debug endpoint...');
    await ActiveSessionManager.deleteActiveSession();
    return res.json({ 
      success: true, 
      message: 'Active session cleared successfully' 
    });
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Clear active session (debug endpoint)
router.post('/clear-session', async (req, res) => {
  try {
    console.log('🧹 Clearing active session via debug endpoint...');
    await ActiveSessionManager.deleteActiveSession();
    return res.json({ 
      success: true, 
      message: 'Active session cleared successfully' 
    });
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Debug endpoint to check all quizzes in database
router.get('/debug/all', async (req, res) => {
  try {
    const snap = await quizzesRef().get();
    const raw = snap.exists() ? (snap.val() || {}) : {};
    const allQuizzes = Object.entries(raw).map(([id, quizData]) => ({
      id,
      title: quizData?.title,
      createdBy: quizData?.createdBy,
      status: quizData?.status,
      deletedAt: quizData?.deletedAt,
      launched: quizData?.launched
    }));
    
    console.log('🔍 DEBUG: All quizzes in database:', allQuizzes.length);
    allQuizzes.forEach(q => {
      console.log(`📝 ${q.title} - Created by: ${q.createdBy}, Status: ${q.status}, Deleted: ${!!q.deletedAt}`);
    });
    
    return res.json({ success: true, data: allQuizzes });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.generateAiQuizHandler = generateAiQuizHandler;
