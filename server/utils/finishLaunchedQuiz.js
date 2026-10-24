const { db } = require('../config/firebase');
const { closeActiveQuizLaunch } = require('./quizLaunches');

const quizRef = (id) => db.ref(`quizzes/${id}`);
const quizCodeRef = (code) => db.ref(`quiz_codes/${String(code).toUpperCase()}`);

/**
 * Same writes as POST /quizzes/:id/finish. Safe to call twice (already-ended quizzes skip).
 */
async function finishLaunchedQuiz(quizId, existingInput = null) {
  let existing = existingInput;
  if (!existing) {
    const snap = await quizRef(quizId).get();
    if (!snap.exists()) return { ok: false, skipped: true };
    existing = snap.val() || {};
  }

  const status = String(existing.status || '').toLowerCase();
  const launched = existing.launched === true || status === 'launched' || status === 'active';
  if (!launched) {
    return { ok: true, skipped: true };
  }

  const {
    releaseSessionActivityClaim,
    clearActivityFromActiveSession,
  } = require('./teacherSessionGuard');

  const now = new Date().toISOString();
  const sessionCode = String(
    existing?.launchSettings?.accessCode || existing?.sessionCode || ''
  )
    .trim()
    .toUpperCase();
  if (sessionCode.length === 6) {
    const sessionIdSnap = await db.ref(`session_codes/${sessionCode}`).get();
    if (sessionIdSnap.exists()) {
      await releaseSessionActivityClaim(sessionIdSnap.val(), 'quiz', quizId);
    }
  }
  await clearActivityFromActiveSession('quiz', quizId, existing.createdBy);
  await closeActiveQuizLaunch(quizId, existing, now);

  await quizRef(quizId).update({
    status: 'ready',
    launched: false,
    launchSettings: null,
    sessionCode: null,
    currentLaunchId: null,
    finishedAt: now,
    updatedAt: now,
  });

  const code = existing?.launchSettings?.accessCode;
  if (code) await quizCodeRef(code).remove();

  return { ok: true, skipped: false };
}

async function finishExpiredQuizzesForTeacher(teacherId) {
  if (!teacherId) return { finished: 0 };
  const { isQuizExpired } = require('./quizExpiry');
  const snap = await db.ref('quizzes').orderByChild('createdBy').equalTo(teacherId).get();
  if (!snap.exists()) return { finished: 0 };

  const jobs = [];
  snap.forEach((child) => {
    const quiz = child.val() || {};
    if (isQuizExpired(quiz)) {
      jobs.push(finishLaunchedQuiz(child.key, quiz));
    }
  });
  if (!jobs.length) return { finished: 0 };
  const results = await Promise.allSettled(jobs);
  return {
    finished: results.filter((r) => r.status === 'fulfilled' && r.value && !r.value.skipped).length,
  };
}

module.exports = {
  finishLaunchedQuiz,
  finishExpiredQuizzesForTeacher,
};
