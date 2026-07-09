const { db } = require('../config/firebase');

const PATH = 'activeSession/singleton';

/**
 * Get the current active session document.
 * Returns the document data or null if none exists.
 */
async function getActiveSession() {
  try {
    const snap = await db.ref(PATH).get();
    if (!snap.exists()) {
      return null;
    }

    const data = snap.val() || {};

    // Normalize common fields for safer downstream comparisons
    const normalized = {
      ...data,
      type: typeof data.type === 'string' ? data.type : data.type,
      sessionId: data.sessionId || data.quizId || data.raceId || null,
      accessCode: typeof data.accessCode === 'string'
        ? data.accessCode.toUpperCase()
        : data.accessCode,
      status: typeof data.status === 'string'
        ? data.status.toLowerCase()
        : data.status
    };

    return normalized;
  } catch (error) {
    console.error('sessionManager.getActiveSession error:', error);
    return null;
  }
}

/**
 * Create or overwrite the singleton active session document.
 * Data should at minimum include: type, sessionId, accessCode.
 */
async function createActiveSession(data) {
  const { type, sessionId, accessCode } = data || {};

  if (!type || !sessionId || !accessCode) {
    throw new Error('createActiveSession requires type, sessionId, and accessCode');
  }

  const payload = {
    type,
    sessionId,
    accessCode: String(accessCode).toUpperCase(),
    status: 'active',
    createdAt: data.createdAt || new Date().toISOString(),
    ...(data.teacherId ? { teacherId: data.teacherId } : {}),
  };

  await db.ref(PATH).set(payload);
  console.log('sessionManager.createActiveSession:', payload);
  return payload;
}

/**
 * Clear the active session singleton document.
 */
async function clearActiveSession() {
  try {
    await db.ref(PATH).remove();
    console.log('sessionManager.clearActiveSession: active session cleared');
    return true;
  } catch (error) {
    console.error('sessionManager.clearActiveSession error:', error);
    return false;
  }
}

/**
 * Returns true if there is an active session with status "active"
 * (case-insensitive); otherwise false.
 */
async function isSessionActive() {
  const session = await getActiveSession();
  if (!session) return false;

  const status = typeof session.status === 'string'
    ? session.status.toLowerCase()
    : session.status;

  return status === 'active';
}

module.exports = {
  getActiveSession,
  createActiveSession,
  clearActiveSession,
  isSessionActive
};

