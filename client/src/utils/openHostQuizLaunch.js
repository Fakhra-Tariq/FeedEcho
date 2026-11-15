import { resolveActiveTeacherSession } from './requireActiveHostSession';

/**
 * Same launch gate as Quiz Library: resolve an active teacher session, then
 * the caller opens LaunchQuizModal with the quiz + join code.
 */
export async function openHostQuizLaunch({ activeSession, teacherUid, quiz }) {
  const sessionCheck = await resolveActiveTeacherSession(activeSession, teacherUid);
  if (!sessionCheck.ok) {
    return { ok: false, reason: 'no-session' };
  }
  if (!quiz || !quiz.id) {
    return { ok: false, reason: 'no-quiz' };
  }
  return { ok: true, quiz, joinCode: sessionCheck.joinCode };
}
