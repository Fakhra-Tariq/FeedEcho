const { db } = require('../config/firebase');
const sessionManager = require('./sessionManager');

/**
 * Find this teacher's currently active standalone session from sessions/*.
 * Never uses a global singleton or another teacher's session.
 */
async function findActiveStandaloneSessionForTeacher(teacherId) {
  if (!teacherId) return null;

  let snap;
  try {
    snap = await db.ref('sessions').orderByChild('teacherId').equalTo(teacherId).get();
  } catch (queryError) {
    console.warn(
      'findActiveStandaloneSessionForTeacher: indexed query failed, scanning:',
      queryError.message
    );
    snap = await db.ref('sessions').get();
  }

  if (!snap.exists()) return null;

  const activeSessions = [];
  Object.entries(snap.val() || {}).forEach(([id, value]) => {
    if (!value || value.teacherId !== teacherId) return;
    if (String(value.status || '').toLowerCase() !== 'active') return;
    activeSessions.push({ ...value, id: value.id || id });
  });

  if (activeSessions.length === 0) return null;

  activeSessions.sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  return activeSessions[0];
}

/**
 * Ensures at most one session per teacher has status "active".
 * Canonical session is preferredSessionId, else most recent active for THAT teacher only.
 */
async function reconcileTeacherActiveSessions(teacherId) {
  if (!teacherId) {
    return { keptSessionId: null, endedCount: 0 };
  }

  const pointer = await sessionManager.getActiveSession(teacherId);
  let canonicalActiveId = null;

  if (
    pointer &&
    pointer.type === 'session' &&
    String(pointer.status || '').toLowerCase() === 'active'
  ) {
    const candidateId = pointer.sessionId || pointer.id;
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
  let allSnap;
  try {
    allSnap = await db.ref('sessions').orderByChild('teacherId').equalTo(teacherId).get();
  } catch {
    allSnap = await db.ref('sessions').get();
  }

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
  } else {
    await sessionManager.clearActiveSession(teacherId);
  }

  return { keptSessionId: canonicalActiveId, endedCount };
}

/**
 * Syncs activeSession/byTeacher/{teacherId} from sessions/{id}.
 * Requires teacherId — never repairs using another teacher's session.
 */
async function repairActiveSessionSingleton(teacherId = null, preferredSessionId = null) {
  if (!teacherId) {
    console.warn('repairActiveSessionSingleton: teacherId required; refusing cross-teacher repair');
    return { repaired: false, sessionId: null, singleton: null };
  }

  let session = null;

  if (preferredSessionId) {
    const snap = await db.ref(`sessions/${preferredSessionId}`).get();
    if (snap.exists()) {
      const row = snap.val() || {};
      if (
        String(row.status || '').toLowerCase() === 'active' &&
        row.teacherId === teacherId
      ) {
        session = { ...row, id: row.id || preferredSessionId };
      }
    }
  }

  if (!session) {
    session = await findActiveStandaloneSessionForTeacher(teacherId);
  }

  if (!session) {
    await sessionManager.clearActiveSession(teacherId);
    return { repaired: false, sessionId: null, singleton: null };
  }

  const sessionCode = String(session.sessionCode || '').trim().toUpperCase();
  if (!sessionCode || sessionCode.length !== 6) {
    return { repaired: false, sessionId: session.id, singleton: null };
  }

  const pointer = await sessionManager.getActiveSession(teacherId);
  const pointerOk =
    pointer &&
    String(pointer.status || '').toLowerCase() === 'active' &&
    String(pointer.sessionId || pointer.id) === String(session.id) &&
    String(pointer.accessCode || pointer.joinCode || '').toUpperCase() === sessionCode &&
    pointer.teacherId === teacherId;

  if (pointerOk) {
    return { repaired: false, sessionId: session.id, singleton: pointer };
  }

  await sessionManager.createActiveSession({
    sessionId: session.id,
    type: 'session',
    accessCode: sessionCode,
    teacherId: session.teacherId || teacherId,
  });

  console.log('🔧 Repaired activeSession pointer for teacher', teacherId, 'session', session.id);
  const repaired = await sessionManager.getActiveSession(teacherId);
  return { repaired: true, sessionId: session.id, singleton: repaired };
}

module.exports = {
  findActiveStandaloneSessionForTeacher,
  reconcileTeacherActiveSessions,
  repairActiveSessionSingleton,
};
