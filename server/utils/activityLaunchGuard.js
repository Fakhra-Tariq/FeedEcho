/**
 * Global activity launch guard.
 * Only ONE activity (Quiz, Space Race, or Exit Ticket) can be active at a time per teacher.
 * Checks actual status in: quizzes, spaceRaces, exit_tickets.
 * Scoped to the current user (createdBy) so we only block when THIS teacher has another activity active.
 */

const BLOCK_MESSAGE = 'Another activity is already active. Please finish it before launching a new activity.';

/**
 * Check if the current user has any activity with status = active across all activity types.
 * RTDB doesn't support compound queries well, so we query by createdBy and filter in-memory.
 *
 * @param {admin.database.Database} db - Realtime Database instance
 * @param {string} userId - Current user ID (createdBy). Only this user's activities are considered.
 * @returns {Promise<{ blocked: boolean, message?: string }>}
 */
async function hasAnyActiveActivity(db, userId) {
  if (!userId) {
    return { blocked: false };
  }
  try {
    // 1) Any active Quiz for this user
    const quizSnap = await db.ref('quizzes').orderByChild('createdBy').equalTo(userId).get();
    if (quizSnap.exists()) {
      let blocked = false;
      const updates = {};
      const now = Date.now();
      quizSnap.forEach((child) => {
        if (blocked) return;
        const q = child.val() || {};
        const status = typeof q.status === 'string' ? q.status.toLowerCase() : q.status;
        const endTimeMs = q.launchSettings?.endTime ? new Date(q.launchSettings.endTime).getTime() : null;
        const expired = endTimeMs && !Number.isNaN(endTimeMs) && endTimeMs <= now;

        // Auto-heal stale launched quizzes that already expired so they don't block new activities.
        if (q.launched === true && expired) {
          updates[`quizzes/${child.key}/status`] = 'completed';
          updates[`quizzes/${child.key}/launched`] = false;
          updates[`quizzes/${child.key}/finishedAt`] = new Date().toISOString();
          updates[`quizzes/${child.key}/launchSettings`] = null;
          return;
        }

        if (q.launched === true && ['active', 'launched'].includes(status)) {
          blocked = true;
        }
      });
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
      if (blocked) {
      return { blocked: true, message: BLOCK_MESSAGE };
    }
    }

    // 2) Any active Space Race for this user
    const raceSnap = await db.ref('spaceRaces').orderByChild('createdBy').equalTo(userId).get();
    if (raceSnap.exists()) {
      let blocked = false;
      raceSnap.forEach((child) => {
        if (blocked) return;
        const r = child.val() || {};
        const status = typeof r.status === 'string' ? r.status.toLowerCase() : r.status;
        if (status === 'active') blocked = true;
      });
      if (blocked) {
      return { blocked: true, message: BLOCK_MESSAGE };
    }
    }

    // 3) Any active Exit Ticket for this user (only status === active blocks)
    const ticketSnap = await db.ref('exit_tickets').orderByChild('createdBy').equalTo(userId).get();
    if (ticketSnap.exists()) {
      let blocked = false;
      ticketSnap.forEach((child) => {
        if (blocked) return;
        const t = child.val() || {};
        const status = typeof t.status === 'string' ? t.status.toLowerCase() : t.status;
        if (status === 'active') blocked = true;
      });
      if (blocked) {
      return { blocked: true, message: BLOCK_MESSAGE };
    }
    }

    return { blocked: false };
  } catch (error) {
    console.error('activityLaunchGuard.hasAnyActiveActivity error:', error);
    return { blocked: false };
  }
}

module.exports = {
  hasAnyActiveActivity,
  BLOCK_MESSAGE
};
