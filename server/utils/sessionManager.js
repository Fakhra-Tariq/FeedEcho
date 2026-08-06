const { db } = require('../config/firebase');

/** Legacy global pointer — never authoritative for multi-teacher launches. */
const LEGACY_SINGLETON_PATH = 'activeSession/singleton';

/** Per-teacher active session pointer. */
const teacherPath = (teacherId) => `activeSession/byTeacher/${String(teacherId)}`;

function normalizeSession(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    ...data,
    type: data.type,
    sessionId: data.sessionId || data.quizId || data.raceId || null,
    accessCode:
      typeof data.accessCode === 'string' ? data.accessCode.toUpperCase() : data.accessCode,
    status: typeof data.status === 'string' ? data.status.toLowerCase() : data.status,
    teacherId: data.teacherId || null,
  };
}

/**
 * Get the active session pointer for a specific teacher.
 * When teacherId is omitted, returns null (never a global cross-teacher session).
 */
async function getActiveSession(teacherId = null) {
  try {
    if (!teacherId) {
      return null;
    }

    const snap = await db.ref(teacherPath(teacherId)).get();
    if (snap.exists()) {
      return normalizeSession(snap.val() || {});
    }

    return null;
  } catch (error) {
    console.error('sessionManager.getActiveSession error:', error);
    return null;
  }
}

/**
 * Create or overwrite the per-teacher active session pointer.
 * Requires teacherId so teachers never overwrite each other.
 */
async function createActiveSession(data) {
  const { type, sessionId, accessCode, teacherId } = data || {};

  if (!type || !sessionId || !accessCode) {
    throw new Error('createActiveSession requires type, sessionId, and accessCode');
  }
  if (!teacherId) {
    throw new Error('createActiveSession requires teacherId for session isolation');
  }

  const payload = {
    type,
    sessionId,
    accessCode: String(accessCode).toUpperCase(),
    status: 'active',
    createdAt: data.createdAt || new Date().toISOString(),
    teacherId,
  };

  await db.ref(teacherPath(teacherId)).set(payload);

  // Best-effort: remove legacy global singleton if it still points at this teacher,
  // so old clients cannot keep reading a stolen global pointer.
  try {
    const legacySnap = await db.ref(LEGACY_SINGLETON_PATH).get();
    if (legacySnap.exists()) {
      const legacy = legacySnap.val() || {};
      if (
        !legacy.teacherId ||
        legacy.teacherId === teacherId ||
        String(legacy.sessionId || '') === String(sessionId)
      ) {
        await db.ref(LEGACY_SINGLETON_PATH).remove();
      }
    }
  } catch (error) {
    console.warn('sessionManager.createActiveSession: legacy singleton cleanup skipped', error.message);
  }

  console.log('sessionManager.createActiveSession:', payload);
  return payload;
}

/**
 * Clear the active session pointer for one teacher only.
 * If sessionId is provided, only clears when the pointer matches that session.
 */
async function clearActiveSession(teacherId = null, sessionId = null) {
  try {
    if (!teacherId) {
      console.warn('sessionManager.clearActiveSession: teacherId required; refusing global clear');
      return false;
    }

    if (sessionId) {
      const current = await getActiveSession(teacherId);
      if (
        current &&
        String(current.sessionId || '') !== String(sessionId) &&
        String(current.id || '') !== String(sessionId)
      ) {
        return false;
      }
    }

    await db.ref(teacherPath(teacherId)).remove();
    console.log('sessionManager.clearActiveSession: cleared for teacher', teacherId);
    return true;
  } catch (error) {
    console.error('sessionManager.clearActiveSession error:', error);
    return false;
  }
}

/**
 * Returns true if this teacher has an active session pointer.
 */
async function isSessionActive(teacherId = null) {
  const session = await getActiveSession(teacherId);
  if (!session) return false;
  return String(session.status || '').toLowerCase() === 'active';
}

module.exports = {
  getActiveSession,
  createActiveSession,
  clearActiveSession,
  isSessionActive,
  teacherPath,
};
