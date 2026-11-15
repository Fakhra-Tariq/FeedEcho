const { db } = require('../config/firebase');

const ALREADY_ATTEMPTED_MESSAGE = 'You have already completed this quiz';

const ALREADY_ATTEMPTED_BODY = {
  success: false,
  code: 'ALREADY_ATTEMPTED',
  error: ALREADY_ATTEMPTED_MESSAGE,
  message: ALREADY_ATTEMPTED_MESSAGE,
};

function asRows(val) {
  if (!val || typeof val !== 'object') return [];
  return Object.entries(val).map(([key, row]) => {
    if (!row || typeof row !== 'object') return null;
    return { ...row, participantId: row.participantId || key };
  }).filter(Boolean);
}

function matchesLaunch(row, currentLaunchId) {
  if (!currentLaunchId) return !row.launchId;
  if (row.launchId && String(row.launchId) !== String(currentLaunchId)) return false;
  return true;
}

function matchesIdentity(row, { studentUid, participantId } = {}) {
  if (!row || typeof row !== 'object') return false;
  if (participantId && String(row.participantId) === String(participantId)) return true;
  if (studentUid && row.studentUid && String(row.studentUid) === String(studentUid)) return true;
  return false;
}

async function loadQuizSubmissions(quizId, currentLaunchId) {
  const rows = [];
  if (currentLaunchId) {
    const launchSnap = await db.ref(`quiz_launch_submissions/${quizId}/${currentLaunchId}`).get();
    if (launchSnap.exists()) rows.push(...asRows(launchSnap.val()));
  }
  const subsSnap = await db.ref(`quiz_submissions/${quizId}`).get();
  if (subsSnap.exists()) rows.push(...asRows(subsSnap.val()));
  return rows.filter((row) => matchesLaunch(row, currentLaunchId));
}

/**
 * Find a completed attempt for this live launch.
 * Logged-in students match by uid; guests match by participantId only (not by name).
 */
async function findCompletedQuizAttempt(quizId, currentLaunchId, identity = {}) {
  const { studentUid, participantId } = identity;
  if (!studentUid && !participantId) return null;
  const rows = await loadQuizSubmissions(quizId, currentLaunchId);
  return rows.find((row) => matchesIdentity(row, { studentUid, participantId })) || null;
}

module.exports = {
  ALREADY_ATTEMPTED_BODY,
  ALREADY_ATTEMPTED_MESSAGE,
  findCompletedQuizAttempt,
  matchesIdentity,
};
