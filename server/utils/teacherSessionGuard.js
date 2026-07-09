const { db } = require('../config/firebase');
const sessionManager = require('./sessionManager');
const { repairActiveSessionSingleton } = require('./sessionStatusReconcile');

const NO_ACTIVE_SESSION_MESSAGE =
  'Please create a session first before launching an activity.';

const ACTIVITY_IN_USE_MESSAGE =
  'Another activity is already active. Please end it before launching a new one.';

/** Stored on sessions/{id}.currentActivity */
const SESSION_ACTIVITY_TYPES = {
  quiz: 'quiz',
  spaceRace: 'spacerace',
  exitTicket: 'exitticket',
  anonymousChat: 'livechat',
};

function normalizeSessionActivityType(activityType) {
  const t = String(activityType || '').toLowerCase().replace(/_/g, '');
  if (t === 'quiz') return SESSION_ACTIVITY_TYPES.quiz;
  if (t === 'spacerace') return SESSION_ACTIVITY_TYPES.spaceRace;
  if (t === 'exitticket') return SESSION_ACTIVITY_TYPES.exitTicket;
  if (t === 'livechat' || t === 'anonymouschat') return SESSION_ACTIVITY_TYPES.anonymousChat;
  return t;
}

function isCurrentActivityEmpty(value) {
  if (value == null || value === '') return true;
  // Legacy object shape from earlier implementation
  if (typeof value === 'object' && value.type) return false;
  return false;
}

function resolveActivityKind(currentActivity) {
  if (currentActivity == null || currentActivity === '') return null;
  if (typeof currentActivity === 'object' && currentActivity.type) {
    return normalizeSessionActivityType(currentActivity.type);
  }
  return normalizeSessionActivityType(currentActivity);
}

/**
 * Ensures the teacher has an active session (can be standalone session or activity session).
 * Made more flexible to support different session types.
 */
async function requireActiveTeacherSession() {
  let activeSession = await sessionManager.getActiveSession();

  if (!activeSession || String(activeSession.status || '').toLowerCase() !== 'active') {
    const repair = await repairActiveSessionSingleton();
    activeSession = repair.singleton;
  }

  if (!activeSession || String(activeSession.status || '').toLowerCase() !== 'active') {
    console.log('❌ requireActiveTeacherSession: No active session or not active');
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  // Remove strict type check - allow any active session type
  // if (activeSession.type !== 'session') {
  //   return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  // }

  const sessionId = activeSession.sessionId || activeSession.quizId || activeSession.raceId;
  if (!sessionId) {
    console.log('❌ requireActiveTeacherSession: No sessionId found');
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  const sessionCode = String(activeSession.accessCode || activeSession.joinCode || '')
    .trim()
    .toUpperCase();

  if (!sessionCode || sessionCode.length !== 6) {
    console.log('❌ requireActiveTeacherSession: Invalid sessionCode', sessionCode);
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  console.log('✅ requireActiveTeacherSession: Valid session', { sessionId, sessionCode, type: activeSession.type });

  // If it's a standalone session, also check the sessions collection
  if (activeSession.type === 'session') {
    const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists()) {
      console.log('❌ requireActiveTeacherSession: Session document not found');
      return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
    }

    const session = sessionSnap.val() || {};
    if (String(session.status || '').toLowerCase() !== 'active') {
      console.log('❌ requireActiveTeacherSession: Session not active', session.status);
      return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
    }

    const docCode = String(session.sessionCode || sessionCode || '')
      .trim()
      .toUpperCase();

    return { ok: true, sessionCode: docCode, sessionId, session };
  }

  // For activity sessions (quiz, spaceRace, etc.), return the active session data
  return { ok: true, sessionCode, sessionId, session: activeSession };
}

/**
 * Returns true when sessions/{id}.currentActivity still maps to a live quiz/race/ticket/chat.
 */
async function isSessionActivityStillLive(session) {
  if (!session || isCurrentActivityEmpty(session.currentActivity)) {
    return false;
  }

  const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
  if (!sessionCode || sessionCode.length !== 6) {
    return false;
  }

  const kind = resolveActivityKind(session.currentActivity);

  if (kind === SESSION_ACTIVITY_TYPES.quiz) {
    const quizIdSnap = await db.ref(`quiz_codes/${sessionCode}`).get();
    if (!quizIdSnap.exists()) return false;
    const quizSnap = await db.ref(`quizzes/${quizIdSnap.val()}`).get();
    if (!quizSnap.exists()) return false;
    const quiz = quizSnap.val() || {};
    const status = String(quiz.status || '').toLowerCase();
    return quiz.launched === true && (status === 'launched' || status === 'active');
  }

  if (kind === SESSION_ACTIVITY_TYPES.spaceRace) {
    const raceIdSnap = await db.ref(`space_race_codes/${sessionCode}`).get();
    if (!raceIdSnap.exists()) return false;
    const raceSnap = await db.ref(`spaceRaces/${raceIdSnap.val()}`).get();
    if (!raceSnap.exists()) return false;
    const race = raceSnap.val() || {};
    const status = String(race.status || '').toLowerCase();
    return ['active', 'running', 'started', 'live'].includes(status);
  }

  if (kind === SESSION_ACTIVITY_TYPES.exitTicket) {
    const ticketIdSnap = await db.ref(`exit_ticket_codes/${sessionCode}`).get();
    if (!ticketIdSnap.exists()) return false;
    const ticketSnap = await db.ref(`exit_tickets/${ticketIdSnap.val()}`).get();
    if (!ticketSnap.exists()) return false;
    const ticket = ticketSnap.val() || {};
    const status = String(ticket.status || '').toLowerCase();
    return status === 'active' || status === 'live' || status === 'started';
  }

  if (kind === SESSION_ACTIVITY_TYPES.anonymousChat) {
    const chatIdSnap = await db.ref(`chat_join_codes/${sessionCode}`).get();
    if (!chatIdSnap.exists()) return false;
    const chatSnap = await db.ref(`chat_sessions/${chatIdSnap.val()}`).get();
    if (!chatSnap.exists()) return false;
    const chat = chatSnap.val() || {};
    return chat.isActive === true || String(chat.status || '').toLowerCase() === 'active';
  }

  return false;
}

/**
 * Clears stale currentActivity when the linked activity is no longer live.
 */
async function reconcileSessionCurrentActivity(sessionId) {
  const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists()) {
    return { cleared: false, session: null };
  }

  const session = sessionSnap.val() || {};
  if (isCurrentActivityEmpty(session.currentActivity)) {
    return { cleared: false, session };
  }

  const stillLive = await isSessionActivityStillLive(session);
  if (stillLive) {
    return { cleared: false, session };
  }

  console.log('🧹 Clearing stale currentActivity for session', sessionId, session.currentActivity);
  await clearSessionCurrentActivity(sessionId);
  return { cleared: true, session: { ...session, currentActivity: null } };
}

/**
 * One activity per session: currentActivity must be null before launch.
 * Auto-clears stale flags when the previous activity already ended.
 */
async function assertSessionCanLaunchActivity(sessionId) {
  const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists()) {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  let session = sessionSnap.val() || {};

  if (!isCurrentActivityEmpty(session.currentActivity)) {
    const stillLive = await isSessionActivityStillLive(session);
    if (!stillLive) {
      await clearSessionCurrentActivity(sessionId);
      session = { ...session, currentActivity: null };
    } else {
      return { ok: false, error: ACTIVITY_IN_USE_MESSAGE };
    }
  }

  return { ok: true, session };
}

/**
 * Validates session + empty currentActivity, for use at activity launch.
 */
async function prepareActivityLaunch(activityType) {
  let activeSession = await sessionManager.getActiveSession();

  if (
    !activeSession ||
    String(activeSession.status || '').toLowerCase() !== 'active' ||
    activeSession.type !== 'session'
  ) {
    const repair = await repairActiveSessionSingleton();
    activeSession = repair.singleton;
  }

  const teacherSession = await requireActiveTeacherSession();
  if (!teacherSession.ok) {
    return teacherSession;
  }

  const sessionSnap = await db.ref(`sessions/${teacherSession.sessionId}`).get();
  if (!sessionSnap.exists()) {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  const session = sessionSnap.val() || {};
  if (String(session.status || '').toLowerCase() !== 'active') {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  const sessionCode = String(session.sessionCode || teacherSession.sessionCode || '')
    .trim()
    .toUpperCase();

  if (!sessionCode || sessionCode.length !== 6) {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  const canLaunch = await assertSessionCanLaunchActivity(teacherSession.sessionId);
  if (!canLaunch.ok) {
    return canLaunch;
  }

  return {
    ok: true,
    sessionId: teacherSession.sessionId,
    sessionCode,
    activityType: normalizeSessionActivityType(activityType),
  };
}

async function setSessionCurrentActivity(sessionId, activityType) {
  await db.ref(`sessions/${sessionId}`).update({
    currentActivity: normalizeSessionActivityType(activityType),
    updatedAt: new Date().toISOString(),
  });
}

async function clearSessionCurrentActivity(sessionId) {
  await db.ref(`sessions/${sessionId}`).update({
    currentActivity: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Records an activity launch in sessions/{id}/activityHistory for session history UI.
 */
async function appendSessionActivityHistory(sessionId, { type, name, activityId }) {
  if (!sessionId) return null;

  const entryRef = db.ref(`sessions/${sessionId}/activityHistory`).push();
  const entryId = entryRef.key;
  const entry = {
    id: entryId,
    type: normalizeSessionActivityType(type),
    name: String(name || '').trim() || 'Untitled',
    launchedAt: new Date().toISOString(),
  };
  if (activityId) entry.activityId = activityId;

  await entryRef.set(entry);
  return entry;
}

/**
 * Ends an activity: sets sessions.currentActivity back to null.
 */
async function clearActivityFromActiveSession() {
  const activeSession = await sessionManager.getActiveSession();
  if (!activeSession || activeSession.type !== 'session' || !activeSession.sessionId) {
    return;
  }
  await clearSessionCurrentActivity(activeSession.sessionId);
}

module.exports = {
  NO_ACTIVE_SESSION_MESSAGE,
  ACTIVITY_IN_USE_MESSAGE,
  SESSION_ACTIVITY_TYPES,
  normalizeSessionActivityType,
  isCurrentActivityEmpty,
  requireActiveTeacherSession,
  assertSessionCanLaunchActivity,
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearSessionCurrentActivity,
  clearActivityFromActiveSession,
  appendSessionActivityHistory,
  reconcileSessionCurrentActivity,
  isSessionActivityStillLive,
};
