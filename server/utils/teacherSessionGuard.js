const { db } = require('../config/firebase');
const sessionManager = require('./sessionManager');
const { repairActiveSessionSingleton } = require('./sessionStatusReconcile');

const NO_ACTIVE_SESSION_MESSAGE =
  'Please create a session first before launching an activity.';

const ACTIVITY_IN_USE_MESSAGE =
  'Another activity is already active. Please finish the current activity before launching a new one.';

/** Stored on sessions/{id}.currentActivity */
const SESSION_ACTIVITY_TYPES = {
  quiz: 'quiz',
  spaceRace: 'spacerace',
  exitTicket: 'exitticket',
  anonymousChat: 'livechat',
};

const KNOWN_ACTIVITY_TYPES = new Set(Object.values(SESSION_ACTIVITY_TYPES));

const ACTIVITY_CODE_PATHS = {
  [SESSION_ACTIVITY_TYPES.quiz]: 'quiz_codes',
  [SESSION_ACTIVITY_TYPES.spaceRace]: 'space_race_codes',
  [SESSION_ACTIVITY_TYPES.exitTicket]: 'exit_ticket_codes',
  [SESSION_ACTIVITY_TYPES.anonymousChat]: 'chat_join_codes',
};

function normalizeSessionActivityType(activityType) {
  const t = String(activityType || '').toLowerCase().replace(/_/g, '');
  if (t === 'quiz') return SESSION_ACTIVITY_TYPES.quiz;
  if (t === 'spacerace') return SESSION_ACTIVITY_TYPES.spaceRace;
  if (t === 'exitticket') return SESSION_ACTIVITY_TYPES.exitTicket;
  if (t === 'livechat' || t === 'anonymouschat') return SESSION_ACTIVITY_TYPES.anonymousChat;
  return null;
}

function resolveActivityKind(currentActivity) {
  if (currentActivity == null || currentActivity === '') return null;
  if (typeof currentActivity === 'object' && currentActivity.type) {
    return normalizeSessionActivityType(currentActivity.type);
  }
  return normalizeSessionActivityType(currentActivity);
}

function resolveActivityId(currentActivity) {
  if (!currentActivity || typeof currentActivity !== 'object') return null;
  const id = currentActivity.activityId || currentActivity.id || null;
  return id != null && String(id).trim() !== '' ? String(id) : null;
}

function isCurrentActivityEmpty(value) {
  if (value == null || value === '') return true;
  if (typeof value === 'object') {
    if (value.status && String(value.status).toLowerCase() === 'finished') return true;
    const kind = normalizeSessionActivityType(value.type);
    return !kind || !KNOWN_ACTIVITY_TYPES.has(kind);
  }
  const kind = normalizeSessionActivityType(value);
  return !kind || !KNOWN_ACTIVITY_TYPES.has(kind);
}

function isSameSessionActivity(currentActivity, activityType, activityId = null) {
  if (isCurrentActivityEmpty(currentActivity)) return false;
  const wantKind = normalizeSessionActivityType(activityType);
  const curKind = resolveActivityKind(currentActivity);
  if (!wantKind || curKind !== wantKind) return false;
  if (!activityId) return true;
  const curId = resolveActivityId(currentActivity);
  if (!curId) return true;
  return String(curId) === String(activityId);
}

/**
 * Remove other activity code indexes for this session code so join cannot
 * resolve a stale/competing activity.
 */
async function clearCompetingActivityCodeIndexes(sessionCode, keepKind = null) {
  const code = String(sessionCode || '').trim().toUpperCase();
  if (!code || code.length !== 6) return;

  const updates = {};
  Object.entries(ACTIVITY_CODE_PATHS).forEach(([kind, path]) => {
    if (keepKind && kind === keepKind) return;
    updates[`${path}/${code}`] = null;
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
}

async function clearActivityCodeIndex(sessionCode, activityKind) {
  const code = String(sessionCode || '').trim().toUpperCase();
  const kind = normalizeSessionActivityType(activityKind);
  const path = ACTIVITY_CODE_PATHS[kind];
  if (!code || !path) return;
  await db.ref(`${path}/${code}`).remove();
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

  return { ok: true, sessionCode, sessionId, session: activeSession };
}

async function loadActivityByKind(kind, sessionCode, preferredActivityId = null) {
  if (preferredActivityId) {
    return preferredActivityId;
  }

  const path = ACTIVITY_CODE_PATHS[kind];
  if (!path || !sessionCode) return null;
  const snap = await db.ref(`${path}/${sessionCode}`).get();
  return snap.exists() ? snap.val() : null;
}

/**
 * Returns true when sessions/{id}.currentActivity still maps to a non-finished activity.
 * Paused/hidden activities still occupy the slot until Finish.
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
  const preferredId = resolveActivityId(session.currentActivity);

  if (kind === SESSION_ACTIVITY_TYPES.quiz) {
    const quizId = await loadActivityByKind(kind, sessionCode, preferredId);
    if (!quizId) return false;
    const quizSnap = await db.ref(`quizzes/${quizId}`).get();
    if (!quizSnap.exists()) return false;
    const quiz = quizSnap.val() || {};
    const status = String(quiz.status || '').toLowerCase();
    if (status === 'ready' || status === 'ended' || status === 'finished' || status === 'archived') {
      return false;
    }
    return quiz.launched === true || status === 'launched' || status === 'active';
  }

  if (kind === SESSION_ACTIVITY_TYPES.spaceRace) {
    const raceId = await loadActivityByKind(kind, sessionCode, preferredId);
    if (!raceId) return false;
    const raceSnap = await db.ref(`spaceRaces/${raceId}`).get();
    if (!raceSnap.exists()) return false;
    const race = raceSnap.val() || {};
    const status = String(race.status || '').toLowerCase();
    if (status === 'ended' || status === 'completed' || status === 'archived') {
      return false;
    }
    // active / paused / hidden / running all still occupy the session slot until Finish
    return ['active', 'running', 'started', 'live', 'paused', 'hidden'].includes(status) || race.isPaused === true;
  }

  if (kind === SESSION_ACTIVITY_TYPES.exitTicket) {
    const ticketId = await loadActivityByKind(kind, sessionCode, preferredId);
    if (!ticketId) return false;
    const ticketSnap = await db.ref(`exit_tickets/${ticketId}`).get();
    if (!ticketSnap.exists()) return false;
    const ticket = ticketSnap.val() || {};
    const status = String(ticket.status || '').toLowerCase();
    if (status === 'ended' || status === 'archived') return false;
    return status === 'active' || status === 'live' || status === 'started' || status === 'paused';
  }

  if (kind === SESSION_ACTIVITY_TYPES.anonymousChat) {
    const chatId = await loadActivityByKind(kind, sessionCode, preferredId);
    if (!chatId) return false;
    const chatSnap = await db.ref(`chat_sessions/${chatId}`).get();
    if (!chatSnap.exists()) return false;
    const chat = chatSnap.val() || {};
    if (String(chat.status || '').toLowerCase() === 'ended' || chat.isActive === false) {
      return false;
    }
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
    if (session.currentActivity != null && session.currentActivity !== '') {
      await clearSessionCurrentActivity(sessionId);
      return { cleared: true, session: { ...session, currentActivity: null } };
    }
    return { cleared: false, session };
  }

  const stillLive = await isSessionActivityStillLive(session);
  if (stillLive) {
    return { cleared: false, session };
  }

  console.log('🧹 Clearing stale currentActivity for session', sessionId, session.currentActivity);
  const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
  if (sessionCode) {
    await clearCompetingActivityCodeIndexes(sessionCode, null);
  }
  await clearSessionCurrentActivity(sessionId);
  return { cleared: true, session: { ...session, currentActivity: null } };
}

/**
 * One activity per session: currentActivity must be null before launch
 * (unless reclaiming the same activity). Auto-clears only truly finished activities.
 */
async function assertSessionCanLaunchActivity(sessionId, activityType = null, activityId = null) {
  const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists()) {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }

  let session = sessionSnap.val() || {};

  if (!isCurrentActivityEmpty(session.currentActivity)) {
    if (activityType && isSameSessionActivity(session.currentActivity, activityType, activityId)) {
      return { ok: true, session, alreadyClaimed: true };
    }

    const stillLive = await isSessionActivityStillLive(session);
    if (!stillLive) {
      const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
      if (sessionCode) {
        await clearCompetingActivityCodeIndexes(sessionCode, null);
      }
      await clearSessionCurrentActivity(sessionId);
      session = { ...session, currentActivity: null };
    } else {
      return { ok: false, error: ACTIVITY_IN_USE_MESSAGE };
    }
  }

  return { ok: true, session, alreadyClaimed: false };
}

/**
 * Validates session + empty currentActivity, for use at activity launch.
 * Pass activityId when reclaiming/resuming the same activity.
 */
async function prepareActivityLaunch(activityType, activityId = null) {
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

  const canLaunch = await assertSessionCanLaunchActivity(
    teacherSession.sessionId,
    activityType,
    activityId
  );
  if (!canLaunch.ok) {
    return canLaunch;
  }

  return {
    ok: true,
    sessionId: teacherSession.sessionId,
    sessionCode,
    activityType: normalizeSessionActivityType(activityType),
    alreadyClaimed: Boolean(canLaunch.alreadyClaimed),
  };
}

/**
 * Atomically claim sessions/{id}.currentActivity.
 * Succeeds only when empty or already owned by the same activity.
 * @returns {{ ok: boolean, error?: string }}
 */
async function setSessionCurrentActivity(sessionId, activityType, activityId = null) {
  const normalized = normalizeSessionActivityType(activityType);
  if (!normalized) {
    return { ok: false, error: ACTIVITY_IN_USE_MESSAGE };
  }

  const claim = {
    type: normalized,
    activityId: activityId || null,
    status: 'active',
  };

  let abortReason = ACTIVITY_IN_USE_MESSAGE;

  const txResult = await db.ref(`sessions/${sessionId}/currentActivity`).transaction((current) => {
    if (isCurrentActivityEmpty(current)) {
      return claim;
    }

    if (isSameSessionActivity(current, normalized, activityId)) {
      return claim;
    }

    abortReason = ACTIVITY_IN_USE_MESSAGE;
    return; // abort — another activity owns the slot
  });

  if (!txResult.committed) {
    console.warn('❌ setSessionCurrentActivity: claim rejected', {
      sessionId,
      activityType: normalized,
      activityId,
      current: txResult.snapshot?.val?.() ?? txResult.snapshot?.val(),
    });
    return { ok: false, error: abortReason };
  }

  const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
  const sessionCode = String(sessionSnap.exists() ? sessionSnap.val()?.sessionCode || '' : '')
    .trim()
    .toUpperCase();

  if (sessionCode) {
    await clearCompetingActivityCodeIndexes(sessionCode, normalized);
  }

  await db.ref(`sessions/${sessionId}`).update({
    updatedAt: new Date().toISOString(),
  });

  return { ok: true };
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

  const normalizedType = normalizeSessionActivityType(type);
  if (!normalizedType) return null;

  const entryRef = db.ref(`sessions/${sessionId}/activityHistory`).push();
  const entryId = entryRef.key;
  const entry = {
    id: entryId,
    type: normalizedType,
    name: String(name || '').trim() || 'Untitled',
    launchedAt: new Date().toISOString(),
  };
  if (activityId) entry.activityId = activityId;

  await entryRef.set(entry);
  return entry;
}

/**
 * Ends an activity's claim on a specific session.
 * When activityType/activityId are provided, only clears if that activity owns currentActivity.
 */
async function releaseSessionActivityClaim(sessionId, activityType = null, activityId = null) {
  if (!sessionId) return { cleared: false };

  const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists()) {
    return { cleared: false };
  }

  const session = sessionSnap.val() || {};
  const sessionCode = String(session.sessionCode || '')
    .trim()
    .toUpperCase();

  if (activityType && !isCurrentActivityEmpty(session.currentActivity)) {
    if (!isSameSessionActivity(session.currentActivity, activityType, activityId)) {
      console.log('⏭️ releaseSessionActivityClaim: skip — different activity owns the slot', {
        sessionId,
        finishing: { activityType, activityId },
        current: session.currentActivity,
      });
      if (sessionCode && activityType) {
        await clearActivityCodeIndex(sessionCode, activityType);
      }
      return { cleared: false };
    }
  }

  if (sessionCode) {
    await clearCompetingActivityCodeIndexes(sessionCode, null);
  }

  await clearSessionCurrentActivity(sessionId);
  return { cleared: true };
}

/**
 * Ends an activity's claim on the teacher's active session.
 * When activityType/activityId are provided, only clears if that activity owns currentActivity.
 */
async function clearActivityFromActiveSession(activityType = null, activityId = null) {
  const activeSession = await sessionManager.getActiveSession();
  if (!activeSession || activeSession.type !== 'session' || !activeSession.sessionId) {
    return { cleared: false };
  }

  return releaseSessionActivityClaim(activeSession.sessionId, activityType, activityId);
}

module.exports = {
  NO_ACTIVE_SESSION_MESSAGE,
  ACTIVITY_IN_USE_MESSAGE,
  SESSION_ACTIVITY_TYPES,
  normalizeSessionActivityType,
  isCurrentActivityEmpty,
  resolveActivityKind,
  resolveActivityId,
  isSameSessionActivity,
  requireActiveTeacherSession,
  assertSessionCanLaunchActivity,
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearSessionCurrentActivity,
  releaseSessionActivityClaim,
  clearActivityFromActiveSession,
  clearCompetingActivityCodeIndexes,
  clearActivityCodeIndex,
  appendSessionActivityHistory,
  reconcileSessionCurrentActivity,
  isSessionActivityStillLive,
};
