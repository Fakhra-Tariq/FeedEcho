const express = require('express');
const { db, admin } = require('../config/firebase');
const ActiveSessionManager = require('../utils/ActiveSessionManager');
const sessionManager = require('../utils/sessionManager');
const { endActiveActivityForSession } = require('../utils/endSessionActiveActivity');
const { reconcileTeacherActiveSessions, repairActiveSessionSingleton } = require('../utils/sessionStatusReconcile');
const { saveStudentParticipation } = require('../utils/spaceRaceResourceArchive');
const { normalizeQuizRecord } = require('../utils/quizNormalization');
const {
  resolveActivityKind,
  resolveActivityId,
} = require('../utils/teacherSessionGuard');
const { writeLaunchParticipant, closeActiveQuizLaunch } = require('../utils/quizLaunches');
const router = express.Router();

// ERD-aligned RTDB paths
const quizRef = (id) => db.ref(`quizzes/${id}`);
const quizParticipantsRef = (id) => db.ref(`quiz_participants/${id}`);
const quizCodeRef = (code) => db.ref(`quiz_codes/${String(code).toUpperCase()}`);

const raceRef = (id) => db.ref(`spaceRaces/${id}`);
const raceParticipantsRef = (id) => db.ref(`space_race_participants/${id}`);

const incrementStandaloneSessionParticipants = async (standaloneSessionId) => {
  if (!standaloneSessionId) return;
  await db
    .ref(`sessions/${standaloneSessionId}/participants`)
    .transaction((cur) => Number(cur || 0) + 1);
};
const raceCodeRef = (code) => db.ref(`space_race_codes/${String(code).toUpperCase()}`);
const ticketRef = (id) => db.ref(`exit_tickets/${id}`);
const ticketCodeRef = (code) => db.ref(`exit_ticket_codes/${String(code).toUpperCase()}`);
const chatSessionRef = (id) => db.ref(`chat_sessions/${id}`);
const chatCodeRef = (code) => db.ref(`chat_join_codes/${String(code).toUpperCase()}`);

const generateJoinCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  if (normalized === 'student-choice') return 'student-choice';
  return 'auto-assign';
}

// POST /api/sessions/join - Unified join session for both quizzes and space races
router.post('/join', async (req, res) => {
  try {
    console.log('🔍 Join session attempt:', req.body);
    
    const { name, code, teamId: requestedTeamId, studentUid, studentEmail } = req.body;
    
    if (!name || !code) {
      console.log('❌ Missing name or code');
      return res.status(400).json({ 
        success: false, 
        error: 'Name and code are required' 
      });
    }

    // Normalize code for case-insensitive comparison
    const normalizedCode = code.trim().toUpperCase();
    console.log('🔤 Normalized code:', normalizedCode);

    // Validate join code format
    if (normalizedCode.length !== 6) {
      console.log('Invalid code length:', normalizedCode.length);
      return res.status(400).json({
        success: false,
        message: 'Session code must be exactly 6 characters'
      });
    }

    // Resolve session by join code (per-teacher — not global singleton)
    let activeSession = null;

    const sessionCodeSnap = await db.ref(`session_codes/${normalizedCode}`).get();
    if (sessionCodeSnap.exists()) {
      const sessionId = sessionCodeSnap.val();
      const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
      if (sessionSnap.exists()) {
        const row = sessionSnap.val() || {};
        if (String(row.status || '').toLowerCase() === 'active') {
          activeSession = {
            type: 'session',
            sessionId,
            accessCode: normalizedCode,
            status: 'active',
            teacherId: row.teacherId,
          };
          console.log('Matched standalone session by code:', sessionId);
        }
      }
    }

    if (!activeSession) {
      const quizIdSnap = await quizCodeRef(normalizedCode).get();
      if (quizIdSnap.exists()) {
        activeSession = {
          type: 'quiz',
          sessionId: quizIdSnap.val(),
          accessCode: normalizedCode,
          status: 'active',
        };
        console.log('Matched quiz by code:', activeSession.sessionId);
      }
    }

    if (!activeSession) {
      const raceIdSnap = await raceCodeRef(normalizedCode).get();
      if (raceIdSnap.exists()) {
        activeSession = {
          type: 'spaceRace',
          sessionId: raceIdSnap.val(),
          accessCode: normalizedCode,
          status: 'active',
        };
        console.log('Matched space race by code:', activeSession.sessionId);
      }
    }

    if (!activeSession) {
      console.log('No session matched code:', normalizedCode);
      return res.status(404).json({
        success: false,
        error: 'Invalid session code',
        message: 'Invalid or expired session code'
      });
    }

    const activeCode = normalizedCode;
    console.log('Active session matched by code:', activeSession);

    let effectiveSession = activeSession;
    const standaloneSessionId =
      activeSession?.type === 'session' ? activeSession.sessionId : null;

    // Standalone teacher session: resolve the launched activity linked to this code
    if (activeSession.type === 'session') {
      const sessionSnap = await db.ref(`sessions/${activeSession.sessionId}`).get();
      if (!sessionSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: 'Session not found. Please ask your teacher to create a new session.'
        });
      }

      const standalone = sessionSnap.val() || {};
      const kind = resolveActivityKind(standalone.currentActivity);
      const preferredActivityId = resolveActivityId(standalone.currentActivity);

      if (!kind) {
        return res.status(404).json({
          success: false,
          error: 'No activity launched',
          message: 'No activity has been launched for this session yet. Please wait for your teacher to start an activity.'
        });
      }

      if (kind === 'quiz') {
        let quizId = preferredActivityId;
        if (!quizId) {
          const quizIdSnap = await quizCodeRef(activeCode).get();
          quizId = quizIdSnap.exists() ? quizIdSnap.val() : null;
        }
        if (!quizId) {
          return res.status(404).json({
            success: false,
            error: 'Quiz not found',
            message: 'Quiz is not active for this session code'
          });
        }
        effectiveSession = {
          type: 'quiz',
          sessionId: quizId,
          accessCode: activeCode,
          status: 'active',
        };
      } else if (kind === 'spacerace') {
        let raceId = preferredActivityId;
        if (!raceId) {
          const raceIdSnap = await raceCodeRef(activeCode).get();
          raceId = raceIdSnap.exists() ? raceIdSnap.val() : null;
        }
        if (!raceId) {
          return res.status(404).json({
            success: false,
            error: 'Space race not found',
            message: 'Space race is not active for this session code'
          });
        }
        effectiveSession = {
          type: 'spaceRace',
          sessionId: raceId,
          accessCode: activeCode,
          status: 'active',
        };
      } else if (kind === 'exitticket') {
        let ticketId = preferredActivityId;
        if (!ticketId) {
          const ticketIdSnap = await ticketCodeRef(activeCode).get();
          ticketId = ticketIdSnap.exists() ? ticketIdSnap.val() : null;
        }
        if (!ticketId) {
          return res.status(404).json({
            success: false,
            error: 'Exit ticket not found',
            message: 'Exit ticket is not active for this session code',
          });
        }
        const ticketSnap = await ticketRef(ticketId).get();
        if (!ticketSnap.exists()) {
          return res.status(404).json({
            success: false,
            error: 'Exit ticket not found',
            message: 'Exit ticket is not active for this session code',
          });
        }
        const ticket = ticketSnap.val() || {};
        const ticketStatus = String(ticket.status || '').toLowerCase();
        if (!['active', 'live', 'started'].includes(ticketStatus)) {
          return res.status(404).json({
            success: false,
            error: 'Exit ticket is not active',
            message: 'Exit ticket is not active',
          });
        }
        if (standaloneSessionId) {
          await incrementStandaloneSessionParticipants(standaloneSessionId);
        }
        return res.json({
          success: true,
          type: 'exitTicket',
          ticketId,
          joinCode: activeCode,
          data: { id: ticketId, ...ticket, joinCode: activeCode },
          message: 'Joined exit ticket session',
        });
      } else if (kind === 'livechat') {
        let chatId = preferredActivityId;
        if (!chatId) {
          const chatIdSnap = await chatCodeRef(activeCode).get();
          chatId = chatIdSnap.exists() ? chatIdSnap.val() : null;
        }
        if (!chatId) {
          return res.status(404).json({
            success: false,
            error: 'Live chat not found',
            message: 'Live chat is not active for this session code',
          });
        }
        const chatSnap = await chatSessionRef(chatId).get();
        if (!chatSnap.exists()) {
          return res.status(404).json({
            success: false,
            error: 'Live chat not found',
            message: 'Live chat is not active for this session code',
          });
        }
        const chat = chatSnap.val() || {};
        const chatLive =
          chat.isActive === true || String(chat.status || '').toLowerCase() === 'active';
        if (!chatLive) {
          return res.status(404).json({
            success: false,
            error: 'Live chat is not active',
            message: 'Live chat is not active',
          });
        }
        if (standaloneSessionId) {
          await incrementStandaloneSessionParticipants(standaloneSessionId);
        }
        return res.json({
          success: true,
          type: 'liveChat',
          chatId,
          joinCode: activeCode,
          data: { id: chatId, ...chat, joinCode: activeCode },
          message: 'Joined live chat session',
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Unsupported activity',
          message: 'Unsupported activity type for this session'
        });
      }

      console.log('Resolved standalone session to activity:', effectiveSession);
    }

    // Handle active Space Race session
    if (effectiveSession.type === 'spaceRace') {
      const raceSnap = await raceRef(effectiveSession.sessionId).get();
      if (!raceSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'Space race not found',
          message: 'Space race not found'
        });
      }

      const race = raceSnap.val() || {};
      const raceStatus = typeof race.status === 'string' ? race.status.toLowerCase() : race.status;

      if (raceStatus !== 'active') {
        return res.status(404).json({
          success: false,
          error: 'Space race is not active',
          message: 'Space race is not active'
        });
      }

      const trimmedName = name.trim();

      // Check for duplicate participant
      const existingParticipantsSnap = await raceParticipantsRef(effectiveSession.sessionId).get();
      if (existingParticipantsSnap.exists()) {
        const existing = existingParticipantsSnap.val() || {};
        const dup = Object.values(existing).some((p) => p && p.name === trimmedName);
        if (dup) {
        console.log('Duplicate participant name:', trimmedName);
        return res.status(400).json({
          success: false,
          message: 'Participant with this name already exists'
        });
      }
      }

      // Auto-assign team
      const numberOfTeams = race.settings?.numberOfTeams || 2;
      let assignedTeamId = null;
      const teamAssignmentMode = normalizeTeamAssignment(race.settings?.teamAssignment);

      if (teamAssignmentMode === 'auto-assign') {
        const teamCounts = {};
        for (let i = 1; i <= numberOfTeams; i += 1) {
          teamCounts[i] = 0;
        }

        const allSnap = await raceParticipantsRef(effectiveSession.sessionId).get();
        if (allSnap.exists()) {
          const existing = allSnap.val() || {};
          Object.values(existing).forEach((participant) => {
            if (participant && participant.teamId) {
              teamCounts[participant.teamId] = (teamCounts[participant.teamId] || 0) + 1;
            }
          });
        }

        let minCount = Infinity;
        for (let teamId = 1; teamId <= numberOfTeams; teamId += 1) {
          if (teamCounts[teamId] < minCount) {
            minCount = teamCounts[teamId];
            assignedTeamId = teamId;
          }
        }

        // If all teams have equal count (minCount is still Infinity), assign to first team
        if (assignedTeamId === null) {
          assignedTeamId = 1;
        }

        // Validate that assignedTeamId is within allowed range (1 to numberOfTeams)
        if (assignedTeamId > numberOfTeams) {
          assignedTeamId = 1; // Fallback to first team if somehow assigned to invalid team
        }

        console.log('Auto-assigned team:', { teamCounts, assignedTeamId });
      } else if (teamAssignmentMode === 'student-choice') {
        if (requestedTeamId === undefined || requestedTeamId === null || requestedTeamId === '') {
          return res.status(200).json({
            success: false,
            needsTeamSelection: true,
            type: 'spaceRace',
            raceId: effectiveSession.sessionId,
            data: {
              id: effectiveSession.sessionId,
              ...race,
              quizId: race.quizId,
            },
            message: 'Please select a team before joining',
          });
        }

        assignedTeamId = parseInt(requestedTeamId, 10);
        if (!Number.isFinite(assignedTeamId) || assignedTeamId < 1 || assignedTeamId > numberOfTeams) {
          return res.status(400).json({
            success: false,
            message: 'Invalid team selection',
          });
        }

        const maxStudentsPerTeam = race.settings?.studentsPerTeam || 5;
        let teamMemberCount = 0;
        if (existingParticipantsSnap.exists()) {
          const existing = existingParticipantsSnap.val() || {};
          teamMemberCount = Object.values(existing).filter(
            (p) => p && String(p.teamId) === String(assignedTeamId)
          ).length;
        }

        // Allow joining even if team is full - let the client handle UI feedback
        // This ensures students can always join and proceed to quiz
        console.log('Student chose team:', assignedTeamId, `Current members: ${teamMemberCount}/${maxStudentsPerTeam}`);
      } else {
        assignedTeamId = 1;
      }

      // Create participant document
      const participantId = db.ref(`space_race_participants/${effectiveSession.sessionId}`).push().key;

      const participant = {
        id: participantId,
        name: trimmedName,
        joinedAt: new Date().toISOString(),
        score: 0,
        teamId: assignedTeamId,
        ...(studentUid ? { studentUid } : {}),
        ...(studentEmail ? { studentEmail } : {}),
      };

      await raceParticipantsRef(effectiveSession.sessionId).child(participantId).set(participant);

      if (standaloneSessionId) {
        await incrementStandaloneSessionParticipants(standaloneSessionId);
      }

      try {
        await saveStudentParticipation({
          raceId: effectiveSession.sessionId,
          teamId: assignedTeamId,
          participantId,
          studentName: trimmedName,
          race,
          studentUid,
          studentEmail,
        });
      } catch (historyError) {
        console.error('⚠️ Failed to save student participation history:', historyError);
      }

      // Update participant count
      await db.ref(`spaceRaces/${effectiveSession.sessionId}/participantsCount`)
        .transaction((cur) => Number(cur || 0) + 1);

      console.log('Participant joined Space Race successfully:', {
        participantId,
        name: trimmedName,
        teamId: assignedTeamId
      });

      // Fetch quiz details - prefer quiz data attached to race, fallback to quizId lookup
      let quizData = null;
      if (race.quiz && race.quiz.questions && Array.isArray(race.quiz.questions)) {
        // Use quiz data already attached to race
        quizData = race.quiz;
        console.log('✅ Using quiz data attached to race:', { title: quizData.title, questionCount: quizData.questions?.length });
      } else if (race.quizId) {
        console.log('🔍 Fetching quiz data for quizId:', race.quizId);
        const qSnap = await quizRef(race.quizId).get();
        if (qSnap.exists()) {
          quizData = qSnap.val();
          console.log('✅ Quiz data found:', { title: quizData.title, questionCount: quizData.questions?.length });
        } else {
          console.log('❌ Quiz not found with ID:', race.quizId);
        }
      } else {
        console.log('❌ No quizId or quiz data found in race data');
      }

      // Add launchSettings to quiz data for timer functionality and shuffle settings
      const resolvedQuizId = race.quizId || null;
      const quizWithLaunchSettings = quizData && quizData.questions && Array.isArray(quizData.questions)
        ? {
            ...quizData,
            id: resolvedQuizId,
            launched: true,
            launchSettings: {
              ...(quizData.launchSettings || {}),
              timeLimit: Math.round((race.settings?.countdown || 300) / 60), // Quiz duration in minutes
              // Quiz duration only — never fall back to settings.timerSeconds (join/waiting duration)
              countdown: race.settings?.countdown || 300,
              endTime: race.endTime?.toDate?.() ? race.endTime.toDate().toISOString() : null, // Only set endTime if quiz has started
              spaceRaceSettings: {
                shuffleQuestions: race.settings?.shuffleQuestions ?? false,
                shuffleAnswers: race.settings?.shuffleAnswers ?? false,
                requireNames: race.settings?.requireNames ?? false,
                showQuestionFeedback: race.settings?.showQuestionFeedback ?? false,
                showFinalScore: race.settings?.showFinalScore ?? true,
                oneAttempt: race.settings?.oneAttempt ?? false,
              }
            },
          }
        : null;

      const racePayload = {
        id: effectiveSession.sessionId,
        ...race,
        quizId: quizWithLaunchSettings ? resolvedQuizId : null,
        quiz: quizWithLaunchSettings,
        endTime: race.endTime,
        timerSeconds: race.timerSeconds,
        timerMinutes: race.timerMinutes,
      };

      // Generate themed team assignment alert
      const teamAssignmentAlert = `🚀 Team Assignment: You've been assigned to Team ${assignedTeamId}!`;
      console.log(teamAssignmentAlert);

      return res.json({
        success: true,
        type: 'spaceRace',
        raceId: effectiveSession.sessionId,
        quizId: resolvedQuizId,
        participantId,
        teamId: assignedTeamId,
        data: racePayload,
        message: teamAssignmentAlert
      });
    }

    // Handle active Quiz session
    if (effectiveSession.type === 'quiz') {
      const quizSnap = await quizRef(effectiveSession.sessionId).get();
      if (!quizSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: 'Quiz not found'
        });
      }

      const quiz = quizSnap.val() || {};
      const quizStatus = typeof quiz.status === 'string' ? quiz.status.toLowerCase() : quiz.status;
      const isLaunched = !!quiz.launched;

      if (!isLaunched || (quizStatus !== 'active' && quizStatus !== 'launched')) {
        return res.status(404).json({
          success: false,
          error: 'Quiz is not active',
          message: 'Quiz is not active'
        });
      }

      if (!quiz.title || !quiz.launchSettings?.accessCode) {
        console.error('Quiz missing required data:', {
          title: quiz.title,
          accessCode: quiz.launchSettings?.accessCode
        });
        return res.status(500).json({
          success: false,
          error: 'Quiz data is incomplete',
          message: 'Quiz data is incomplete'
        });
      }

      const launchSettings = quiz.launchSettings || {};
      const currentLaunchId = quiz.currentLaunchId || null;
      if (launchSettings.endTime) {
        const endMs = new Date(launchSettings.endTime).getTime();
        if (!Number.isNaN(endMs) && Date.now() > endMs) {
          return res.status(400).json({
            success: false,
            error: 'Quiz is no longer accepting participants',
            message: 'This quiz is no longer joinable.',
          });
        }
      }

      const trimmedName = name.trim();

      if (launchSettings.oneAttempt) {
        const launchScoped = currentLaunchId
          ? await db.ref(`quiz_launch_submissions/${effectiveSession.sessionId}/${currentLaunchId}`).get()
          : null;
        const subsSnap =
          launchScoped && launchScoped.exists()
            ? launchScoped
            : await db.ref(`quiz_submissions/${effectiveSession.sessionId}`).get();
        if (subsSnap.exists()) {
          const subs = subsSnap.val() || {};
          const alreadySubmitted = Object.values(subs).some((row) => {
            if (!row || typeof row !== 'object') return false;
            if (!currentLaunchId && row.launchId) return false;
            if (currentLaunchId && row.launchId && String(row.launchId) !== String(currentLaunchId)) {
              return false;
            }
            if (studentUid && row.studentUid && String(row.studentUid) === String(studentUid)) {
              return true;
            }
            if (studentEmail && row.studentEmail && String(row.studentEmail) === String(studentEmail)) {
              return true;
            }
            return row.studentName && String(row.studentName).trim() === trimmedName;
          });
          if (alreadySubmitted) {
            return res.status(400).json({
              success: false,
              error: 'You have already completed this quiz',
              message: 'You have already completed this quiz.',
            });
          }
        }
      }

      // Create participant document
      const participantId = db.ref(`quiz_participants/${effectiveSession.sessionId}`).push().key;

      const participant = {
        id: participantId,
        name: trimmedName,
        joinedAt: new Date().toISOString(),
        score: 0,
        quizId: effectiveSession.sessionId,
        ...(currentLaunchId ? { launchId: currentLaunchId } : {}),
        ...(studentUid ? { studentUid } : {}),
        ...(studentEmail ? { studentEmail } : {}),
      };

      await quizParticipantsRef(effectiveSession.sessionId).child(participantId).set(participant);
      if (currentLaunchId) {
        await writeLaunchParticipant(
          effectiveSession.sessionId,
          currentLaunchId,
          participantId,
          participant
        );
      }

      if (standaloneSessionId) {
        await incrementStandaloneSessionParticipants(standaloneSessionId);
      }

      // Update participant count
      await db.ref(`quizzes/${effectiveSession.sessionId}/participantsCount`)
        .transaction((cur) => Number(cur || 0) + 1);

      console.log('Participant joined Quiz successfully:', {
        participantId,
        name: trimmedName
      });

      const quizPayload = normalizeQuizRecord({
        id: effectiveSession.sessionId,
        title: quiz.title,
        type: quiz.type || 'Multiple Choice',
        description: quiz.description || '',
        questions: quiz.questions,
        questionCount: quiz.questionCount,
        timer: quiz.timer || null,
        launchSettings: quiz.launchSettings || null,
        status: quizStatus,
        launched: true,
      });

      return res.json({
        success: true,
        type: 'quiz',
        quizId: effectiveSession.sessionId,
        participantId,
        data: quizPayload
      });
    }

    // Unknown or unsupported session type
    console.log('Unsupported active session type:', effectiveSession.type);
    return res.status(400).json({
      success: false,
      message: 'Unsupported session type'
    });
  } catch (error) {
    console.error('Error joining session:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET /api/sessions/code/:code - Find session by code (for validation)
router.get('/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    // Convert to uppercase for case-insensitive matching
    const normalizedCode = code.toUpperCase();
    
    // Validate join code format
    if (normalizedCode.length !== 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Session code must be exactly 6 characters' 
      });
    }
    
    console.log('Looking for session with code:', normalizedCode);
    
    // First try Space Race (index lookup)
    const raceIdSnap = await raceCodeRef(normalizedCode).get();
    if (raceIdSnap.exists()) {
      const raceId = raceIdSnap.val();
      const rSnap = await raceRef(raceId).get();
      const raceData = rSnap.exists() ? ({ id: raceId, ...(rSnap.val() || {}) }) : null;
      if (raceData && String(raceData.status || '').toLowerCase() === 'active') {
      
      console.log('Found active Space Race:', { 
        raceId: raceData.id, 
        joinCode: raceData.joinCode || raceData.accessCode, 
        status: raceData.status
      });
      
      return res.json({
        success: true,
        type: 'spaceRace',
        data: raceData
      });
    }
    }
    
    // Then try Quiz
    console.log('Looking for Quiz with code:', normalizedCode);
    
    const quizIdSnap = await quizCodeRef(normalizedCode).get();
    if (quizIdSnap.exists()) {
      const quizId = quizIdSnap.val();
      const qSnap = await quizRef(quizId).get();
      const quizData = qSnap.exists() ? ({ id: quizId, ...(qSnap.val() || {}) }) : null;
      if (quizData) {
      
      console.log('Found active Quiz:', { 
        quizId: quizData.id, 
        accessCode: quizData.launchSettings.accessCode, 
        status: quizData.status
      });
      
      return res.json({
        success: true,
        type: 'quiz',
        data: quizData
      });
    }
    }
    
    // No session found
    console.log('No active session found for code:', normalizedCode);
    return res.status(404).json({ 
      success: false, 
      message: 'Invalid or inactive session code' 
    });
    
  } catch (error) {
    console.error('Error finding session by code:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// GET /api/sessions/debug - Debug endpoint to see all active sessions
router.get('/debug', async (req, res) => {
  try {
    console.log('Debug: Fetching all active sessions...');
    
    // Get all active quizzes
    const quizzesSnap = await db.ref('quizzes').get();
    const activeQuizzes = [];
    
    const allQuizzes = quizzesSnap.exists() ? (quizzesSnap.val() || {}) : {};
    Object.entries(allQuizzes).forEach(([id, quiz]) => {
      // Only include quizzes that are both launched AND have active status
      if (quiz.launched && quiz.launchSettings?.accessCode && (quiz.status === 'active' || quiz.status === 'launched' || quiz.status === 'Active')) {
        activeQuizzes.push({
          id,
          title: quiz.title,
          accessCode: quiz.launchSettings.accessCode,
          status: quiz.status,
          launched: quiz.launched,
          launchedAt: quiz.launchSettings.launchedAt
        });
      }
    });
    
    // Get all active space races
    const racesSnap = await db.ref('spaceRaces').get();
    const activeRaces = [];
    
    const allRaces = racesSnap.exists() ? (racesSnap.val() || {}) : {};
    Object.entries(allRaces).forEach(([id, race]) => {
      if (race.status === 'active' && race.joinCode) {
        activeRaces.push({
          id,
          title: race.title || 'Space Race',
          joinCode: race.joinCode,
          status: race.status
        });
      }
    });
    
    console.log('Debug results:', { activeQuizzes, activeRaces });
    
    return res.json({
      success: true,
      data: {
        activeQuizzes,
        activeRaces,
        totalQuizzes: Object.keys(allQuizzes).length,
        totalRaces: Object.keys(allRaces).length
      }
    });
    
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// POST /api/sessions/finish - Unified finish session endpoint
router.post('/finish', async (req, res) => {
  try {
    const activeSession = await ActiveSessionManager.getActiveSession();
    
    if (!activeSession) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active session found' 
      });
    }
    
    console.log('Finishing active session:', activeSession);
    
    if (activeSession.type === 'quiz') {
      // Finish quiz
      const qSnap = await quizRef(activeSession.sessionId).get();
      const quizData = qSnap.exists() ? qSnap.val() || {} : {};
      const code = quizData?.launchSettings?.accessCode || null;
      const now = new Date().toISOString();
      await closeActiveQuizLaunch(activeSession.sessionId, quizData, now);
      await quizRef(activeSession.sessionId).update({
        status: 'ready',
        launched: false,
        launchSettings: null,
        currentLaunchId: null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      if (code) await quizCodeRef(code).remove();
    } else if (activeSession.type === 'spaceRace') {
      // Finish space race
      const rSnap = await raceRef(activeSession.sessionId).get();
      const code = rSnap.exists() ? (rSnap.val()?.joinCode || rSnap.val()?.accessCode) : null;
      await raceRef(activeSession.sessionId).update({
        status: 'draft',
        isPaused: false,
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      if (code) await raceCodeRef(code).remove();
    }
    
    // Delete global active session
    await ActiveSessionManager.deleteActiveSession();
    
    return res.json({
      success: true,
      message: `${activeSession.type} finished successfully`
    });
    
  } catch (error) {
    console.error('Error finishing session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
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

// POST /api/sessions/create - Create a standalone session
router.post('/create', async (req, res) => {
  try {
    const { sessionName, teacherId } = req.body;
    
    if (!sessionName || !teacherId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session name and teacher ID are required' 
      });
    }
    
    await reconcileTeacherActiveSessions(teacherId);

    // Only block if THIS teacher already has an active session
    const allSnap = await db.ref('sessions').get();
    if (allSnap.exists()) {
      const teacherHasActive = Object.values(allSnap.val() || {}).some(
        (row) =>
          row &&
          row.teacherId === teacherId &&
          String(row.status || '').toLowerCase() === 'active'
      );
      if (teacherHasActive) {
        return res.status(400).json({
          success: false,
          error: 'You already have an active session. End it before creating a new one.',
        });
      }
    }
    
    // Generate unique 6-character code
    const sessionCode = generateJoinCode();
    
    // Check if code already exists
    const existingCodeSnap = await db.ref(`session_codes/${sessionCode}`).get();
    if (existingCodeSnap.exists()) {
      // Try again with a new code
      return res.status(500).json({ 
        success: false, 
        error: 'Could not generate unique code, please try again' 
      });
    }
    
    // Create session
    const sessionId = db.ref('sessions').push().key;
    const sessionData = {
      id: sessionId,
      sessionName,
      sessionCode,
      teacherId,
      status: 'active',
      currentActivity: null,
      activityHistory: {},
      createdAt: new Date().toISOString(),
      participants: 0
    };
    
    // Save session
    await db.ref(`sessions/${sessionId}`).set(sessionData);
    
    // Save code index for quick lookup
    await db.ref(`session_codes/${sessionCode}`).set(sessionId);
    
    // Set as active session in singleton
    await sessionManager.createActiveSession({
      sessionId,
      type: 'session',
      accessCode: sessionCode,
      teacherId,
      status: 'active',
      createdAt: sessionData.createdAt,
    });
    
    console.log('✅ Session created:', { sessionId, sessionCode, sessionName });
    
    return res.json({
      success: true,
      data: sessionData
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

function parseSessionActivityHistory(session) {
  const raw = session?.activityHistory;
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw)
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) =>
      String(b.launchedAt || '').localeCompare(String(a.launchedAt || ''))
    );
}

// GET /api/sessions/teacher/:teacherId - All sessions for a teacher (active + ended)
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'Teacher ID is required' });
    }

    await reconcileTeacherActiveSessions(teacherId);

    const sessions = [];
    let snap;

    try {
      snap = await db.ref('sessions').orderByChild('teacherId').equalTo(teacherId).get();
    } catch (queryError) {
      console.warn('teacherId index query failed, falling back to full scan:', queryError.message);
      snap = await db.ref('sessions').get();
    }

    if (snap.exists()) {
      const raw = snap.val() || {};
      Object.entries(raw).forEach(([id, value]) => {
        if (!value || value.teacherId !== teacherId) return;
        sessions.push({
          ...value,
          id: value.id || id,
          activities: parseSessionActivityHistory(value),
        });
      });
    }

    sessions.sort((a, b) => {
      const aActive = String(a.status || '').toLowerCase() === 'active';
      const bActive = String(b.status || '').toLowerCase() === 'active';
      if (aActive !== bActive) return aActive ? -1 : 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    return res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error listing teacher sessions:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/sessions/:sessionId - Permanently delete an ended session
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { teacherId } = req.query;

    const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const session = sessionSnap.val() || {};

    if (teacherId && session.teacherId !== teacherId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (String(session.status || '').toLowerCase() !== 'ended') {
      return res.status(400).json({
        success: false,
        error: 'Only ended sessions can be deleted',
      });
    }

    if (session.sessionCode) {
      await db.ref(`session_codes/${String(session.sessionCode).toUpperCase()}`).remove();
    }

    await db.ref(`sessions/${sessionId}`).remove();

    console.log('✅ Session deleted:', sessionId);

    return res.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sessions/:sessionId/end - End a standalone session
router.post('/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get session
    const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists()) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    const session = { ...sessionSnap.val(), id: sessionId };

    // End active activity first (quiz, space race, exit ticket, or live chat)
    const activityResult = await endActiveActivityForSession(session);
    if (activityResult.ended) {
      console.log('✅ Active activity ended before session:', activityResult);
    }

    // Then end the session
    await db.ref(`sessions/${sessionId}`).update({
      status: 'ended',
      currentActivity: null,
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    
    // Remove code index
    if (session.sessionCode) {
      await db.ref(`session_codes/${session.sessionCode}`).remove();
    }
    
    // Clear active session singleton
    await sessionManager.clearActiveSession();

    if (session.teacherId) {
      await reconcileTeacherActiveSessions(session.teacherId);
    }
    
    console.log('✅ Session ended:', sessionId);
    
    return res.json({
      success: true,
      message: 'Session ended successfully'
    });
    
  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/sessions/active - Get current active session (repairs singleton if needed)
router.get('/active', async (req, res) => {
  try {
    const { teacherId } = req.query;
    await repairActiveSessionSingleton(teacherId || null);

    const activeSession = await sessionManager.getActiveSession();
    
    if (!activeSession || String(activeSession.status || '').toLowerCase() !== 'active') {
      return res.json({ 
        success: true, 
        data: null 
      });
    }
    
    if (activeSession.type === 'session') {
      const sessionSnap = await db.ref(`sessions/${activeSession.sessionId}`).get();
      if (sessionSnap.exists()) {
        const session = sessionSnap.val();
        if (teacherId && session.teacherId && session.teacherId !== teacherId) {
          const repair = await repairActiveSessionSingleton(teacherId);
          if (repair.sessionId) {
            const repairedSnap = await db.ref(`sessions/${repair.sessionId}`).get();
            if (repairedSnap.exists()) {
              const repairedSession = repairedSnap.val();
              return res.json({
                success: true,
                data: {
                  ...repairedSession,
                  id: repairedSession.id || repair.sessionId,
                  sessionCode: repairedSession.sessionCode,
                },
              });
            }
          }
          return res.json({ success: true, data: null });
        }
        return res.json({ 
          success: true, 
          data: {
            ...session,
            id: session.id || activeSession.sessionId,
            sessionCode: session.sessionCode || activeSession.accessCode,
          }
        });
      }
    }

    // Quiz or space race singleton — scope to requesting teacher when possible
    if (teacherId && activeSession.type === 'quiz') {
      const quizSnap = await quizRef(activeSession.sessionId).get();
      if (quizSnap.exists()) {
        const quiz = quizSnap.val() || {};
        if (quiz.createdBy && quiz.createdBy !== teacherId) {
          return res.json({ success: true, data: null });
        }
      }
    }

    if (teacherId && activeSession.type === 'spaceRace') {
      const raceSnap = await raceRef(activeSession.sessionId).get();
      if (raceSnap.exists()) {
        const race = raceSnap.val() || {};
        if (race.createdBy && race.createdBy !== teacherId) {
          return res.json({ success: true, data: null });
        }
      }
    }
    
    return res.json({ 
      success: true, 
      data: activeSession 
    });
    
  } catch (error) {
    console.error('Error getting active session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Public debug endpoint to check all quizzes
router.get('/debug/all-quizzes', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking all quizzes...');
    const snap = await db.ref('quizzes').get();
    const allQuizzes = [];
    
    const raw = snap.exists() ? (snap.val() || {}) : {};
    Object.entries(raw).forEach(([id, quizData]) => {
      allQuizzes.push({
        id,
        title: quizData?.title,
        createdBy: quizData?.createdBy,
        status: quizData?.status,
        deletedAt: quizData?.deletedAt,
        launched: quizData?.launched,
        accessCode: quizData?.launchSettings?.accessCode
      });
    });
    
    console.log('🔍 DEBUG: Found', allQuizzes.length, 'quizzes');
    allQuizzes.forEach(q => {
      console.log(`📝 ${q.title} - Status: ${q.status}, Launched: ${q.launched}, Code: ${q.accessCode || 'None'}`);
    });
    
    return res.json({ success: true, data: allQuizzes });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
