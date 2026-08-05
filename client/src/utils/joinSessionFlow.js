import { sessionsAPI } from '../services/api';
import { normalizeTeamId, saveSpaceRaceParticipant } from './spaceRaceSession';
import { getStoredAudienceSession } from './audienceSession';
import { persistQuizParticipantSession } from './quizParticipantSession';

export function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
}

function buildJoinContext(studentName, loggedInAudience) {
  const loggedIn = loggedInAudience || getStoredAudienceSession();
  return {
    trimmedName: String(studentName || loggedIn?.name || 'Student').trim(),
    studentUid: loggedIn?.uid || null,
    studentEmail: loggedIn?.email || null,
    loggedInAudience: loggedIn,
  };
}

function persistJoinIdentity(trimmedName, { studentUid, studentEmail }) {
  sessionStorage.setItem('studentName', trimmedName);
  if (studentUid) {
    sessionStorage.setItem('studentUid', studentUid);
  } else {
    sessionStorage.removeItem('studentUid');
  }
  if (studentEmail) {
    sessionStorage.setItem('studentEmail', studentEmail);
  } else {
    sessionStorage.removeItem('studentEmail');
  }
}

function buildQuizSessionPayload(trimmedName, trimmedCode, quizId, participantId, data, ctx) {
  const payload = {
    studentName: trimmedName,
    sessionCode: trimmedCode,
    quizId,
    participantId,
    quizTitle: data.title || 'Untitled Quiz',
    quizType: data.type || 'Multiple Choice',
    quiz: data,
    joinedAt: new Date().toISOString(),
    isLocked: true,
    lockTimestamp: new Date().toISOString(),
  };

  if (ctx.studentUid) payload.studentUid = ctx.studentUid;
  if (ctx.studentEmail) payload.studentEmail = ctx.studentEmail;

  return payload;
}

/**
 * Apply a successful /sessions/join payload and navigate to the matching activity.
 * Session currentActivity is the single source of truth on the server.
 */
export async function proceedWithSessionJoin({
  trimmedName,
  trimmedCode,
  teamId = null,
  navigate,
  studentUid = null,
  studentEmail = null,
  loggedInAudience = null,
  onTeamSelectionRequired = null,
}) {
  const ctx = {
    trimmedName,
    studentUid,
    studentEmail,
    loggedInAudience: loggedInAudience || getStoredAudienceSession(),
  };

  const joinResponse = await sessionsAPI.join(trimmedName, trimmedCode, teamId, {
    studentUid: ctx.studentUid,
    studentEmail: ctx.studentEmail,
  });

  const payload = joinResponse.data || {};

  if (payload.needsTeamSelection && payload.type === 'spaceRace') {
    if (onTeamSelectionRequired) {
      onTeamSelectionRequired({
        sessionCode: trimmedCode,
        studentName: trimmedName,
        raceData: payload.data,
        studentUid: ctx.studentUid,
        studentEmail: ctx.studentEmail,
      });
    }
    return {
      success: false,
      needsTeamSelection: true,
      raceData: payload.data,
      raceId: payload.raceId,
    };
  }

  if (!payload.success) {
    throw new Error(payload.message || payload.error || 'Failed to join session');
  }

  const { type, data, raceId, quizId, participantId, teamId: assignedTeamId, joinCode, ticketId, chatId } =
    payload;
  const resolvedTeamId = normalizeTeamId(
    assignedTeamId ?? teamId ?? data?.participant?.teamId ?? null
  );

  persistJoinIdentity(trimmedName, ctx);
  sessionStorage.setItem('sessionCode', trimmedCode);

  if (type === 'spaceRace') {
    sessionStorage.setItem(
      'raceData',
      JSON.stringify({ raceId, participantId, teamId: resolvedTeamId, ...data })
    );
    saveSpaceRaceParticipant({
      id: participantId,
      name: trimmedName,
      raceId,
      teamId: resolvedTeamId,
      studentUid: ctx.studentUid,
      studentEmail: ctx.studentEmail,
    });
    localStorage.setItem(
      'spaceRaceData',
      JSON.stringify({
        id: raceId,
        quizId,
        teamId: resolvedTeamId,
        ...data,
      })
    );
    if (data?.quiz?.questions && Array.isArray(data.quiz.questions)) {
      const teamCacheKey = `spaceRaceQuiz_team_${resolvedTeamId ?? 'default'}`;
      localStorage.setItem(
        teamCacheKey,
        JSON.stringify({
          ...data.quiz,
          id: quizId || data.quiz.id,
          launched: true,
        })
      );
    }
    navigate(`/audience/space-race/${raceId}`);
    return { success: true, type: 'spaceRace', raceId, teamId: resolvedTeamId };
  }

  if (type === 'quiz') {
    if (!data || !data.title) {
      throw new Error('Quiz data is incomplete. Please try again.');
    }

    localStorage.setItem(
      'studentSession',
      JSON.stringify(buildQuizSessionPayload(trimmedName, trimmedCode, quizId, participantId, data, ctx))
    );
    persistQuizParticipantSession(quizId, {
      participantId,
      sessionCode: trimmedCode,
      studentName: trimmedName,
      joinedAt: new Date().toISOString(),
      studentUid: ctx.studentUid,
      studentEmail: ctx.studentEmail,
    });
    navigate(`/audience/quiz/${quizId}`);
    return { success: true, type: 'quiz', quizId };
  }

  if (type === 'exitTicket') {
    const code = String(joinCode || trimmedCode).toUpperCase();
    navigate(`/audience/exit-ticket/${code}`, { replace: true });
    return { success: true, type: 'exitTicket', ticketId, joinCode: code };
  }

  if (type === 'liveChat' || type === 'anonymousChat') {
    const code = String(joinCode || trimmedCode).toUpperCase();
    navigate(`/audience/chat?code=${encodeURIComponent(code)}`, { replace: true });
    return { success: true, type: 'liveChat', chatId, joinCode: code };
  }

  throw new Error('Unsupported session type');
}

/**
 * Join a live session by code using the session's currentActivity as the only source of truth.
 * Both Student Dashboard and External Join must call this (or proceedWithSessionJoin).
 */
export async function joinSessionByCode({
  code,
  studentName,
  navigate,
  loggedInAudience,
  onError = () => {},
  onTeamSelectionRequired,
  teamId = null,
}) {
  const trimmedCode = String(code || '').trim().toUpperCase();

  if (trimmedCode.length !== 6) {
    onError('Session code must be exactly 6 characters');
    return { success: false };
  }

  const ctx = buildJoinContext(studentName, loggedInAudience);
  const { trimmedName, studentUid, studentEmail } = ctx;

  try {
    const result = await proceedWithSessionJoin({
      trimmedName,
      trimmedCode,
      teamId,
      navigate,
      studentUid,
      studentEmail,
      loggedInAudience: ctx.loggedInAudience,
      onTeamSelectionRequired,
    });
    return result.success === false && result.needsTeamSelection
      ? result
      : { success: true, ...result };
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Failed to join session. Please try again.';
    onError(message);
    return { success: false, error: message };
  }
}
