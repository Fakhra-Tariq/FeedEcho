const { db } = require('../config/firebase');

const quizLaunchesRef = (quizId) => db.ref(`quiz_launches/${quizId}`);
const quizLaunchParticipantsRef = (quizId, launchId) =>
  db.ref(`quiz_launch_participants/${quizId}/${launchId}`);
const quizLaunchSubmissionsRef = (quizId, launchId) =>
  db.ref(`quiz_launch_submissions/${quizId}/${launchId}`);
const quizSubmissionsRef = (quizId) => db.ref(`quiz_submissions/${quizId}`);
const quizParticipantsRef = (quizId) => db.ref(`quiz_participants/${quizId}`);

const LEGACY_LAUNCH_ID = 'legacy';

const toEntries = (val) =>
  Object.entries(val && typeof val === 'object' ? val : {}).map(([key, row]) => ({
    ...(row && typeof row === 'object' ? row : {}),
    participantId: row?.participantId || row?.id || key,
  }));

const countLaunches = (launchesVal) =>
  Object.keys(launchesVal && typeof launchesVal === 'object' ? launchesVal : {}).length;

/**
 * If a quiz already has flat participants/submissions but no launch records,
 * copy them into a synthetic legacy launch so new launches stay isolated.
 */
async function ensureLegacyLaunchMigrated(quizId) {
  const launchesSnap = await quizLaunchesRef(quizId).get();
  if (launchesSnap.exists() && countLaunches(launchesSnap.val()) > 0) {
    return null;
  }

  const [subsSnap, partsSnap] = await Promise.all([
    quizSubmissionsRef(quizId).get(),
    quizParticipantsRef(quizId).get(),
  ]);

  const submissionsVal = subsSnap.exists() ? subsSnap.val() || {} : {};
  const participantsVal = partsSnap.exists() ? partsSnap.val() || {} : {};
  const submissionKeys = Object.keys(submissionsVal);
  const participantKeys = Object.keys(participantsVal);

  if (submissionKeys.length === 0 && participantKeys.length === 0) {
    return null;
  }

  let launchedAt = null;
  [...Object.values(participantsVal), ...Object.values(submissionsVal)].forEach((row) => {
    const candidate = row?.joinedAt || row?.submittedAt || row?.createdAt || null;
    if (!candidate) return;
    if (!launchedAt || String(candidate) < String(launchedAt)) {
      launchedAt = candidate;
    }
  });

  const now = new Date().toISOString();
  const launchRecord = {
    id: LEGACY_LAUNCH_ID,
    launchNumber: 1,
    launchedAt: launchedAt || now,
    finishedAt: now,
    status: 'ended',
    isLegacy: true,
    participantCount: participantKeys.length,
    submissionCount: submissionKeys.length,
  };

  const updates = {
    [`quiz_launches/${quizId}/${LEGACY_LAUNCH_ID}`]: launchRecord,
  };

  participantKeys.forEach((participantId) => {
    const row = {
      ...(participantsVal[participantId] || {}),
      participantId,
      launchId: LEGACY_LAUNCH_ID,
    };
    updates[`quiz_launch_participants/${quizId}/${LEGACY_LAUNCH_ID}/${participantId}`] = row;
    updates[`quiz_participants/${quizId}/${participantId}/launchId`] = LEGACY_LAUNCH_ID;
  });

  submissionKeys.forEach((participantId) => {
    const row = {
      ...(submissionsVal[participantId] || {}),
      participantId,
      launchId: LEGACY_LAUNCH_ID,
    };
    updates[`quiz_launch_submissions/${quizId}/${LEGACY_LAUNCH_ID}/${participantId}`] = row;
    updates[`quiz_submissions/${quizId}/${participantId}/launchId`] = LEGACY_LAUNCH_ID;
  });

  await db.ref().update(updates);
  return launchRecord;
}

async function createQuizLaunch(quizId, { launchedAt } = {}) {
  await ensureLegacyLaunchMigrated(quizId);

  const launchesSnap = await quizLaunchesRef(quizId).get();
  const existing = launchesSnap.exists() ? launchesSnap.val() || {} : {};
  const launchNumber = countLaunches(existing) + 1;
  const launchId = quizLaunchesRef(quizId).push().key;
  const now = launchedAt || new Date().toISOString();

  const launchRecord = {
    id: launchId,
    launchNumber,
    launchedAt: now,
    finishedAt: null,
    status: 'active',
    isLegacy: false,
    participantCount: 0,
    submissionCount: 0,
  };

  await quizLaunchesRef(quizId).child(launchId).set(launchRecord);
  return launchRecord;
}

async function endQuizLaunch(quizId, launchId, finishedAt = new Date().toISOString()) {
  if (!quizId || !launchId) return null;

  const launchRef = quizLaunchesRef(quizId).child(launchId);
  const snap = await launchRef.get();
  if (!snap.exists()) return null;

  const existing = snap.val() || {};
  if (existing.status === 'ended' && existing.finishedAt) {
    return existing;
  }

  const [partsSnap, subsSnap] = await Promise.all([
    quizLaunchParticipantsRef(quizId, launchId).get(),
    quizLaunchSubmissionsRef(quizId, launchId).get(),
  ]);

  const updates = {
    status: 'ended',
    finishedAt,
    participantCount: partsSnap.exists() ? Object.keys(partsSnap.val() || {}).length : 0,
    submissionCount: subsSnap.exists() ? Object.keys(subsSnap.val() || {}).length : 0,
  };

  await launchRef.update(updates);
  return { ...existing, ...updates, id: launchId };
}

/** Close the quiz's current launch (if any) and clear currentLaunchId. */
async function closeActiveQuizLaunch(quizId, quizData = {}, finishedAt = new Date().toISOString()) {
  const launchId = quizData?.currentLaunchId || null;
  if (launchId) {
    await endQuizLaunch(quizId, launchId, finishedAt);
  }
  await db.ref(`quizzes/${quizId}/currentLaunchId`).set(null);
  return launchId;
}

async function writeLaunchParticipant(quizId, launchId, participantId, participant) {
  if (!quizId || !launchId || !participantId) return;
  await quizLaunchParticipantsRef(quizId, launchId)
    .child(participantId)
    .set({
      ...participant,
      participantId,
      launchId,
    });
  await quizLaunchesRef(quizId)
    .child(launchId)
    .child('participantCount')
    .transaction((cur) => Number(cur || 0) + 1);
}

async function writeLaunchSubmission(quizId, launchId, participantId, submission, participantUpdates) {
  if (!quizId || !launchId || !participantId) return;

  await quizLaunchSubmissionsRef(quizId, launchId)
    .child(participantId)
    .set({
      ...submission,
      participantId,
      launchId,
    });

  if (participantUpdates && typeof participantUpdates === 'object') {
    await quizLaunchParticipantsRef(quizId, launchId)
      .child(participantId)
      .update({
        ...participantUpdates,
        launchId,
      });
  }

  await quizLaunchesRef(quizId)
    .child(launchId)
    .child('submissionCount')
    .transaction((cur) => Number(cur || 0) + 1);
}

async function loadLaunchBundles(quizId) {
  const [launchesSnap, launchPartsSnap, launchSubsSnap] = await Promise.all([
    quizLaunchesRef(quizId).get(),
    db.ref(`quiz_launch_participants/${quizId}`).get(),
    db.ref(`quiz_launch_submissions/${quizId}`).get(),
  ]);

  const launchesVal = launchesSnap.exists() ? launchesSnap.val() || {} : {};
  const partsByLaunch = launchPartsSnap.exists() ? launchPartsSnap.val() || {} : {};
  const subsByLaunch = launchSubsSnap.exists() ? launchSubsSnap.val() || {} : {};

  const launches = Object.entries(launchesVal)
    .map(([id, row]) => {
      const participants = toEntries(partsByLaunch[id]);
      const submissions = toEntries(subsByLaunch[id]);
      return {
        id,
        launchNumber: Number(row?.launchNumber) || 0,
        launchedAt: row?.launchedAt || null,
        finishedAt: row?.finishedAt || null,
        status: row?.status || 'ended',
        isLegacy: Boolean(row?.isLegacy) || id === LEGACY_LAUNCH_ID,
        participants,
        submissions,
        participantCount: Math.max(Number(row?.participantCount) || 0, participants.length),
        submissionCount: Math.max(Number(row?.submissionCount) || 0, submissions.length),
      };
    })
    .sort((a, b) => {
      const aTime = String(a.launchedAt || '');
      const bTime = String(b.launchedAt || '');
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return Number(a.launchNumber || 0) - Number(b.launchNumber || 0);
    })
    .map((launch, index) => ({
      ...launch,
      launchNumber: index + 1,
    }));

  return launches;
}

module.exports = {
  LEGACY_LAUNCH_ID,
  createQuizLaunch,
  endQuizLaunch,
  closeActiveQuizLaunch,
  ensureLegacyLaunchMigrated,
  writeLaunchParticipant,
  writeLaunchSubmission,
  loadLaunchBundles,
};
