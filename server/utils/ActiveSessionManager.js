const { db } = require('../config/firebase');

console.log('🔧 ActiveSessionManager initialized with Firebase:', !!db);

// Global Active Session Management
class ActiveSessionManager {
  static async getActiveSession() {
    try {
      const snap = await db.ref('activeSession/singleton').get();
      const sessionData = snap.exists() ? snap.val() : null;
      console.log('🔍 ActiveSessionManager.getActiveSession() result:', sessionData);
      return sessionData;
    } catch (error) {
      console.error('Error getting active session:', error);
      return null;
    }
  }

  static async createActiveSession(type, sessionId, accessCode) {
    try {
      const sessionData = {
        id: 'singleton',
        type: type, // 'quiz' or 'spaceRace'
        sessionId: sessionId,
        accessCode: accessCode.toUpperCase(),
        status: 'active',
        createdAt: new Date().toISOString()
      };

      await db.ref('activeSession/singleton').set(sessionData);
      console.log('Active session created:', sessionData);
      return sessionData;
    } catch (error) {
      console.error('Error creating active session:', error);
      throw error;
    }
  }

  static async deleteActiveSession() {
    try {
      await db.ref('activeSession/singleton').remove();
      console.log('Active session deleted');
      return true;
    } catch (error) {
      console.error('Error deleting active session:', error);
      return false;
    }
  }

  static async isActivityBlocked() {
    const activeSession = await this.getActiveSession();
    console.log('🚫 ActiveSessionManager.isActivityBlocked() checking:', {
      activeSession: activeSession,
      status: activeSession?.status,
      isBlocked: activeSession && activeSession.status === 'active'
    });
    return activeSession && activeSession.status === 'active';
  }

  static async validateAccessCode(code) {
    const activeSession = await this.getActiveSession();
    if (!activeSession || activeSession.status !== 'active') {
      return { valid: false, error: 'No active session found' };
    }

    if (activeSession.accessCode !== code.toUpperCase()) {
      return { valid: false, error: 'Invalid access code' };
    }

    return { valid: true, session: activeSession };
  }
}

module.exports = ActiveSessionManager;
