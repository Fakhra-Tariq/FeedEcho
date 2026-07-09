const express = require('express');
const { db } = require('../config/firebase');
const { calculateQuizScore } = require('../utils/scoringUtils');

const normalizeQuestionsArray = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

const snapshotQuestionsForReview = (questions) =>
  normalizeQuestionsArray(questions).map((q) => {
    const row = {
      id: q.id,
      questionText: q.questionText || q.text || q.prompt || '',
      type: q.type,
      correctAnswer: q.correctAnswer,
    };
    if (q.sampleAnswer != null && q.sampleAnswer !== '') {
      row.sampleAnswer = q.sampleAnswer;
    }
    if (Array.isArray(q.options) && q.options.length) {
      row.options = q.options;
    }
    return row;
  });

/** Firebase RTDB rejects undefined anywhere in a .set() payload. */
const stripUndefinedDeep = (value) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  return Object.entries(value).reduce((acc, [key, val]) => {
    if (val === undefined) return acc;
    const cleaned = stripUndefinedDeep(val);
    if (cleaned !== undefined) acc[key] = cleaned;
    return acc;
  }, Array.isArray(value) ? [] : {});
};
const router = express.Router();

// ERD-aligned RTDB paths (quizzes + participants + submissions)
const quizRef = (quizId) => db.ref(`quizzes/${quizId}`);
const quizSubmissionsRef = (quizId) => db.ref(`quiz_submissions/${quizId}`);
const quizParticipantsRef = (quizId) => db.ref(`quiz_participants/${quizId}`);
const spaceRaceParticipantsRef = (raceId) => db.ref(`space_race_participants/${raceId}`);

// Submit quiz answers (NO AUTH - for students submitting)
router.post('/:quizId/submit', async (req, res) => {
  const { quizId } = req.params;
  const {
    participantId,
    studentName,
    answers,
    sessionCode,
    timeTaken,
    raceId,
    studentUid,
    studentEmail,
  } = req.body;

  const logContext = {
    quizId,
    participantId: participantId || null,
    studentName: studentName || null,
    sessionCode: sessionCode || null,
    studentUid: studentUid || null,
    answerCount: answers && typeof answers === 'object' ? Object.keys(answers).length : 0,
  };

  try {
    console.log('[quiz-submit] received', logContext);

    if (!participantId || !studentName || answers == null) {
      console.warn('[quiz-submit] rejected missing fields', logContext);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: participantId, studentName, answers',
      });
    }

    const answerCount =
      Array.isArray(answers) ? answers.length : Object.keys(answers || {}).length;
    if (answerCount === 0) {
      console.warn('[quiz-submit] rejected empty answers', logContext);
      return res.status(400).json({
        success: false,
        error: 'Answers cannot be empty',
      });
    }

    const quizSnap = await quizRef(quizId).get();
    if (!quizSnap.exists()) {
      console.warn('[quiz-submit] rejected quiz not found', logContext);
      return res.status(404).json({
        success: false,
        error: 'Quiz not found',
      });
    }

    const quiz = quizSnap.val();
    const quizStatus = typeof quiz.status === 'string' ? quiz.status.toLowerCase() : quiz.status;
    const isLaunchedQuiz =
      !!quiz.launched && (quizStatus === 'active' || quizStatus === 'launched');
    const launchSettings = quiz.launchSettings || {};

    const participantSnap = await quizParticipantsRef(quizId).child(participantId).get();
    const participantJoined = participantSnap.exists();

    if (launchSettings.oneAttempt && participantJoined) {
      const existingSubmissionSnap = await quizSubmissionsRef(quizId).child(participantId).get();
      if (existingSubmissionSnap.exists()) {
        console.warn('[quiz-submit] rejected duplicate attempt', logContext);
        return res.status(400).json({
          success: false,
          error: 'You have already completed this quiz',
        });
      }
    }

    if (participantJoined && launchSettings.timePerStudentMinutes > 0) {
      const participantData = participantSnap.val() || {};
      const joinedAtMs = participantData.joinedAt
        ? new Date(participantData.joinedAt).getTime()
        : NaN;
      if (!Number.isNaN(joinedAtMs)) {
        const attemptDeadline =
          joinedAtMs + Number(launchSettings.timePerStudentMinutes) * 60 * 1000;
        if (Date.now() > attemptDeadline + 15000) {
          console.warn('[quiz-submit] rejected attempt past per-student deadline', logContext);
          return res.status(400).json({
            success: false,
            error: 'Your time for this quiz has expired',
          });
        }
      }
    }

    // Joined students may submit after the live session ends; only reject unknown guests.
    if (!participantJoined && !isLaunchedQuiz) {
      console.warn('[quiz-submit] rejected quiz inactive and participant not joined', {
        ...logContext,
        launched: !!quiz.launched,
        quizStatus,
        participantJoined,
      });
      return res.status(400).json({
        success: false,
        error: 'Quiz is not active',
      });
    }

    if (!participantJoined) {
      console.warn('[quiz-submit] allowing guest submit on active quiz', logContext);
    }

    let score, correctAnswers, totalQuestions, percentage;

    // For Space Race, use pre-calculated team score from Firebase
    if (raceId && participantId) {
      try {
        const participantSnap = await spaceRaceParticipantsRef(raceId).child(participantId).get();
        if (participantSnap.exists()) {
          const participantData = participantSnap.val();
          const teamScore = participantData.score || 0;
          const teamAnswers = participantData.answers || [];
          
          // Calculate percentage from team answers
          const correctCount = teamAnswers.filter(a => a.isCorrect).length;
          totalQuestions = quiz.questions.length;
          correctAnswers = correctCount;
          score = teamScore;
          percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
          
          console.log('🎯 Using Space Race team score:', {
            teamScore,
            correctCount,
            totalQuestions,
            percentage
          });
        } else {
          console.log('⚠️ Space Race participant not found, falling back to local calculation');
          // Fallback to local calculation
          const scoringResult = calculateQuizScore(quiz.questions, answers, quiz.type);
          score = scoringResult.score;
          correctAnswers = scoringResult.correctAnswers;
          totalQuestions = scoringResult.totalQuestions;
          percentage = scoringResult.percentage;
        }
      } catch (error) {
        console.error('Error fetching Space Race participant score:', error);
        // Fallback to local calculation
        const scoringResult = calculateQuizScore(quiz.questions, answers, quiz.type);
        score = scoringResult.score;
        correctAnswers = scoringResult.correctAnswers;
        totalQuestions = scoringResult.totalQuestions;
        percentage = scoringResult.percentage;
      }
    } else {
      // Regular quiz - calculate score normally
      const scoringResult = calculateQuizScore(quiz.questions, answers, quiz.type);
      score = scoringResult.score;
      correctAnswers = scoringResult.correctAnswers;
      totalQuestions = scoringResult.totalQuestions;
      percentage = scoringResult.percentage;
    }

    console.log('📊 Final score calculation:', {
      score,
      correctAnswers,
      totalQuestions,
      percentage
    });

    // Create submission document
    const submission = stripUndefinedDeep({
      participantId,
      studentName,
      sessionCode,
      quizId,
      quizTitle: quiz.title,
      answers,
      score,
      correctAnswers,
      totalQuestions,
      percentage,
      submittedAt: new Date().toISOString(),
      timeTaken:
        timeTaken != null && !Number.isNaN(Number(timeTaken))
          ? Math.max(1, Math.round(Number(timeTaken)))
          : 1,
      quizType: quiz.type,
      questions: snapshotQuestionsForReview(quiz.questions),
      ...(studentUid ? { studentUid } : {}),
      ...(studentEmail ? { studentEmail } : {}),
    });

    // Save submission
    try {
      await quizSubmissionsRef(quizId).child(participantId).set(submission);
      await quizParticipantsRef(quizId).child(participantId).update(
        stripUndefinedDeep({
          score,
          percentage,
          submittedAt: submission.submittedAt,
          timeTaken,
          status: 'completed',
          ...(studentUid ? { studentUid } : {}),
          ...(studentEmail ? { studentEmail } : {}),
        })
      );
    } catch (writeError) {
      console.error('[quiz-submit] RTDB write failed', {
        ...logContext,
        error: writeError.message,
        stack: writeError.stack,
      });
      return res.status(500).json({
        success: false,
        error: 'Server error during submission',
      });
    }

    console.log('[quiz-submit] saved', {
      ...logContext,
      score,
      percentage,
      totalQuestions,
    });

    return res.json({
      success: true,
      data: {
        score,
        correctAnswers,
        totalQuestions,
        percentage,
        points: score,
        submittedAt: submission.submittedAt
      },
      message: 'Quiz submitted successfully!'
    });

  } catch (error) {
    console.error('[quiz-submit] unhandled error', {
      ...logContext,
      error: error.message,
      stack: error.stack,
      name: error.name,
    });
    return res.status(500).json({
      success: false,
      error: 'Server error during submission',
      detail: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
});

// Get quiz results (teacher only)
router.get('/:quizId/results', async (req, res) => {
  try {
    const { quizId } = req.params;
    
    // Get all submissions for this quiz (keyed by participantId in RTDB)
    const submissionsSnap = await quizSubmissionsRef(quizId).get();
    const submissionsVal = submissionsSnap.exists() ? submissionsSnap.val() || {} : {};
    const submissionEntries = Object.entries(submissionsVal).map(([participantId, sub]) => ({
      ...(sub || {}),
      participantId: sub?.participantId || participantId,
    }));

    const participantsSnap = await quizParticipantsRef(quizId).get();
    const participantsVal = participantsSnap.exists() ? participantsSnap.val() || {} : {};
    const participantEntries = Object.entries(participantsVal).map(([participantId, p]) => ({
      ...(p || {}),
      participantId: p?.participantId || p?.id || participantId,
    }));

    // Get quiz details
    const quizSnap = await quizRef(quizId).get();
    const quiz = quizSnap.exists() ? { id: quizId, ...quizSnap.val() } : null;

    const totalQuestionsDefault = Array.isArray(quiz?.questions)
      ? quiz.questions.length
      : quiz?.questions && typeof quiz.questions === 'object'
      ? Object.keys(quiz.questions).length
      : 0;

    const submissionMap = new Map();
    submissionEntries.forEach((sub) => {
      submissionMap.set(sub.participantId, sub);
    });

    participantEntries.forEach((p) => {
      const isCompleted =
        p.status === 'completed' ||
        Boolean(p.submittedAt) ||
        (p.percentage != null && !Number.isNaN(Number(p.percentage)));
      if (!isCompleted) return;

      const existing = submissionMap.get(p.participantId) || {};
      const totalQuestions = Number(
        existing.totalQuestions ?? p.totalQuestions ?? totalQuestionsDefault ?? 0
      );
      const percentage = Number(existing.percentage ?? p.percentage ?? 0);
      const correctAnswers =
        existing.correctAnswers != null
          ? Number(existing.correctAnswers)
          : totalQuestions > 0
          ? Math.round((percentage / 100) * totalQuestions)
          : Number(existing.score ?? p.score ?? 0);

      submissionMap.set(p.participantId, {
        ...p,
        ...existing,
        participantId: p.participantId,
        studentName: existing.studentName || p.studentName || p.name || 'Anonymous Student',
        percentage,
        correctAnswers,
        totalQuestions,
        score: existing.score ?? p.score ?? correctAnswers,
        submittedAt: existing.submittedAt || p.submittedAt || null,
        timeTaken: existing.timeTaken ?? p.timeTaken ?? null,
        answers: existing.answers || {},
        questions: existing.questions || quiz?.questions,
        quizType: existing.quizType || p.quizType || quiz?.type || '',
      });
    });

    const submissions = Array.from(submissionMap.values());
    const participants = participantEntries;

    return res.json({
      success: true,
      data: {
        quiz,
        submissions,
        participants,
        totalSubmissions: submissions.length,
        totalParticipants: Math.max(participants.length, submissions.length),
      }
    });

  } catch (error) {
    console.error('Get quiz results error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

module.exports = router;
