const express = require('express');
const { db, admin } = require('../config/firebase');
const { verifyFirebaseToken, checkRole } = require('../middleware/auth');
const ActiveSessionManager = require('../utils/ActiveSessionManager');
const sessionManager = require('../utils/sessionManager');
const { scoreAnswerInBackend } = require('../utils/scoringUtils');
const {
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearActivityFromActiveSession,
  appendSessionActivityHistory,
} = require('../utils/teacherSessionGuard');
const {
  archiveSharedResource,
  getStudentHistory,
  getSharedResources,
} = require('../utils/spaceRaceResourceArchive');
const router = express.Router();

// ERD-aligned RTDB paths
const raceRef = (id) => db.ref(`spaceRaces/${id}`);
const racesRef = () => db.ref('spaceRaces');
const raceParticipantsRef = (id) => db.ref(`space_race_participants/${id}`);
const raceResponsesRef = (id) => db.ref(`space_race_responses/${id}`);
const raceCodeRef = (code) => db.ref(`space_race_codes/${String(code).toUpperCase()}`); // accessCode -> raceId

const quizRef = (id) => db.ref(`quizzes/${id}`);

const resolveQuizQuestion = (questions, questionId, questionIndex) => {
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const normalizedQuestionId = String(questionId ?? '');
  const byId = questions.find(
    (q) => q?.id !== undefined && q?.id !== null && String(q.id) === normalizedQuestionId
  );
  if (byId) return byId;

  // Accept both q0 and q-0 style ids
  const qIndexMatch = normalizedQuestionId.match(/^q-?(\d+)$/i);
  if (qIndexMatch) {
    const idx = Number.parseInt(qIndexMatch[1], 10);
    if (Number.isInteger(idx) && questions[idx]) return questions[idx];
  }

  if (Number.isInteger(questionIndex) && questions[questionIndex]) {
    return questions[questionIndex];
  }

  const fallbackIndex = questions.findIndex(
    (q, index) =>
      String(q?.id) === normalizedQuestionId ||
      `q${index}` === normalizedQuestionId ||
      `q-${index}` === normalizedQuestionId
  );
  return fallbackIndex >= 0 ? questions[fallbackIndex] : null;
};

/** Normalize question ids so q0 / q-0 / "0" compare as the same team answer. */
const normalizeSpaceRaceQuestionKey = (questionId, questionIndex = null) => {
  if (questionId !== undefined && questionId !== null && String(questionId).trim() !== '') {
    const raw = String(questionId).trim();
    const qMatch = raw.match(/^q-?(\d+)$/i);
    if (qMatch) return `q${qMatch[1]}`;
    if (/^\d+$/.test(raw)) return `q${raw}`;
    return raw;
  }
  if (Number.isInteger(questionIndex)) return `q${questionIndex}`;
  return '';
};

const answersIncludeQuestion = (answers, questionId, questionIndex = null) => {
  const target = normalizeSpaceRaceQuestionKey(questionId, questionIndex);
  if (!target || !Array.isArray(answers)) return false;
  return answers.some((a) => {
    if (!a) return false;
    const key = normalizeSpaceRaceQuestionKey(a.questionId, a.questionIndex);
    return key === target;
  });
};

/** Team score out of 100: each correct answer is worth (100 / N), rounded. */
const calculateTeamScoreFromAnswers = (answers, totalQuestions) => {
  const n = Number(totalQuestions) || 0;
  if (n <= 0) return { score: 0, correctCount: 0, pointsPerQuestion: 0 };

  const pointsPerQuestion = 100 / n;
  const seen = new Set();
  let correctCount = 0;

  (Array.isArray(answers) ? answers : []).forEach((ans) => {
    if (!ans) return;
    const key = normalizeSpaceRaceQuestionKey(ans.questionId, ans.questionIndex);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (ans.isCorrect === true) correctCount += 1;
  });

  return {
    score: Math.round(correctCount * pointsPerQuestion),
    correctCount,
    pointsPerQuestion,
  };
};

const getTeamScoreValue = (rawValue) => {
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : 0;
  return Number(rawValue?.score ?? 0) || 0;
};

const normalizeTeamAssignment = (value) => {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
};

/** Assign a team id the same way as POST /sessions/join (dashboard + public join). */
const assignSpaceRaceTeamId = (raceSettings, existingParticipants, requestedTeamId = null) => {
  const numberOfTeams = raceSettings?.numberOfTeams || 2;
  const mode = normalizeTeamAssignment(raceSettings?.teamAssignment);

  if (mode === 'student-choice') {
    const chosen = parseInt(requestedTeamId, 10);
    if (!Number.isFinite(chosen) || chosen < 1 || chosen > numberOfTeams) {
      return { error: 'Please select a valid team before joining' };
    }
    return { teamId: chosen };
  }

  const teamCounts = {};
  for (let i = 1; i <= numberOfTeams; i += 1) teamCounts[i] = 0;

  (Array.isArray(existingParticipants) ? existingParticipants : []).forEach((participant) => {
    if (participant && participant.teamId != null) {
      const tid = Number(participant.teamId);
      if (Number.isFinite(tid) && tid >= 1 && tid <= numberOfTeams) {
        teamCounts[tid] = (teamCounts[tid] || 0) + 1;
      }
    }
  });

  let assignedTeamId = 1;
  let minCount = Infinity;
  for (let teamId = 1; teamId <= numberOfTeams; teamId += 1) {
    if (teamCounts[teamId] < minCount) {
      minCount = teamCounts[teamId];
      assignedTeamId = teamId;
    }
  }

  return { teamId: assignedTeamId };
};

// Helper function to get user ID with fallback
const getUserId = (req) => {
  // Try Firebase auth first
  if (req.user?.uid) {
    return req.user.uid;
  }
  
  // Try header-based auth (from frontend)
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && headerUserId !== 'undefined' && headerUserId !== 'null') {
    return headerUserId;
  }
  
  // Try body-based auth
  const bodyUserId = req.body.teacherId || req.body.createdBy;
  if (bodyUserId && bodyUserId !== 'undefined' && bodyUserId !== 'null') {
    return bodyUserId;
  }
  
  // Last resort - but only if it's a real user ID, not hardcoded
  console.log('⚠️ No valid user ID found in request');
  return null; // Return null instead of hardcoded fallback
};

function canManageRace(race, uid) {
  if (!race) return false;
  if (!uid) return true;
  if (!race.createdBy) return true;
  return String(race.createdBy) === String(uid);
}

async function resolveRaceRecord(idOrCode) {
  if (!idOrCode) return null;

  const raw = String(idOrCode).trim();
  const byIdSnap = await raceRef(raw).get();
  if (byIdSnap.exists()) {
    return { id: raw, data: byIdSnap.val() || {} };
  }

  const normalizedCode = raw.toUpperCase();
  if (normalizedCode.length === 6) {
    const codeSnap = await raceCodeRef(normalizedCode).get();
    if (codeSnap.exists()) {
      const raceId = codeSnap.val();
      const raceSnap = await raceRef(raceId).get();
      if (raceSnap.exists()) {
        return { id: raceId, data: raceSnap.val() || {} };
      }
    }
  }

  const allSnap = await racesRef().get();
  if (!allSnap.exists()) return null;

  const entries = Object.entries(allSnap.val() || {});
  const match = entries.find(([key, val]) => {
    if (!val || typeof val !== 'object') return false;
    return key === raw || String(val.raceId || '') === raw;
  });

  if (!match) return null;
  const [id, data] = match;
  return { id, data: data || {} };
}

// Join space race by code - NO AUTH REQUIRED (for students)
router.get('/join/:joinCode', async (req, res) => {
  try {
    const { joinCode } = req.params;
    const { name, studentUid, studentEmail, teamId: requestedTeamId } = req.query;
    
    // Normalize code to uppercase for consistent lookup
    const normalizedCode = String(joinCode).toUpperCase();
    
    console.log('🚀 Student joining space race with code:', { original: joinCode, normalized: normalizedCode });
    
    if (!normalizedCode || normalizedCode.length !== 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid join code. Code must be 6 characters.' 
      });
    }
    
    // Find the space race with this join code (index lookup)
    console.log('🔑 Querying space_race_codes for:', normalizedCode);
    const raceIdSnap = await raceCodeRef(normalizedCode).get();
    console.log('🔑 Code lookup result:', { exists: raceIdSnap.exists(), value: raceIdSnap.val() });
    if (!raceIdSnap.exists()) {
      return res.status(404).json({ 
        success: false, 
        error: 'Space Race not found. Please check the code and try again.' 
      });
    }
    const raceId = raceIdSnap.val();
    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ 
        success: false, 
        error: 'Space Race not found. Please check the code and try again.' 
      });
    }
    const raceData = { id: raceId, ...(raceSnap.val() || {}) };
    
    // Check if race is active and not hidden/ended/completed
    if (raceData.status === 'hidden' || raceData.isVisible === false) {
      return res.status(403).json({ 
        success: false, 
        error: 'This Space Race is not currently available.' 
      });
    }
    
    if (raceData.status === 'ended' || raceData.status === 'completed') {
      return res.status(403).json({ 
        success: false, 
        error: 'This Space Race has already ended.' 
      });
    }

    if (raceData.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'This Space Race is not currently active.',
      });
    }
    
    // Load quiz data to get questions
    let quizData = null;
    if (raceData.quizId) {
      try {
        const quizSnap = await quizRef(raceData.quizId).get();
        if (quizSnap.exists()) {
          quizData = quizSnap.val();
          console.log('✅ Loaded quiz for space race:', { 
            quizId: raceData.quizId, 
            title: quizData.title, 
            questionsCount: quizData.questions?.length 
          });
        } else {
          console.error('❌ Quiz not found for space race:', raceData.quizId);
          return res.status(404).json({ 
            success: false, 
            error: 'Quiz for this Space Race not found.' 
          });
        }
      } catch (error) {
        console.error('❌ Error loading quiz for space race:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to load quiz data.' 
        });
      }
    } else {
      console.error('❌ No quizId found for space race');
      return res.status(404).json({ 
        success: false, 
        error: 'No quiz associated with this Space Race.' 
      });
    }
    
    // Get participants data for team assignment / capacity
    let participants = [];
    try {
      const pSnap = await raceParticipantsRef(raceId).get();
      participants = pSnap.exists() ? Object.values(pSnap.val() || {}) : [];
    } catch (error) {
      console.log('Could not fetch participants:', error.message);
    }
    
    // Create participant entry if name is provided — assign team like sessions join
    let participantId = null;
    let assignedTeamId = null;
    if (name && name.trim()) {
      try {
        const assignment = assignSpaceRaceTeamId(
          raceData.settings,
          participants,
          requestedTeamId
        );
        if (assignment.error) {
          return res.status(400).json({ success: false, error: assignment.error });
        }
        assignedTeamId = assignment.teamId;

        const participantData = {
          name: name.trim(),
          joinedAt: new Date().toISOString(),
          score: 0,
          teamId: assignedTeamId,
          answers: [],
          ...(studentUid ? { studentUid: String(studentUid).trim() } : {}),
          ...(studentEmail ? { studentEmail: String(studentEmail).toLowerCase().trim() } : {}),
        };
        
        participantId = raceParticipantsRef(raceId).push().key;
        await raceParticipantsRef(raceId).child(participantId).set({ id: participantId, ...participantData });
        console.log('✅ Created participant:', { participantId, teamId: assignedTeamId });
      } catch (error) {
        console.error('❌ Error creating participant:', error);
        // Continue without participant for now
      }
    }
    
    // Return race data with quiz
    // Add launchSettings to quiz data for timer functionality and shuffle settings
    const quizWithLaunchSettings = {
      ...quizData,
      launchSettings: {
        timeLimit: Math.round(raceData.settings?.countdown / 60) || Math.round((raceData.settings?.countdown || 300) / 60), // Use quiz duration in minutes from countdown setting
        countdown: raceData.settings?.countdown || raceData.settings?.timerSeconds || 300, // Pass quiz duration in seconds
        endTime: raceData.endTime?.toDate?.() ? raceData.endTime.toDate().toISOString() : null, // Only set endTime if quiz has started
        spaceRaceSettings: {
          shuffleQuestions: raceData.settings?.shuffleQuestions ?? false,
          shuffleAnswers: raceData.settings?.shuffleAnswers ?? false,
          requireNames: raceData.settings?.requireNames ?? false,
          showQuestionFeedback: raceData.settings?.showQuestionFeedback ?? false,
          showFinalScore: raceData.settings?.showFinalScore ?? true,
          oneAttempt: raceData.settings?.oneAttempt ?? false,
        }
      }
    };
    
    return res.json({
      success: true,
      type: 'spaceRace',
      data: {
        ...raceData,
        quiz: quizWithLaunchSettings, // Include quiz with proper launchSettings
        participants: participants, // Include participants for team capacity checking
        participantId: participantId,
        teamId: assignedTeamId,
      },
      raceId: raceId,
      quizId: raceData.quizId,
      participantId,
      teamId: assignedTeamId,
    });
    
  } catch (error) {
    console.error('❌ Join space race error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to join Space Race. Please try again.' 
    });
  }
});

// Get space race by join code - NO AUTH REQUIRED (for checking)
router.get('/code/:joinCode', async (req, res) => {
  try {
    const { joinCode } = req.params;
    
    // Normalize code to uppercase for consistent lookup
    const normalizedCode = String(joinCode).toUpperCase();
    
    console.log('🔍 Looking up space race by code:', { original: joinCode, normalized: normalizedCode });
    
    if (!normalizedCode || normalizedCode.length !== 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid join code. Code must be 6 characters.' 
      });
    }
    
    console.log('🔑 Querying space_race_codes for:', normalizedCode);
    const raceIdSnap = await raceCodeRef(normalizedCode).get();
    console.log('🔑 Code lookup result:', { exists: raceIdSnap.exists(), value: raceIdSnap.val() });
    if (!raceIdSnap.exists()) {
      return res.status(404).json({ 
        success: false, 
        error: 'Space Race not found. Please check the code and try again.' 
      });
    }
    const raceId = raceIdSnap.val();
    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ 
        success: false, 
        error: 'Space Race not found. Please check the code and try again.' 
      });
    }
    const raceData = { id: raceId, ...(raceSnap.val() || {}) };
    
    // Check if race is joinable
    if (raceData.status === 'hidden' || raceData.isVisible === false) {
      return res.status(403).json({ 
        success: false, 
        error: 'This Space Race is not currently available.' 
      });
    }
    
    if (raceData.status === 'ended' || raceData.status === 'completed') {
      return res.status(403).json({ 
        success: false, 
        error: 'This Space Race has already ended.' 
      });
    }
    
    // Get participants data for team capacity checking
    let participants = [];
    try {
      const pSnap = await raceParticipantsRef(raceId).get();
      participants = pSnap.exists() ? Object.values(pSnap.val() || {}) : [];
    } catch (error) {
      console.log('Could not fetch participants:', error.message);
    }
    
    // Load quiz data
    let quizData = null;
    if (raceData.quizId) {
      try {
        const quizSnap = await quizRef(raceData.quizId).get();
        if (quizSnap.exists()) {
          quizData = quizSnap.val();
          // Add launchSettings with shuffle settings
          quizData.launchSettings = {
            ...quizData.launchSettings,
            spaceRaceSettings: {
              shuffleQuestions: raceData.settings?.shuffleQuestions ?? false,
              shuffleAnswers: raceData.settings?.shuffleAnswers ?? false,
              requireNames: raceData.settings?.requireNames ?? false,
              showQuestionFeedback: raceData.settings?.showQuestionFeedback ?? false,
              showFinalScore: raceData.settings?.showFinalScore ?? true,
              oneAttempt: raceData.settings?.oneAttempt ?? false,
            }
          };
        }
      } catch (error) {
        console.error('Error loading quiz:', error);
      }
    }

    return res.json({
      success: true,
      data: {
        ...raceData,
        quiz: quizData,
        participants: participants // Include participants for team capacity checking
      }
    });
    
  } catch (error) {
    console.error('❌ Get space race by code error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to lookup Space Race.' 
    });
  }
});


router.get('/student/history', async (req, res) => {
  try {
    const history = await getStudentHistory(req.query);
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get student space race history error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:raceId/shared-resources', async (req, res) => {
  try {
    const { raceId } = req.params;
    const { teamId } = req.query;

    if (teamId === undefined || teamId === null || teamId === '') {
      return res.status(400).json({ success: false, error: 'teamId is required' });
    }

    const { forbidden, resources } = await getSharedResources(raceId, teamId, req.query);
    if (forbidden) {
      return res.status(403).json({
        success: false,
        error: 'You can only view resources from your own team',
      });
    }

    return res.json({ success: true, data: resources });
  } catch (error) {
    console.error('Get shared resources error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    // Get user ID with fallback for development
    const uid = getUserId(req);
    
    console.log('👤 User ID for list races:', uid);
    
    const { status, limit = 50 } = req.query;
    
    console.log('Fetching Space Races for teacher:', uid);
    console.log('Status filter:', status);
    
    if (!uid) {
      // No user ID - return empty results for security
      console.log('⚠️ No user ID provided - returning empty results');
      return res.json({ success: true, data: [] });
    }

    let races = [];
    try {
      const indexedSnap = await racesRef().orderByChild('createdBy').equalTo(uid).get();
      if (indexedSnap.exists()) {
        const raw = indexedSnap.val() || {};
        races = Object.entries(raw).map(([id, raceData]) => ({ id, ...(raceData || {}) }));
      }
    } catch (indexError) {
      console.warn('Indexed space race list failed, falling back to full scan:', indexError.message);
      const snap = await racesRef().get();
      if (snap.exists()) {
        const raw = snap.val() || {};
        races = Object.entries(raw)
          .map(([id, raceData]) => ({ id, ...(raceData || {}) }))
          .filter((r) => r.createdBy === uid);
      }
    }
    
    // Handle status filtering with proper normalization (in-memory)
    if (status && status !== 'all') {
      let normalizedStatus = status;
      if (status === 'active' || status === 'Active') normalizedStatus = 'active';
      else if (status === 'completed' || status === 'ended' || status === 'finished') normalizedStatus = 'completed';
      else if (status === 'draft') normalizedStatus = 'draft';
      else if (status === 'paused') normalizedStatus = 'paused';
      races = races.filter((r) => (typeof r.status === 'string' ? r.status.toLowerCase() : r.status) === normalizedStatus);
    }
    
    // Sort newest first
    races.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const lim = Math.max(0, parseInt(limit, 10) || 0);
    if (lim) races = races.slice(0, lim);
    
    const processedRaces = races.map((raceData) => {
        const participantsCount =
          typeof raceData.participantsCount === 'number'
            ? raceData.participantsCount
            : 0;

        let questionsCount = 0;
        if (Array.isArray(raceData.quiz?.questions)) {
          questionsCount = raceData.quiz.questions.length;
        } else if (raceData.quiz?.questionCount != null) {
          questionsCount = Number(raceData.quiz.questionCount) || 0;
        } else if (raceData.questionCount != null) {
          questionsCount = Number(raceData.questionCount) || 0;
        }
        
        const teamsCount = raceData.settings?.numberOfTeams || raceData.teams || 0;
        
        let normalizedStatus = raceData.status;
        if (normalizedStatus === null || normalizedStatus === undefined) {
          normalizedStatus = 'draft';
      }
      
      if (typeof normalizedStatus === 'string') {
        normalizedStatus = normalizedStatus.toLowerCase();
      }
      
      const allowedStatuses = ["draft", "active", "paused", "inactive", "completed", "ended", "hidden"];
      if (!allowedStatuses.includes(normalizedStatus)) {
        normalizedStatus = 'draft';
      }
      
      let timeLeft = '--:--';
      if (normalizedStatus === 'active' && raceData.startedAt) {
        const startTime = new Date(raceData.startedAt);
        const duration = (raceData.timerMinutes || 10) * 60 * 1000;
        const elapsed = Date.now() - startTime.getTime();
        const remaining = Math.max(0, duration - elapsed);
        
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          timeLeft = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          timeLeft = '00:00';
        }
      }
      
      const { quiz: _embeddedQuiz, ...raceSummary } = raceData;

      return {
        ...raceSummary,
        status: normalizedStatus,
        participantsCount,
        teamsCount,
        questionsCount,
        timeLeft,
      };
    });
    
    return res.json({ success: true, data: processedRaces });
  } catch (error) {
    console.error('List space races error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Public get race endpoint - NO AUTH REQUIRED (for testing) - MUST BE FIRST
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Public race lookup for ID:', id);
    
    const snap = await raceRef(id).get();
    if (!snap.exists()) {
      console.log('❌ Race not found:', id);
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const data = snap.val() || {};
    console.log('✅ Race found:', { id, title: data.title, status: data.status });
    
    // Load quiz data to get questions count
    let quizData = null;
    let questionsCount = 0;
    if (data.quizId) {
      const quizSnap = await quizRef(data.quizId).get();
      if (quizSnap.exists()) {
        quizData = quizSnap.val();
        questionsCount = quizData.questions?.length || 0;
        quizData = { ...quizData, id: data.quizId };
        // Add launchSettings with shuffle settings for team-based shuffling
        quizData.launchSettings = {
          ...quizData.launchSettings,
          spaceRaceSettings: {
            shuffleQuestions: data.settings?.shuffleQuestions ?? false,
            shuffleAnswers: data.settings?.shuffleAnswers ?? false,
            requireNames: data.settings?.requireNames ?? false,
            showQuestionFeedback: data.settings?.showQuestionFeedback ?? false,
            showFinalScore: data.settings?.showFinalScore ?? true,
            oneAttempt: data.settings?.oneAttempt ?? false,
          }
        };
        console.log('✅ Loaded quiz data:', {
          quizId: data.quizId,
          title: quizData.title,
          questionsCount,
          shuffleQuestions: data.settings?.shuffleQuestions,
          shuffleAnswers: data.settings?.shuffleAnswers
        });
      }
    }
    
    // Get participants count
    const pSnap = await raceParticipantsRef(id).get();
    const participantsCount = pSnap.exists() ? Object.keys(pSnap.val() || {}).length : 0;
    
    // Calculate teams count from settings
    const teamsCount = data.settings?.numberOfTeams || data.teams || 0;
    
    // Calculate time left if race is active
    let timeLeft = '--:--';
    if (data.status === 'active' && data.startedAt) {
      const startTime = new Date(data.startedAt);
      const duration = (data.timerMinutes || 10) * 60 * 1000; // Convert minutes to milliseconds
      const elapsed = Date.now() - startTime.getTime();
      const remaining = Math.max(0, duration - elapsed);
      
      if (remaining > 0) {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timeLeft = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        timeLeft = '00:00';
      }
    }
    
    return res.json({ 
      success: true, 
      data: { 
        id, 
        ...data,
        quiz: quizData,
        questionsCount,
        participantsCount,
        teamsCount,
        timeLeft
      } 
    });
  } catch (error) {
    console.error('❌ Get space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create space race endpoint (for saving as draft) - WITH AUTH FALLBACK
router.post('/', async (req, res) => {
  try {
    console.log('💾 Frontend create race request:', req.body);
    
    // Get user ID with fallback for development
    const uid = getUserId(req);
    
    if (!uid) {
      return res.status(401).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }
    
    const {
      quizId,
      title,
      numberOfTeams,
      teamAssignment,
      icon,
      countdown,
      joinDuration,
      studentsPerTeam,
      requireNames,
      shuffleQuestions,
      shuffleAnswers,
      showQuestionFeedback,
      showFinalScore,
      oneAttempt,
      settings,
    } = req.body;

    if (!quizId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quiz ID is required' 
      });
    }

    const raceId = racesRef().push().key;

    // Create race session as draft
    const raceSession = {
      quizId,
      title: title || 'Space Race',
      description: 'Draft Space Race session',
      status: 'draft', // Start as draft
      createdBy: uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      participants: 0,
      teams: numberOfTeams || settings?.numberOfTeams || 0,
      timerSeconds: (joinDuration || settings?.joinDuration || 30) * 60,
      timerMinutes: joinDuration || settings?.joinDuration || 30,
      settings: {
        numberOfTeams: numberOfTeams ?? settings?.numberOfTeams ?? 2,
        teamAssignment: teamAssignment ?? settings?.teamAssignment ?? 'auto-assign',
        icon: icon ?? settings?.icon ?? 'rocket',
        countdown: countdown ?? settings?.countdown ?? 300,
        joinDuration: joinDuration ?? settings?.joinDuration ?? 30,
        studentsPerTeam: Math.min(studentsPerTeam ?? settings?.studentsPerTeam ?? 3, 6),
        requireNames: requireNames ?? settings?.requireNames ?? false,
        shuffleQuestions: shuffleQuestions ?? settings?.shuffleQuestions ?? false,
        shuffleAnswers: shuffleAnswers ?? settings?.shuffleAnswers ?? false,
        showQuestionFeedback: showQuestionFeedback ?? settings?.showQuestionFeedback ?? false,
        showFinalScore: showFinalScore ?? settings?.showFinalScore ?? true,
        oneAttempt: oneAttempt ?? settings?.oneAttempt ?? false,
      },
    };

    console.log('About to create draft race document:', raceSession);
    await raceRef(raceId).set({ raceId, ...raceSession });
    console.log('Draft race document created successfully with ID:', raceId);

    console.log('Space Race saved successfully as draft:', {
      raceId,
      createdBy: uid,
      status: 'draft'
    });

    return res.status(200).json({
      message: 'Race saved as draft',
      raceId,
      success: true,
    });
  } catch (error) {
    console.error('❌ Error saving space race:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request body:', req.body);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to save space race',
      error: error.message 
    });
  }
});

// Start space race endpoint (for frontend) - WITH AUTH FALLBACK
router.post('/start', async (req, res) => {
  try {
    console.log('🚀 Frontend start race request:', req.body);
    
    // Get user ID with fallback for development
    const uid = getUserId(req);
    
    console.log('� User ID for start race:', uid);
    console.log('🔍 Auth context:', { 
      hasUser: !!req.user, 
      userUid: req.user?.uid,
      headerUserId: req.headers['x-user-id'],
      finalUid: uid
    });
    
    const {
      quizId,
      title,
      accessCode,
      numberOfTeams,
      teamAssignment,
      icon,
      countdown,
      joinDuration,
      studentsPerTeam,
      requireNames,
      shuffleQuestions,
      shuffleAnswers,
      showQuestionFeedback,
      showFinalScore,
      oneAttempt,
      settings,
    } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: 'Quiz ID is required' });
    }

    const launchPrep = await prepareActivityLaunch('spaceRace');
    if (!launchPrep.ok) {
      return res.status(400).json({ success: false, error: launchPrep.error });
    }

    // Additional check: active Library Quiz for THIS teacher only
    const quizzesSnap = await db.ref('quizzes').orderByChild('createdBy').equalTo(uid).get();
    if (quizzesSnap.exists()) {
      const raw = quizzesSnap.val() || {};
      const now = Date.now();
      const found = Object.entries(raw).find(([, q]) => {
        if (!q || q.launched !== true) return false;
        const status = String(q.status || '').toLowerCase();
        if (!['active', 'launched'].includes(status)) return false;
        const endTime = q.launchSettings?.endTime ? new Date(q.launchSettings.endTime).getTime() : null;
        // Ignore stale launched records that already expired
        if (endTime && !Number.isNaN(endTime) && endTime <= now) return false;
        return true;
      });
      if (found) {
        const [activeQuizId, activeQuiz] = found;
        console.log('Found active quiz blocking space race:', activeQuiz.title);

        return res.status(400).json({
          success: false,
          error: `A Quiz "${activeQuiz.title}" is currently active in Quiz Library. Please finish the quiz first before starting a Space Race.`,
          activeQuiz: {
            id: activeQuizId,
            title: activeQuiz.title,
            accessCode: activeQuiz.launchSettings?.accessCode
          }
        });
      }
    }

    const raceId = racesRef().push().key;

    const joinCode = launchPrep.sessionCode;

    console.log(`🚀 Using teacher session code: ${joinCode}`);

    // Convert previous active races to completed in background (non-blocking)
    // But exclude the current race being created
    racesRef()
      .orderByChild('createdBy')
      .equalTo(uid)
      .get()
      .then((snap) => {
        const raw = snap.exists() ? (snap.val() || {}) : {};
        const activeIds = Object.entries(raw)
          .filter(([id, r]) => r && String(r.status || '').toLowerCase() === 'active' && id !== raceId)
          .map(([id]) => id);
        if (activeIds.length > 0) {
          console.log(`🔄 Converting ${activeIds.length} previous active races to completed...`);
          const updates = {};
          activeIds.forEach((rid) => {
            updates[`spaceRaces/${rid}/status`] = 'completed';
            updates[`spaceRaces/${rid}/endedAt`] = new Date().toISOString();
            updates[`spaceRaces/${rid}/previousStatus`] = 'active';
            const code = raw[rid]?.joinCode || raw[rid]?.accessCode;
            if (code) updates[`space_race_codes/${String(code).toUpperCase()}`] = null;
          });
          return db.ref().update(updates);
        }
        return null;
      })
      .then(() => console.log('✅ Previous active races converted to completed'))
      .catch((err) => console.log('⚠️ Background race conversion failed:', err.message));
    
    // Fetch quiz data to attach to race (so students can access it when joining)
    let quizData = null;
    let quizTitle = title || 'Space Race';
    
    try {
      const quizSnap = await quizRef(quizId).get();
      if (quizSnap.exists()) {
        quizData = quizSnap.val();
        quizTitle = quizData.title || title || 'Space Race';
        console.log('✅ Fetched quiz data for Space Race:', { quizId, title: quizTitle, questionCount: quizData.questions?.length });
      } else {
        console.error('❌ Quiz not found when starting Space Race:', quizId);
        return res.status(404).json({ 
          success: false, 
          error: 'Quiz not found. Please select a valid quiz.' 
        });
      }
    } catch (error) {
      console.error('❌ Error fetching quiz data:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch quiz data.' 
      });
    }
    
    // Use joinDuration for the main timer (displayed in the bar when race is launched)
    const quizDurationSeconds = countdown ?? settings?.countdown ?? 300; // Default 5 minutes (300 seconds)
    const joinDurationMinutes = joinDuration ?? settings?.joinDuration ?? 30;
    const finalTimerSeconds = joinDurationMinutes * 60; // Use join duration (convert minutes to seconds)
    
    console.log('⏰ Setting up manual timer:', {
      quizDurationSeconds,
      joinDurationMinutes,
      countdown,
      settingsCountdown: settings?.countdown,
      finalTimerSeconds
    });
    
    // Create race session with enhanced timer control
    const raceSession = {
      raceId: raceId,
      joinCode: joinCode,
      accessCode: joinCode,
      sessionCode: joinCode,
      quizId,
      title: quizTitle,
      description: 'Live Space Race session',
      status: 'active', // Start as active immediately
      createdBy: uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      participants: 0,
      teams: numberOfTeams || settings?.numberOfTeams || 0,
      timerSeconds: finalTimerSeconds, // Use join duration for display
      timerMinutes: joinDurationMinutes, // Use join duration for display
      endTime: null, // Will be set when quiz starts (synchronized timer)
      quizStartedAt: null, // Will be set when first student starts quiz
      quiz: quizData ? {
        ...quizData,
        id: quizId,
        launched: true,
        launchSettings: {
          ...(quizData.launchSettings || {}),
          timeLimit: Math.round(quizDurationSeconds / 60),
          countdown: quizDurationSeconds,
        }
      } : null, // Attach quiz data so students can access it
      settings: {
        numberOfTeams: numberOfTeams ?? settings?.numberOfTeams ?? 2,
        teamAssignment: teamAssignment ?? settings?.teamAssignment ?? 'auto-assign',
        icon: icon ?? settings?.icon ?? 'rocket',
        countdown: countdown ?? settings?.countdown ?? 300, // Default 5 minutes for quiz duration
        joinDuration: joinDurationMinutes, // Store join duration separately
        timerSeconds: finalTimerSeconds, // Add to settings for frontend access
        studentsPerTeam: Math.min(studentsPerTeam ?? settings?.studentsPerTeam ?? 3, 6),
        requireNames: requireNames ?? settings?.requireNames ?? false,
        shuffleQuestions: shuffleQuestions ?? settings?.shuffleQuestions ?? false,
        shuffleAnswers: shuffleAnswers ?? settings?.shuffleAnswers ?? false,
        showQuestionFeedback: showQuestionFeedback ?? settings?.showQuestionFeedback ?? false,
        showFinalScore: showFinalScore ?? settings?.showFinalScore ?? true,
        oneAttempt: oneAttempt ?? settings?.oneAttempt ?? false,
      },
    };

    console.log('About to create race document:', raceSession);
    await raceRef(raceId).set(raceSession);
    
    // Store the code mapping with proper uppercase normalization
    const normalizedCode = String(joinCode).toUpperCase();
    console.log('🔑 Storing space race code mapping:', { normalizedCode, raceId });
    await raceCodeRef(normalizedCode).set(raceId);
    console.log('✅ Code mapping stored successfully');
    
    await setSessionCurrentActivity(launchPrep.sessionId, 'spaceRace');
    await appendSessionActivityHistory(launchPrep.sessionId, {
      type: 'spaceRace',
      name: quizTitle || 'Space Race',
      activityId: raceId,
    });
    console.log('Race document created successfully with ID:', raceId);

    const autoEndEnabled = false;
    if (autoEndEnabled) {

    // Set up automatic race ending based on manual timer
    console.log('⏰ Setting up auto-end timer for', finalTimerSeconds, 'seconds');
    const autoEndTimer = setTimeout(async () => {
      try {
        console.log('⏰ Auto-ending Space Race:', raceId);
        
        // Mark all unattempted questions as 0 for all participants
        const participantsSnapshot = await raceParticipantsRef(raceId).get();
        const updates = {};
        if (participantsSnapshot.exists()) {
          Object.keys(participantsSnapshot.val() || {}).forEach((pid) => {
            updates[`space_race_participants/${raceId}/${pid}/finalScoreCalculated`] = true;
            updates[`space_race_participants/${raceId}/${pid}/autoEndedAt`] = new Date().toISOString();
          });
          await db.ref().update(updates);
        }
        
        // Update race status to completed
        await raceRef(raceId).update({
          status: 'completed',
          endedAt: new Date().toISOString(),
          autoEnded: true
        });
        await raceCodeRef(joinCode).remove();
        
        await clearActivityFromActiveSession();

        console.log('✅ Space Race auto-ended successfully:', raceId);
      } catch (error) {
        console.error('❌ Failed to auto-end race:', error);
      }
    }, finalTimerSeconds * 1000);
    
    // Store timer reference for potential cleanup
    global.activeRaceTimers = global.activeRaceTimers || {};
    global.activeRaceTimers[raceId] = autoEndTimer;
    }
    if (!autoEndEnabled) {
      console.log('Auto-end disabled; Space Race will remain active until manually ended.');
    }

    console.log('Space Race started successfully:', {
      raceId,
      joinCode,
      createdBy: uid,
      timerSeconds: finalTimerSeconds,
      joinDuration: joinDurationMinutes,
      success: true,
    });

    return res.status(200).json({
      message: 'Race started',
      raceId,
      joinCode,
      timerSeconds: finalTimerSeconds,
      joinDuration: joinDurationMinutes,
      quizDurationSeconds: quizDurationSeconds, // Quiz duration for when quiz starts
      endTime: null, // Will be set when quiz starts
      quizStartedAt: null, // Will be set when first student starts quiz
      success: true,
    });
  } catch (error) {
    console.error('❌ Error starting space race:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request body:', req.body);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to start space race',
      error: error.message 
    });
  }
});

// Helper function to recalculate team scores using dynamic scoring
async function recalculateTeamScores(raceId, quizData) {
  try {
    console.log('🔄 Recalculating team scores with dynamic scoring for race:', raceId);
    
    const participantsSnapshot = await raceParticipantsRef(raceId).get();
    if (!participantsSnapshot.exists()) {
      console.log('No participants found for race:', raceId);
      return;
    }
    
    const participants = participantsSnapshot.val() || {};
    const totalQuestions = quizData.questions?.length || 0;
    
    console.log('📊 Recalculation parameters:', { totalQuestions });
    
    const teamScores = {};
    const updates = {};
    
    // Process each participant — score = round(correct / N * 100)
    Object.entries(participants).forEach(([pid, participant]) => {
      const teamId = participant.teamId || 1;
      const answers = Array.isArray(participant.answers) ? participant.answers : [];
      const { score: newScore, correctCount, pointsPerQuestion } = calculateTeamScoreFromAnswers(
        answers,
        totalQuestions
      );
      
      console.log(`📊 Recalculating participant ${pid}:`, {
        teamId,
        correctCount,
        newScore,
        pointsPerQuestion,
        oldScore: participant.score,
        totalAnswers: answers.length
      });
      
      // Update participant score only (don't touch completedAt - that's set when they finish)
      updates[`space_race_participants/${raceId}/${pid}/score`] = newScore;
      
      // Aggregate team score (use max since all team members share team performance)
      if (!teamScores[teamId]) {
        teamScores[teamId] = 0;
      }
      teamScores[teamId] = Math.max(teamScores[teamId], newScore);
    });
    
    // Update team scores
    Object.entries(teamScores).forEach(([teamId, score]) => {
      updates[`space_race_team_scores/${raceId}/team_${teamId}`] = {
        score: score,
        lastUpdatedAt: new Date().toISOString(),
        recalculated: true
      };
    });
    
    // Apply all updates
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
      console.log('✅ Team scores recalculated successfully:', teamScores);
    }
    
  } catch (error) {
    console.error('❌ Error recalculating team scores:', error);
  }
}

// Get participants and team data for a space race
router.get('/:id/participants', verifyFirebaseToken, checkRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { recalculate } = req.query; // Optional flag to force recalculation
    
    console.log('👥 Getting participants for space race:', id, { recalculate });
    
    // Get the race document
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    
    // Load quiz data for recalculation
    let quizData = null;
    if (race.quizId) {
      try {
        const quizSnap = await quizRef(race.quizId).get();
        if (quizSnap.exists()) {
          quizData = quizSnap.val();
        }
      } catch (error) {
        console.error('Error loading quiz for recalculation:', error);
      }
    }
    
    // Recalculate scores if requested or if quiz data is available
    if (recalculate === 'true' && quizData) {
      await recalculateTeamScores(id, quizData);
    }
    
    // Get all participants
    const participantsSnapshot = await raceParticipantsRef(id).get();
    const participants = [];
    const teamScoresFromDb = {};
    
    const raw = participantsSnapshot.exists() ? (participantsSnapshot.val() || {}) : {};
    Object.entries(raw).forEach(([pid, participant]) => {
      participants.push({
        id: pid,
        name: participant.name || 'Unknown',
        score: participant.score || 0,
        teamId: participant.teamId || 1,
        joinedAt: participant.joinedAt,
        completedAt: participant.completedAt
      });
    });

    const teamScoresSnap = await db.ref(`space_race_team_scores/${id}`).get();
    if (teamScoresSnap.exists()) {
      const rawTeamScores = teamScoresSnap.val() || {};
      Object.entries(rawTeamScores).forEach(([key, value]) => {
        const teamId = String(key).replace(/^team_/, '');
        const score = typeof value === 'number' ? value : Number(value?.score || 0);
        teamScoresFromDb[teamId] = {
          teamId: Number(teamId),
          score: Number.isFinite(score) ? score : 0,
          members: participants.filter((p) => String(p.teamId) === String(teamId)),
        };
      });
    }

    // Fallback: derive from participant scores if team_scores not populated yet
    // In Space Race, all team members have the same score, so use max (or any member's score)
    if (Object.keys(teamScoresFromDb).length === 0) {
      participants.forEach((participant) => {
        const teamId = participant.teamId || 1;
        if (!teamScoresFromDb[teamId]) {
          teamScoresFromDb[teamId] = { teamId, score: 0, members: [] };
        }
        // Use max since all team members have the same score in Space Race
        teamScoresFromDb[teamId].score = Math.max(
          teamScoresFromDb[teamId].score,
          Number(participant.score || 0)
        );
        teamScoresFromDb[teamId].members.push(participant);
      });
    }

    const sortedTeams = Object.values(teamScoresFromDb).sort((a, b) => b.score - a.score);
    const finalTeamScores = {};
    sortedTeams.forEach((team) => {
      finalTeamScores[team.teamId] = team;
    });
    
    return res.json({
      success: true,
      data: {
        participants,
        teamScores: finalTeamScores,
        totalParticipants: participants.length,
        totalTeams: Object.keys(finalTeamScores).length
      }
    });
  } catch (error) {
    console.error('Error getting space race participants:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Submit answer for space race - NO AUTH REQUIRED (for students)
router.post('/:id/submit-answer', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId, questionId, answer, questionIndex } = req.body;
    
    console.log('📝 Submitting space race answer:', { id, participantId, questionId, answer, questionIndex });
    
    if (!participantId || !questionId || answer === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: participantId, questionId, answer' 
      });
    }
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    
    if (race.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        error: 'This Space Race is not currently active.' 
      });
    }
    
    const participantSnap = await raceParticipantsRef(id).child(participantId).get();
    if (!participantSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    const participant = participantSnap.val();
    const teamId = participant.teamId;
    if (teamId === undefined || teamId === null) {
      return res.status(400).json({ success: false, error: 'Participant is not assigned to a team' });
    }
    
    let quizData = null;
    if (race.quiz && race.quiz.questions) {
      quizData = race.quiz;
    } else if (race.quizId) {
      try {
        const quizSnap = await quizRef(race.quizId).get();
        if (quizSnap.exists()) {
          quizData = quizSnap.val();
        }
      } catch (error) {
        console.error('Error loading quiz for scoring:', error);
      }
    }
    
    if (!quizData || !quizData.questions) {
      return res.status(500).json({ 
        success: false, 
        error: 'Quiz data not available for scoring.' 
      });
    }
    
    // Normalize quiz questions to ensure correct answer format (never invent a correct option)
    const normalizedQuestions = quizData.questions.map((q) => {
      const normalized = { ...q };

      if (Array.isArray(normalized.options) && normalized.options.length > 0) {
        if (typeof normalized.correctAnswer === 'number') {
          normalized.options = normalized.options.map((opt, idx) => ({
            ...(typeof opt === 'string' ? { text: opt } : opt),
            isCorrect: idx === normalized.correctAnswer,
          }));
        } else if (typeof normalized.correctAnswer === 'string') {
          const correctText = normalized.correctAnswer.toLowerCase().trim();
          const parsedIndex = parseInt(normalized.correctAnswer, 10);
          const correctAnswerIsIndex =
            !Number.isNaN(parsedIndex) &&
            String(parsedIndex) === correctText &&
            normalized.options[parsedIndex] !== undefined;

          normalized.options = normalized.options.map((opt, idx) => {
            const optText = typeof opt === 'string' ? opt : (opt.text || '');
            const isCorrect = correctAnswerIsIndex
              ? idx === parsedIndex
              : optText.toLowerCase().trim() === correctText;
            return {
              ...(typeof opt === 'string' ? { text: opt } : opt),
              isCorrect,
            };
          });
        }
        // If options already have isCorrect / only correctAnswer index flags, leave as-is.
        // Do NOT mark the first option correct as a fallback — that inflates team scores.
      }

      return normalized;
    });
    
    const question = resolveQuizQuestion(normalizedQuestions, questionId, questionIndex);
    
    if (!question) {
      return res.status(404).json({ 
        success: false, 
        error: 'Question not found in quiz.' 
      });
    }

    const resolvedIndex = Number.isInteger(questionIndex)
      ? questionIndex
      : normalizedQuestions.findIndex((q) => q === question);
    const resolvedQuestionId =
      question?.id !== undefined && question?.id !== null && String(question.id).trim() !== ''
        ? String(question.id)
        : Number.isInteger(resolvedIndex) && resolvedIndex >= 0
          ? `q${resolvedIndex}`
          : normalizeSpaceRaceQuestionKey(questionId, questionIndex) || String(questionId);

    const selectionPath = `space_race_team_selection/${id}/team_${teamId}/question_${resolvedQuestionId}`;
    const selectionSnap = await db.ref(selectionPath).get();
    if (selectionSnap.exists() && selectionSnap.val()?.submitted === true) {
      return res.status(400).json({ success: false, error: 'This question was already submitted for your team' });
    }
    
    const totalQuestions = Array.isArray(quizData.questions) ? quizData.questions.length : 0;
    const pointsPerQuestion = totalQuestions > 0 ? 100 / totalQuestions : 0;
    const { isCorrect } = scoreAnswerInBackend(question, answer, quizData.type, totalQuestions);
    // Each correct answer is worth (100 / N); incorrect answers are 0
    const points = isCorrect ? pointsPerQuestion : 0;
    
    console.log('📊 Answer scored:', { 
      questionId, 
      questionIndex,
      resolvedQuestionId,
      answer, 
      isCorrect, 
      points,
      pointsPerQuestion,
      totalQuestions,
      questionType: quizData.type,
      teamId,
      questionCorrectAnswer: question.correctAnswer,
      questionOptions: question.options?.map((o, i) => ({
        index: i,
        text: typeof o === 'string' ? o : o.text,
        isCorrect: typeof o === 'string' ? false : o.isCorrect
      }))
    });

    const allParticipantsSnap = await db.ref(`space_race_participants/${id}`).get();
    const allParticipants = allParticipantsSnap.val() || {};
    const submittingParticipant = allParticipants[participantId];
    const submitTeamId = submittingParticipant?.teamId ?? teamId;
    const updates = {};

    // Award points + answer to every member of the same team
    Object.entries(allParticipants).forEach(([pid, pData]) => {
      if (!pData || String(pData.teamId) !== String(submitTeamId)) return;

      const existingAnswers = Array.isArray(pData.answers) ? pData.answers : [];
      const alreadyAnswered = existingAnswers.some(
        (a) =>
          String(a.questionId) === String(resolvedQuestionId) ||
          String(a.questionId) === String(questionId)
      );
      if (!alreadyAnswered) {
        updates[`space_race_participants/${id}/${pid}/score`] =
          (Number(pData.score) || 0) + points;
        updates[`space_race_participants/${id}/${pid}/answers`] = [
          ...existingAnswers,
          {
            questionId: resolvedQuestionId,
            answer,
            isCorrect,
            points,
            submittedAt: new Date().toISOString(),
            questionIndex: questionIndex || 0,
            awardedByTeammate: pid !== participantId,
          },
        ];
      }
    });

    // Authoritative team score (team_N path used by leaderboard + completion card)
    const teamScoreSnap = await db
      .ref(`space_race_team_scores/${id}/team_${submitTeamId}`)
      .get();
    const newTeamScore = getTeamScoreValue(teamScoreSnap.val()) + points;
    updates[`space_race_team_scores/${id}/team_${submitTeamId}`] = {
      score: newTeamScore,
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: participantId,
    };

    // Lock question for all teammates (real-time via RTDB)
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/submitted`
    ] = true;
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/selectedOption`
    ] = answer;
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/submittedBy`
    ] = participantId;
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/submittedByName`
    ] = submittingParticipant?.name || participant?.name || 'A teammate';
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/submittedAt`
    ] = new Date().toISOString();
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/isCorrect`
    ] = isCorrect;
    updates[
      `space_race_team_selection/${id}/team_${submitTeamId}/question_${resolvedQuestionId}/points`
    ] = points;

    await db.ref().update(updates);

    return res.json({
      success: true,
      isCorrect,
      points,
      teamScore: newTeamScore,
      teamScoreUpdated: true,
      message: isCorrect ? 'Correct answer!' : 'Incorrect answer',
    });
    
  } catch (error) {
    console.error('❌ Submit space race answer error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to submit answer. Please try again.' 
    });
  }
});

// Start quiz timer - NO AUTH REQUIRED (for students)
router.post('/:id/start-quiz', async (req, res) => {
  try {
    const { id } = req.params;
    const { quizId, timerSeconds, teamId } = req.body;
    
    console.log('🚀 Starting quiz timer:', { id, quizId, timerSeconds, teamId });
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    
    // Calculate quiz end time using quiz duration (countdown) instead of join duration
    const quizDurationSeconds = timerSeconds || race.settings?.countdown || race.settings?.timerSeconds || 600;
    const quizStartedAt = new Date().toISOString();
    const endTime = new Date(Date.now() + quizDurationSeconds * 1000).toISOString();
    
    // Store timer per team instead of globally
    const teamTimerPath = `space_race_team_timers/${id}/team_${teamId}`;
    const teamTimerSnap = await db.ref(teamTimerPath).get();
    
    // Only set if not already set for this team
    if (teamTimerSnap.exists() && teamTimerSnap.val().quizStartedAt) {
      console.log('Quiz already started for this team:', teamId, 'at:', teamTimerSnap.val().quizStartedAt);
      return res.json({ 
        success: true, 
        message: 'Quiz already started for this team',
        quizStartedAt: teamTimerSnap.val().quizStartedAt,
        endTime: teamTimerSnap.val().endTime
      });
    }
    
    // Set team-specific timer
    await db.ref(teamTimerPath).set({
      quizStartedAt,
      endTime,
      duration: quizDurationSeconds,
      teamId
    });
    
    console.log('✅ Quiz timer started for team:', teamId, { quizStartedAt, endTime, duration: quizDurationSeconds });
    
    return res.json({ 
      success: true, 
      message: 'Quiz timer started',
      quizStartedAt,
      endTime,
      duration: quizDurationSeconds,
      teamId
    });
  } catch (error) {
    console.error('❌ Start quiz timer error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to start quiz timer' 
    });
  }
});

// Sync team answer selection across teammates - NO AUTH REQUIRED
router.post('/:id/team-selection', async (req, res) => {
  try {
    const { id: raceId } = req.params;
    const { participantId, teamId, questionId, selectedOption, senderName } = req.body;

    if (!participantId || teamId === undefined || teamId === null || !questionId || selectedOption === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: participantId, teamId, questionId, selectedOption',
      });
    }

    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    if (raceSnap.val()?.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Space race is not active' });
    }

    const participantSnap = await raceParticipantsRef(raceId).child(participantId).get();
    if (!participantSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    const participant = participantSnap.val();
    if (String(participant.teamId) !== String(teamId)) {
      return res.status(403).json({ success: false, error: 'Participant is not on this team' });
    }

    const selectionPath = `space_race_team_selection/${raceId}/team_${teamId}/question_${questionId}`;
    const existingSnap = await db.ref(selectionPath).get();
    if (existingSnap.exists() && existingSnap.val()?.submitted === true) {
      return res.status(400).json({ success: false, error: 'Question already submitted for this team' });
    }

    await db.ref(selectionPath).set({
      selectedOption,
      selectedBy: participantId,
      selectedByName: senderName || participant.name || 'Teammate',
      selectedAt: new Date().toISOString(),
      submitted: false,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Team selection error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update team selection' });
  }
});

// Get final score for space race participant
router.get('/:id/final-score', async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.query;
    
    console.log('🏁 Getting final space race score:', { id, participantId });
    
    // Get the race document
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    
    // Get participant document
    const participantSnap = await raceParticipantsRef(id).child(participantId).get();
    if (!participantSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }
    
    const participant = participantSnap.val();
    
    // Get all answers for this participant
    // Note: Answers are stored in the participant document, not in a separate subcollection
    const answers = participant.answers || [];

    // Load quiz data for scoring
    let quizData = race.quiz || null;
    if (!quizData && race.quizId) {
      try {
        const quizSnap = await quizRef(race.quizId).get();
        if (quizSnap.exists()) {
          quizData = quizSnap.val();
          console.log('📚 Loaded quiz for final scoring:', {
            quizId: race.quizId,
            quizType: quizData.type,
            questionsCount: quizData.questions?.length
          });
        }
      } catch (error) {
        console.error('Error loading quiz for final scoring:', error);
      }
    }

    if (!quizData || !quizData.questions) {
      return res.status(500).json({
        success: false,
        error: 'Quiz data not available for final scoring.'
      });
    }
    
    // Prefer team collective score from stored answer correctness (same formula as submit-answer)
    const totalQuestions = Array.isArray(quizData.questions) ? quizData.questions.length : 0;
    const teamId = participant.teamId;
    let teamAnswers = Array.isArray(answers) ? answers : [];

    if (teamId !== undefined && teamId !== null) {
      try {
        const allSnap = await raceParticipantsRef(id).get();
        const all = allSnap.exists() ? allSnap.val() || {} : {};
        const merged = new Map();
        Object.values(all).forEach((p) => {
          if (!p || String(p.teamId) !== String(teamId)) return;
          (Array.isArray(p.answers) ? p.answers : []).forEach((ans) => {
            const key = normalizeSpaceRaceQuestionKey(ans?.questionId, ans?.questionIndex);
            if (key && !merged.has(key)) merged.set(key, ans);
          });
        });
        if (merged.size > 0) teamAnswers = Array.from(merged.values());
      } catch (mergeErr) {
        console.warn('Could not merge team answers for final score:', mergeErr.message);
      }
    }

    const { score, correctCount } = calculateTeamScoreFromAnswers(teamAnswers, totalQuestions);
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    console.log('📊 Backend Final Team Score Result:', {
      score,
      correctCount,
      totalQuestions,
      percentage,
      teamId,
    });

    const completedAt = new Date().toISOString();
    const finalUpdates = {
      [`space_race_participants/${id}/${participantId}/score`]: score,
      [`space_race_participants/${id}/${participantId}/completedAt`]: completedAt,
    };

    // Keep every teammate on the same collective score
    if (teamId !== undefined && teamId !== null) {
      const allSnap = await raceParticipantsRef(id).get();
      const all = allSnap.exists() ? allSnap.val() || {} : {};
      Object.entries(all).forEach(([pid, p]) => {
        if (!p || String(p.teamId) !== String(teamId)) return;
        finalUpdates[`space_race_participants/${id}/${pid}/score`] = score;
        finalUpdates[`space_race_participants/${id}/${pid}/answers`] = teamAnswers.map((ans) => ({
          ...ans,
          awardedByTeammate:
            pid === participantId
              ? ans.awardedByTeammate === true
              : ans.awardedByTeammate !== false,
        }));
      });
      finalUpdates[`space_race_team_scores/${id}/team_${teamId}`] = {
        score,
        correctCount,
        totalQuestions,
        lastUpdatedAt: completedAt,
        lastUpdatedBy: participantId,
      };
    }

    await db.ref().update(finalUpdates);
    
    return res.json({ 
      success: true, 
      score,
      correctAnswers: correctCount,
      totalQuestions,
      percentage,
      points: score
    });
  } catch (error) {
    console.error('Error getting final space race score:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update score for space race participant
router.put('/:id/update-score', verifyFirebaseToken, checkRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId, score } = req.body;
    
    console.log('📊 Updating space race score:', { id, participantId, score });
    
    // Get the race document
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    // Get participant document
    const participantSnap = await raceParticipantsRef(id).child(participantId).get();
    if (!participantSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }
    
    // Update participant's score
    await raceParticipantsRef(id).child(participantId).update({
      score,
      completedAt: new Date().toISOString()
    });
    
    return res.json({ success: true, score });
  } catch (error) {
    console.error('Error updating space race score:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Pause space race - with auth fallback
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user ID with fallback for development
    const uid = getUserId(req);
    
    console.log('👤 User ID for pause race:', uid);
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Clear the auto-end timer if it exists
    if (global.activeRaceTimers && global.activeRaceTimers[id]) {
      clearTimeout(global.activeRaceTimers[id]);
      delete global.activeRaceTimers[id];
      console.log('⏸️ Cleared auto-end timer for paused race:', id);
    }
    
    // Calculate remaining time
    const now = new Date();
    const endTime = new Date(race.endTime);
    const remainingTime = Math.max(0, endTime.getTime() - now.getTime());
    
    await raceRef(id).update({
      status: 'paused',
      isPaused: true,
      pausedAt: new Date().toISOString(),
      remainingTime: remainingTime // Store remaining time in milliseconds
    });
    
    return res.json({ success: true, message: 'Space race paused', remainingTime });
  } catch (error) {
    console.error('Pause space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Resume space race - with auth fallback
router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user ID with fallback for development
    const uid = getUserId(req);
    
    console.log('👤 User ID for resume race:', uid);
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Calculate new end time based on remaining time
    const remainingTime = race.remainingTime || (race.timerSeconds ? race.timerSeconds * 1000 : 30000);
    const newEndTime = new Date(Date.now() + remainingTime);

    const autoEndEnabled = false;
    if (autoEndEnabled) {
    
    // Set up new auto-end timer
    const autoEndTimer = setTimeout(async () => {
      try {
        console.log('⏰ Auto-ending resumed Space Race:', id);
        
        // Update race status to completed
        await raceRef(id).update({
          status: 'completed',
          endedAt: new Date().toISOString(),
          autoEnded: true
        });
        const code = race.joinCode || race.accessCode;
        if (code) await raceCodeRef(code).remove();
        
        await clearActivityFromActiveSession();

        // Clear timer reference
        if (global.activeRaceTimers && global.activeRaceTimers[id]) {
          delete global.activeRaceTimers[id];
        }
        
        console.log('✅ Resumed Space Race auto-ended successfully:', id);
      } catch (error) {
        console.error('❌ Failed to auto-end resumed race:', error);
      }
    }, remainingTime);
    
    // Store timer reference
    global.activeRaceTimers = global.activeRaceTimers || {};
    global.activeRaceTimers[id] = autoEndTimer;
    }
    if (!autoEndEnabled) {
      console.log('Auto-end disabled on resume; Space Race will remain active until manually ended.');
    }
    
    await raceRef(id).update({
      status: 'active',
      isPaused: false,
      resumedAt: new Date().toISOString(),
      endTime: newEndTime.toISOString(),
      remainingTime: null // Clear remaining time
    });
    
    return res.json({ success: true, message: 'Space race resumed', newEndTime });
  } catch (error) {
    console.error('Resume space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// End space race - with auth fallback
router.post('/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = getUserId(req);

    const resolved = await resolveRaceRecord(id);
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const raceId = resolved.id;
    const race = resolved.data;
    if (!canManageRace(race, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (global.activeRaceTimers && global.activeRaceTimers[raceId]) {
      clearTimeout(global.activeRaceTimers[raceId]);
      delete global.activeRaceTimers[raceId];
    }

    await clearActivityFromActiveSession();

    await raceRef(raceId).update({
      status: 'completed',
      endedAt: new Date().toISOString(),
      isPaused: false,
      endTime: new Date().toISOString(),
      manuallyEnded: true,
    });

    const code = race.joinCode || race.accessCode;
    if (code) await raceCodeRef(code).remove();

    return res.json({
      success: true,
      message: 'Space race ended permanently',
      status: 'completed',
      raceId,
    });
  } catch (error) {
    console.error('End space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Hide space race - with auth fallback
router.post('/:id/hide', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = getUserId(req);
    
    console.log('👤 User ID for hide race:', uid);
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await raceRef(id).update({
      status: 'hidden',
      isVisible: false,
      hiddenAt: new Date().toISOString()
    });
    
    return res.json({ success: true, message: 'Space race hidden' });
  } catch (error) {
    console.error('Hide space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Unhide space race - with auth fallback
router.post('/:id/unhide', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = getUserId(req);
    
    console.log('👤 User ID for unhide race:', uid);
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await raceRef(id).update({
      status: 'active',
      isVisible: true,
      unhiddenAt: new Date().toISOString()
    });
    
    return res.json({ success: true, message: 'Space race unhidden' });
  } catch (error) {
    console.error('Unhide space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update space race - with auth fallback
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = getUserId(req);
    const updates = req.body;

    console.log('👤 User ID for update race:', uid);
    console.log('📝 Updates received:', updates);

    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const race = raceSnap.val();
    console.log('📋 Current race data:', { id: race.id, title: race.title, currentSettings: race.settings });

    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // If updating settings, merge with existing settings instead of overwriting
    if (updates.settings) {
      const mergedSettings = {
        ...(race.settings || {}),
        ...updates.settings
      };
      // Clamp studentsPerTeam to maximum 6
      if (mergedSettings.studentsPerTeam !== undefined) {
        mergedSettings.studentsPerTeam = Math.min(mergedSettings.studentsPerTeam, 6);
      }
      updates.settings = mergedSettings;
      console.log('🔄 Merged settings:', mergedSettings);

      // Also update the top-level teams field if numberOfTeams changed
      if (mergedSettings.numberOfTeams !== undefined) {
        updates.teams = mergedSettings.numberOfTeams;
        console.log('🔄 Updated top-level teams field to:', mergedSettings.numberOfTeams);
      }
    }

    console.log('📤 Final updates to write to Firebase:', updates);
    await raceRef(id).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });

    console.log('✅ Race updated successfully');
    return res.json({ success: true, message: 'Space race updated' });
  } catch (error) {
    console.error('❌ Update space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update space race status - with auth fallback
router.put('/status/:id', async (req, res) => {
  try {
    let raceId = req.params.id;
    const { status } = req.body;
    const uid = getUserId(req);
    
    console.log('👤 User ID for update status:', uid);
    console.log('📝 Updating race status to:', status);
    
    let resolved = await resolveRaceRecord(raceId);
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    raceId = resolved.id;
    
    const race = resolved.data;
    if (!canManageRace(race, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const updateData = {
      status,
      updatedAt: new Date().toISOString()
    };
    
    // Add specific timestamps based on status
    if (status === 'active') {
      const launchPrep = await prepareActivityLaunch('spaceRace');
      if (!launchPrep.ok) {
        return res.status(400).json({ success: false, error: launchPrep.error });
      }

      updateData.startedAt = new Date().toISOString();
      updateData.isPaused = false;
      updateData.accessCode = launchPrep.sessionCode;
      updateData.joinCode = launchPrep.sessionCode;
      updateData.sessionCode = launchPrep.sessionCode;

      // Don't set endTime here - endTime should only be set when quiz starts (synchronized timer)
      // The join duration timer is calculated from startedAt + joinDuration in the frontend

      await raceCodeRef(launchPrep.sessionCode).set(raceId);
      
      await setSessionCurrentActivity(launchPrep.sessionId, 'spaceRace');
      await appendSessionActivityHistory(launchPrep.sessionId, {
        type: 'spaceRace',
        name: race.title || 'Space Race',
        activityId: raceId,
      });
    } else if (status === 'paused') {
      updateData.pausedAt = new Date().toISOString();
      updateData.isPaused = true;
    } else if (status === 'ended' || status === 'completed') {
      updateData.endedAt = new Date().toISOString();
      updateData.isPaused = false;
      updateData.endTime = new Date().toISOString();
      const code = race.joinCode || race.accessCode;
      if (code) await raceCodeRef(code).remove();
      await clearActivityFromActiveSession();
    }

    await raceRef(raceId).update(updateData);

    // Fetch and return the updated race data with all settings
    const updatedRaceSnap = await raceRef(raceId).get();
    const updatedRaceData = updatedRaceSnap.exists() ? updatedRaceSnap.val() : null;

    return res.json({
      success: true,
      message: `Space race status updated to ${status}`,
      data: updatedRaceData || updateData
    });
  } catch (error) {
    console.error('Update space race status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle space race visibility - with auth fallback
router.patch('/:id/visibility', async (req, res) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;
    const uid = getUserId(req);
    
    console.log('👤 User ID for toggle visibility:', uid);
    console.log('👁️ Setting visibility to:', isVisible);
    
    const raceSnap = await raceRef(id).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }
    
    const race = raceSnap.val();
    if (race.createdBy !== uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const updateData = {
      isVisible,
      updatedAt: new Date().toISOString()
    };
    
    if (isVisible) {
      updateData.status = 'active';
      updateData.unhiddenAt = new Date().toISOString();
    } else {
      updateData.status = 'hidden';
      updateData.hiddenAt = new Date().toISOString();
    }
    
    await raceRef(id).update(updateData);
    
    return res.json({ 
      success: true, 
      message: `Space race visibility updated to ${isVisible ? 'visible' : 'hidden'}` 
    });
  } catch (error) {
    console.error('Toggle space race visibility error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete space race - with auth fallback
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = getUserId(req);
    
    console.log('🗑️ Delete space race:', id);
    console.log('👤 User ID for delete race:', uid);
    
    const resolved = await resolveRaceRecord(id);
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const { id: raceId, data: race } = resolved;
    if (!canManageRace(race, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const code = race.joinCode || race.accessCode;
    const updates = {
      [`spaceRaces/${raceId}`]: null,
      [`space_race_participants/${raceId}`]: null,
      [`space_race_responses/${raceId}`]: null,
      [`space_race_team_scores/${raceId}`]: null,
      [`space_race_team_messages/${raceId}`]: null,
      [`space_race_team_selection/${raceId}`]: null,
    };
    if (code) updates[`space_race_codes/${String(code).toUpperCase()}`] = null;
    await db.ref().update(updates);

    if (String(race.status || '').toLowerCase() === 'active') {
      await clearActivityFromActiveSession();
    }

    console.log('✅ Space Race deleted successfully:', raceId);
    
    return res.json({ 
      success: true, 
      message: 'Space Race deleted permanently',
      raceId,
    });
    
  } catch (error) {
    console.error('❌ Delete space race error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:raceId/standings', async (req, res) => {
  try {
    const { raceId } = req.params;
    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const participantsSnapshot = await raceParticipantsRef(raceId).get();
    const participants = [];
    const teamScoresFromDb = {};

    const raw = participantsSnapshot.exists() ? participantsSnapshot.val() || {} : {};
    Object.entries(raw).forEach(([pid, participant]) => {
      participants.push({
        id: pid,
        name: participant.name || 'Unknown',
        score: Number(participant.score || 0),
        teamId: participant.teamId ?? 1,
      });
    });

    const teamScoresSnap = await db.ref(`space_race_team_scores/${raceId}`).get();
    if (teamScoresSnap.exists()) {
      const rawTeamScores = teamScoresSnap.val() || {};
      Object.entries(rawTeamScores).forEach(([key, value]) => {
        const teamId = String(key).replace(/^team_/, '');
        teamScoresFromDb[teamId] = getTeamScoreValue(value);
      });
    }

    // In Space Race, all team members have the same score, so use max (or any member's score)
    participants.forEach((participant) => {
      const teamId = String(participant.teamId ?? 1);
      const memberScore = Number(participant.score || 0);
      if (!teamScoresFromDb[teamId]) {
        teamScoresFromDb[teamId] = 0;
      }
      // Use max since all team members have the same score in Space Race
      teamScoresFromDb[teamId] = Math.max(teamScoresFromDb[teamId], memberScore);
    });

    return res.json({
      success: true,
      data: {
        participants,
        teamScores: teamScoresFromDb,
      },
    });
  } catch (error) {
    console.error('Get standings error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Team chat message (NO AUTH - students in active race)
const teamChatMessagesRef = (raceId, teamId) =>
  db.ref(`space_race_team_messages/${raceId}/team_${teamId}`);

router.get('/:raceId/team-chat', async (req, res) => {
  try {
    const { raceId } = req.params;
    const { teamId } = req.query;

    if (teamId === undefined || teamId === null || teamId === '') {
      return res.status(400).json({ success: false, error: 'teamId is required' });
    }

    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const snap = await teamChatMessagesRef(raceId, teamId).get();
    const messages = snap.exists()
      ? Object.values(snap.val() || {}).sort((a, b) =>
          String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
        )
      : [];

    return res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get team chat messages error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:raceId/team-selection', async (req, res) => {
  try {
    const { raceId } = req.params;
    const { teamId, questionId } = req.query;

    if (teamId === undefined || teamId === null || teamId === '' || !questionId) {
      return res.status(400).json({
        success: false,
        error: 'teamId and questionId are required',
      });
    }

    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const path = `space_race_team_selection/${raceId}/team_${teamId}/question_${questionId}`;
    const snap = await db.ref(path).get();

    return res.json({
      success: true,
      data: snap.exists() ? snap.val() : null,
    });
  } catch (error) {
    console.error('Get team selection error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:raceId/team-chat', async (req, res) => {
  try {
    const { raceId } = req.params;
    const {
      participantId,
      teamId,
      senderName,
      text = '',
      type = 'text',
      url = '',
      fileName = '',
      linkTitle = '',
    } = req.body;

    console.log('📨 Team chat message received:', { raceId, participantId, teamId, type, textLength: text?.length, urlLength: url?.length, fileName });

    if (!participantId || teamId === undefined || teamId === null) {
      console.error('❌ Missing required fields:', { participantId, teamId });
      return res.status(400).json({
        success: false,
        error: 'participantId and teamId are required',
      });
    }

    const raceSnap = await raceRef(raceId).get();
    if (!raceSnap.exists()) {
      console.error('❌ Race not found:', raceId);
      return res.status(404).json({ success: false, error: 'Space race not found' });
    }

    const race = raceSnap.val() || {};
    if (race.status !== 'active') {
      console.error('❌ Race not active:', race.status);
      return res.status(403).json({
        success: false,
        error: 'Team chat is only available during an active race',
      });
    }

    const participantSnap = await raceParticipantsRef(raceId).child(participantId).get();
    if (!participantSnap.exists()) {
      console.error('❌ Participant not found:', participantId);
      return res.status(403).json({ success: false, error: 'Participant not found in this race' });
    }

    const participant = participantSnap.val() || {};
    if (String(participant.teamId) !== String(teamId)) {
      console.error('❌ Team mismatch:', { participantTeamId: participant.teamId, requestTeamId: teamId });
      return res.status(403).json({
        success: false,
        error: 'You can only post messages to your own team chat',
      });
    }

    const trimmedText = String(text || '').trim();
    const trimmedUrl = String(url || '').trim();
    if (!trimmedText && !trimmedUrl) {
      console.error('❌ Empty message');
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }

    // Check if URL is too long for Firebase Realtime Database (limit ~1MB per node)
    if (trimmedUrl.length > 200000000) {
      console.error('❌ URL too long:', trimmedUrl.length);
      return res.status(400).json({ 
        success: false, 
        error: 'File too large. Maximum size is 200MB. Please use a smaller file.' 
      });
    }

    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newMessage = {
      id: msgId,
      raceId,
      teamId: Number(teamId),
      participantId,
      senderName: participant.name || 'Student',
      text: trimmedText,
      type: type || 'text',
      url: trimmedUrl,
      fileName: fileName || '',
      linkTitle: linkTitle || '',
      timestamp: new Date().toISOString(),
    };

    console.log('💾 Saving message to Firebase:', { msgId, messageSize: JSON.stringify(newMessage).length });
    await teamChatMessagesRef(raceId, teamId).child(msgId).set(newMessage);
    console.log('✅ Message saved successfully');

    try {
      await archiveSharedResource(race, raceId, newMessage);
    } catch (archiveError) {
      console.error('⚠️ Failed to archive shared resource (live chat unaffected):', archiveError);
    }

    return res.status(201).json({
      success: true,
      data: newMessage,
      message: 'Team chat message sent',
    });
  } catch (error) {
    console.error('❌ Team chat message error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
