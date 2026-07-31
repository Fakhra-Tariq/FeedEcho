import {
  anonymousChatAPI,
  exitTicketsAPI,
  sessionsAPI,
  spaceRacesAPI,
} from '../services/api';
import { normalizeTeamId, saveSpaceRaceParticipant } from './spaceRaceSession';
import { getStoredStudentSession } from './studentSession';
import { persistQuizParticipantSession } from './quizParticipantSession';

export function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
}

function buildJoinContext(studentName, loggedInStudent) {
  const loggedIn = loggedInStudent || getStoredStudentSession();
  return {
    trimmedName: String(studentName || loggedIn?.name || 'Student').trim(),
    studentUid: loggedIn?.uid || null,
    studentEmail: loggedIn?.email || null,
    loggedInStudent: loggedIn,
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

export async function proceedWithSessionJoin({
  trimmedName,
  trimmedCode,
  teamId = null,
  navigate,
  studentUid = null,
  studentEmail = null,
  loggedInStudent = null,
}) {
  const ctx = {
    trimmedName,
    studentUid,
    studentEmail,
    loggedInStudent: loggedInStudent || getStoredStudentSession(),
  };

  const joinResponse = await sessionsAPI.join(trimmedName, trimmedCode, teamId, {
    studentUid: ctx.studentUid,
    studentEmail: ctx.studentEmail,
  });

  if (!joinResponse.data.success) {
    throw new Error(joinResponse.data.message || joinResponse.data.error || 'Failed to join session');
  }

  const { type, data, raceId, quizId, participantId, teamId: assignedTeamId } =
    joinResponse.data;
  // API returns teamId at the top level (not data.participant.teamId)
  const resolvedTeamId = normalizeTeamId(
    assignedTeamId ?? teamId ?? data?.participant?.teamId ?? null
  );

  persistJoinIdentity(trimmedName, ctx);

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
    // Team-specific quiz cache so shuffle matches teammates on both join paths
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
    navigate(`/student/space-race/${raceId}`);
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
    navigate(`/student/quiz/${quizId}`);
    return { success: true, type: 'quiz', quizId };
  }

  throw new Error('Unsupported session type');
}

/**
 * Join a live session by code. Logged-in students skip the extra join page;
 * returns needsTeamSelection when the student must pick a Space Race team.
 */
export async function joinSessionByCode({
  code,
  studentName,
  navigate,
  loggedInStudent,
  onError = () => {},
  onTeamSelectionRequired,
}) {
  const trimmedCode = String(code || '').trim().toUpperCase();

  if (trimmedCode.length !== 6) {
    onError('Session code must be exactly 6 characters');
    return { success: false };
  }

  const ctx = buildJoinContext(studentName, loggedInStudent);
  const { trimmedName, studentUid, studentEmail } = ctx;

  try {
    try {
      const ticketResponse = await exitTicketsAPI.getByCode(trimmedCode);
      if (ticketResponse.data.success) {
        persistJoinIdentity(trimmedName, ctx);
        navigate(`/student/exit-ticket/${trimmedCode}`, { replace: true });
        return { success: true, type: 'exitTicket' };
      }
    } catch {
      // Not an exit ticket
    }

    try {
      const chatResponse = await anonymousChatAPI.getByCode(trimmedCode);
      if (chatResponse.data?.success) {
        persistJoinIdentity(trimmedName, ctx);
        navigate(`/student/chat?code=${encodeURIComponent(trimmedCode)}`, { replace: true });
        return { success: true, type: 'chat' };
      }
    } catch {
      // Not a chat code
    }

    try {
      const raceResponse = await spaceRacesAPI.getRaceByCode(trimmedCode);
      if (raceResponse.data?.success) {
        const race = raceResponse.data.data;
        if (normalizeTeamAssignment(race.settings?.teamAssignment) === 'student-choice') {
          if (onTeamSelectionRequired) {
            onTeamSelectionRequired({
              sessionCode: trimmedCode,
              studentName: trimmedName,
              raceData: race,
              studentUid,
              studentEmail,
            });
          }
          return { success: false, needsTeamSelection: true, raceData: race };
        }
      }
    } catch {
      // Fall through to unified join
    }

    await proceedWithSessionJoin({
      trimmedName,
      trimmedCode,
      navigate,
      studentUid,
      studentEmail,
      loggedInStudent: ctx.loggedInStudent,
    });
    return { success: true };
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Failed to join session. Please try again.';
    onError(message);
    return { success: false, error: message };
  }
}
