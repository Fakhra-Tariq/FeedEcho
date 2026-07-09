const { db } = require('../config/firebase');
const sessionManager = require('./sessionManager');

/**
 * Ensures at most one session per teacher has status "active".
 * The canonical active session is the singleton (if valid), else the most recent active by createdAt.
 */
async function reconcileTeacherActiveSessions(teacherId) {
  if (!teacherId) {
    return { keptSessionId: null, endedCount: 0 };
  }

  const singleton = await sessionManager.getActiveSession();
  let canonicalActiveId = null;

  if (
    singleton &&
    singleton.type === 'session' &&
    String(singleton.status || '').toLowerCase() === 'active'
  ) {
    const candidateId = singleton.sessionId || singleton.id;
    if (candidateId) {
      const snap = await db.ref(`sessions/${candidateId}`).get();
      if (snap.exists()) {
        const row = snap.val() || {};
        if (
          row.teacherId === teacherId &&
          String(row.status || '').toLowerCase() === 'active'
        ) {
          canonicalActiveId = candidateId;
        }
      }
    }
  }

  const teacherSessions = [];
  const allSnap = await db.ref('sessions').get();
  if (allSnap.exists()) {
    Object.entries(allSnap.val() || {}).forEach(([id, value]) => {
      if (!value || value.teacherId !== teacherId) return;
      teacherSessions.push({ ...value, id: value.id || id });
    });
  }

  const activeSessions = teacherSessions.filter(
    (s) => String(s.status || '').toLowerCase() === 'active'
  );

  if (!canonicalActiveId && activeSessions.length > 0) {
    activeSessions.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    canonicalActiveId = activeSessions[0].id;
  }

  const now = new Date().toISOString();
  const updates = {};
  let endedCount = 0;

  activeSessions.forEach((session) => {
    if (session.id === canonicalActiveId) return;

    updates[`sessions/${session.id}/status`] = 'ended';
    updates[`sessions/${session.id}/currentActivity`] = null;
    updates[`sessions/${session.id}/endedAt`] = session.endedAt || now;
    updates[`sessions/${session.id}/updatedAt`] = now;

    if (session.sessionCode) {
      updates[`session_codes/${String(session.sessionCode).toUpperCase()}`] = null;
    }
    endedCount += 1;
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(
      `reconcileTeacherActiveSessions: ended ${endedCount} stale active session(s) for teacher ${teacherId}`
    );
  }

  if (canonicalActiveId) {
    await repairActiveSessionSingleton(teacherId, canonicalActiveId);
  }

  return { keptSessionId: canonicalActiveId, endedCount };
}

/**
 * Restores activeSession/singleton when a sessions/{id} row is active but the singleton is missing or stale.
 */
async function repairActiveSessionSingleton(teacherId = null, preferredSessionId = null) {
  let session = null;

  if (preferredSessionId) {
    const snap = await db.ref(`sessions/${preferredSessionId}`).get();
    if (snap.exists()) {
      const row = snap.val() || {};
      if (
        String(row.status || '').toLowerCase() === 'active' &&
        (!teacherId || row.teacherId === teacherId)
      ) {
        session = { ...row, id: row.id || preferredSessionId };
      }
    }
  }

  if (!session) {
    const allSnap = await db.ref('sessions').get();
    if (!allSnap.exists()) {
      return { repaired: false, sessionId: null, singleton: null };
    }

    const activeSessions = [];
    allSnap.forEach((child) => {
      const val = child.val();
      if (!val || String(val.status || '').toLowerCase() !== 'active') return;
      if (teacherId && val.teacherId !== teacherId) return;
      activeSessions.push({ ...val, id: val.id || child.key });
    });

    if (activeSessions.length === 0) {
      return { repaired: false, sessionId: null, singleton: null };
    }

    activeSessions.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    session = activeSessions[0];
  }

  const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
  if (!sessionCode || sessionCode.length !== 6) {
    return { repaired: false, sessionId: session.id, singleton: null };
  }

  const singleton = await sessionManager.getActiveSession();
  const singletonOk =
    singleton &&
    String(singleton.status || '').toLowerCase() === 'active' &&
    String(singleton.sessionId || singleton.id) === String(session.id) &&
    String(singleton.accessCode || singleton.joinCode || '').toUpperCase() === sessionCode;

  if (singletonOk) {
    return { repaired: false, sessionId: session.id, singleton };
  }

  await sessionManager.createActiveSession({
    sessionId: session.id,
    type: 'session',
    accessCode: sessionCode,
    teacherId: session.teacherId,
  });

  console.log('🔧 Repaired activeSession/singleton for session', session.id);
  const repaired = await sessionManager.getActiveSession();
  return { repaired: true, sessionId: session.id, singleton: repaired };
}

module.exports = {
  reconcileTeacherActiveSessions,
  repairActiveSessionSingleton,
};
