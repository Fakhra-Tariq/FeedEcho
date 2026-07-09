import { sessionsAPI } from '../services/api';

export const NO_ACTIVE_SESSION_MESSAGE =
  'Please create a session first before launching an activity.';

export const ACTIVITY_IN_USE_MESSAGE =
  'Another activity is already active. Please end it before launching a new one.';

/**
 * @param {object|null|undefined} activeSession - from TeacherDataContext data.activeSession
 * @returns {{ joinCode: string, sessionId: string }|null}
 */
export function getActiveTeacherSession(activeSession) {
  if (!activeSession) {
    console.log('❌ getActiveTeacherSession: No active session');
    return null;
  }

  console.log('🔍 getActiveTeacherSession check:', {
    activeSession,
    type: activeSession.type,
    joinCode: activeSession.joinCode,
    sessionId: activeSession.sessionId,
    id: activeSession.id
  });

  const joinCode = (activeSession.joinCode || activeSession.accessCode || '').toString().trim().toUpperCase();
  const sessionId = activeSession.sessionId || activeSession.id;

  if (!joinCode) {
    console.log('❌ getActiveTeacherSession: No joinCode found');
    return null;
  }

  if (!sessionId) {
    console.log('❌ getActiveTeacherSession: No sessionId found');
    return null;
  }

  console.log('✅ getActiveTeacherSession: Valid session found', { joinCode, sessionId });
  return { joinCode, sessionId };
}

export function requireActiveTeacherSession(activeSession) {
  const session = getActiveTeacherSession(activeSession);
  if (!session) {
    return { ok: false, error: NO_ACTIVE_SESSION_MESSAGE };
  }
  return { ok: true, ...session };
}

/**
 * Resolves active session from context, then server (repairs RTDB singleton if needed).
 */
export async function resolveActiveTeacherSession(activeSession, teacherId) {
  const local = requireActiveTeacherSession(activeSession);
  if (local.ok) return local;

  if (!teacherId) return local;

  try {
    const res = await sessionsAPI.getActive(teacherId);
    const active = res.data?.data;
    if (active && String(active.status || '').toLowerCase() === 'active') {
      const joinCode = (active.sessionCode || active.accessCode || '')
        .toString()
        .trim()
        .toUpperCase();
      const sessionId = active.id || active.sessionId;
      if (joinCode && sessionId) {
        console.log('✅ resolveActiveTeacherSession: recovered from server', { joinCode, sessionId });
        return { ok: true, joinCode, sessionId };
      }
    }
  } catch (error) {
    console.warn('resolveActiveTeacherSession: server fallback failed', error);
  }

  return local;
}
