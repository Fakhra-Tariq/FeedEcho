const sessionManager = require('./sessionManager');

console.log('🔧 ActiveSessionManager initialized (teacher-scoped via sessionManager)');

/**
 * Legacy wrapper. Active session state is now per-teacher.
 * Callers must pass teacherId for correct isolation.
 */
class ActiveSessionManager {
  static async getActiveSession(teacherId = null) {
    try {
      const sessionData = await sessionManager.getActiveSession(teacherId);
      console.log('🔍 ActiveSessionManager.getActiveSession() result:', sessionData);
      return sessionData;
    } catch (error) {
      console.error('Error getting active session:', error);
      return null;
    }
  }

  static async createActiveSession(type, sessionId, accessCode, teacherId = null) {
    try {
      if (!teacherId) {
        throw new Error('ActiveSessionManager.createActiveSession requires teacherId');
      }
      return sessionManager.createActiveSession({
        type,
        sessionId,
        accessCode,
        teacherId,
      });
    } catch (error) {
      console.error('Error creating active session:', error);
      throw error;
    }
  }

  static async deleteActiveSession(teacherId = null, sessionId = null) {
    try {
      if (!teacherId) {
        console.warn('ActiveSessionManager.deleteActiveSession: teacherId required');
        return false;
      }
      return sessionManager.clearActiveSession(teacherId, sessionId);
    } catch (error) {
      console.error('Error deleting active session:', error);
      return false;
    }
  }

  static async isActivityBlocked(teacherId = null) {
    if (!teacherId) return false;
    const activeSession = await this.getActiveSession(teacherId);
    return Boolean(activeSession && String(activeSession.status || '').toLowerCase() === 'active');
  }

  static async validateAccessCode(code, teacherId = null) {
    if (!teacherId) {
      return { valid: false, error: 'No active session found' };
    }
    const activeSession = await this.getActiveSession(teacherId);
    if (!activeSession || String(activeSession.status || '').toLowerCase() !== 'active') {
      return { valid: false, error: 'No active session found' };
    }

    if (String(activeSession.accessCode || '').toUpperCase() !== String(code || '').toUpperCase()) {
      return { valid: false, error: 'Invalid access code' };
    }

    return { valid: true, session: activeSession };
  }
}

module.exports = ActiveSessionManager;
