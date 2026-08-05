const { db } = require('../config/firebase');
const {
  normalizeSessionActivityType,
  isCurrentActivityEmpty,
  SESSION_ACTIVITY_TYPES,
} = require('./teacherSessionGuard');
const { closeActiveQuizLaunch } = require('./quizLaunches');

const quizRef = (id) => db.ref(`quizzes/${id}`);
const quizCodeRef = (code) => db.ref(`quiz_codes/${String(code).toUpperCase()}`);

const raceRef = (id) => db.ref(`spaceRaces/${id}`);
const raceCodeRef = (code) => db.ref(`space_race_codes/${String(code).toUpperCase()}`);

const ticketRef = (id) => db.ref(`exit_tickets/${id}`);
const ticketJoinCodeRef = (code) => db.ref(`exit_ticket_codes/${String(code).toUpperCase()}`);

const chatSessionRef = (id) => db.ref(`chat_sessions/${id}`);
const chatJoinCodeRef = (code) => db.ref(`chat_join_codes/${String(code).toUpperCase()}`);

function resolveActivityKind(currentActivity) {
  if (currentActivity == null || currentActivity === '') return null;
  if (typeof currentActivity === 'object' && currentActivity.type) {
    return normalizeSessionActivityType(currentActivity.type);
  }
  return normalizeSessionActivityType(currentActivity);
}

async function endQuizForSession(sessionCode, now) {
  const quizIdSnap = await quizCodeRef(sessionCode).get();
  if (!quizIdSnap.exists()) {
    console.warn('endSessionActiveActivity: no quiz mapped to session code', sessionCode);
    return { ended: false, type: SESSION_ACTIVITY_TYPES.quiz };
  }

  const quizId = quizIdSnap.val();
  const snap = await quizRef(quizId).get();
  if (!snap.exists()) {
    await quizCodeRef(sessionCode).remove();
    return { ended: false, type: SESSION_ACTIVITY_TYPES.quiz, id: quizId };
  }

  const existing = snap.val() || {};
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

  const code = existing?.launchSettings?.accessCode || sessionCode;
  if (code) await quizCodeRef(String(code).toUpperCase()).remove();

  console.log('endSessionActiveActivity: quiz ended', quizId);
  return { ended: true, type: SESSION_ACTIVITY_TYPES.quiz, id: quizId };
}

async function endSpaceRaceForSession(sessionCode, now) {
  const raceIdSnap = await raceCodeRef(sessionCode).get();
  if (!raceIdSnap.exists()) {
    console.warn('endSessionActiveActivity: no space race mapped to session code', sessionCode);
    return { ended: false, type: SESSION_ACTIVITY_TYPES.spaceRace };
  }

  const raceId = raceIdSnap.val();
  const raceSnap = await raceRef(raceId).get();
  if (!raceSnap.exists()) {
    await raceCodeRef(sessionCode).remove();
    return { ended: false, type: SESSION_ACTIVITY_TYPES.spaceRace, id: raceId };
  }

  const race = raceSnap.val() || {};

  if (global.activeRaceTimers && global.activeRaceTimers[raceId]) {
    clearTimeout(global.activeRaceTimers[raceId]);
    delete global.activeRaceTimers[raceId];
  }

  await raceRef(raceId).update({
    status: 'completed',
    endedAt: now,
    isPaused: false,
    endTime: now,
    manuallyEnded: true,
    updatedAt: now,
  });

  const code = race.joinCode || race.accessCode || sessionCode;
  if (code) await raceCodeRef(String(code).toUpperCase()).remove();

  console.log('endSessionActiveActivity: space race ended', raceId);
  return { ended: true, type: SESSION_ACTIVITY_TYPES.spaceRace, id: raceId };
}

async function endExitTicketForSession(sessionCode, now) {
  const ticketIdSnap = await ticketJoinCodeRef(sessionCode).get();
  if (!ticketIdSnap.exists()) {
    console.warn('endSessionActiveActivity: no exit ticket mapped to session code', sessionCode);
    return { ended: false, type: SESSION_ACTIVITY_TYPES.exitTicket };
  }

  const ticketId = ticketIdSnap.val();
  const snap = await ticketRef(ticketId).get();
  if (!snap.exists()) {
    return { ended: false, type: SESSION_ACTIVITY_TYPES.exitTicket, id: ticketId };
  }

  await ticketRef(ticketId).update({
    status: 'ended',
    endedAt: now,
    updatedAt: now,
  });
  await ticketJoinCodeRef(sessionCode).remove();

  console.log('endSessionActiveActivity: exit ticket ended', ticketId);
  return { ended: true, type: SESSION_ACTIVITY_TYPES.exitTicket, id: ticketId };
}

async function endLiveChatForSession(sessionCode, now) {
  const chatIdSnap = await chatJoinCodeRef(sessionCode).get();
  if (!chatIdSnap.exists()) {
    console.warn('endSessionActiveActivity: no live chat mapped to session code', sessionCode);
    return { ended: false, type: SESSION_ACTIVITY_TYPES.anonymousChat };
  }

  const chatId = chatIdSnap.val();
  const snap = await chatSessionRef(chatId).get();
  if (!snap.exists()) {
    await chatJoinCodeRef(sessionCode).remove();
    return { ended: false, type: SESSION_ACTIVITY_TYPES.anonymousChat, id: chatId };
  }

  await chatSessionRef(chatId).update({
    status: 'ended',
    isActive: false,
    endedAt: now,
    lastActivity: now,
    updatedAt: now,
  });
  await chatJoinCodeRef(sessionCode).remove();

  console.log('endSessionActiveActivity: live chat ended', chatId);
  return { ended: true, type: SESSION_ACTIVITY_TYPES.anonymousChat, id: chatId };
}

/**
 * Ends whichever activity is active on a standalone session (by currentActivity + sessionCode).
 * Call before setting the session status to "ended".
 */
async function endActiveActivityForSession(session) {
  if (!session || isCurrentActivityEmpty(session.currentActivity)) {
    return { ended: false, skipped: true };
  }

  const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
  if (!sessionCode || sessionCode.length !== 6) {
    console.warn('endSessionActiveActivity: invalid session code on session', session.id);
    return { ended: false, error: 'invalid_session_code' };
  }

  const kind = resolveActivityKind(session.currentActivity);
  const now = new Date().toISOString();

  switch (kind) {
    case SESSION_ACTIVITY_TYPES.quiz:
      return endQuizForSession(sessionCode, now);
    case SESSION_ACTIVITY_TYPES.spaceRace:
      return endSpaceRaceForSession(sessionCode, now);
    case SESSION_ACTIVITY_TYPES.exitTicket:
      return endExitTicketForSession(sessionCode, now);
    case SESSION_ACTIVITY_TYPES.anonymousChat:
      return endLiveChatForSession(sessionCode, now);
    default:
      console.warn('endSessionActiveActivity: unsupported activity kind', kind);
      return { ended: false, type: kind };
  }
}

module.exports = {
  endActiveActivityForSession,
  resolveActivityKind,
};
