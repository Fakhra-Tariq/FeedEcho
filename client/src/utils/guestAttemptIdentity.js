/** Zero-width + C0/C1 controls (not including whitespace, which is collapsed separately). */
const ZERO_WIDTH_AND_CONTROLS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

export const GUEST_ALREADY_ATTEMPTED_MESSAGE =
  'This name has already been used on this device for this activity.';

/**
 * Same algorithm as server `guestAttemptIdentity.js`.
 * Display names keep the original typing; only this value is compared.
 */
export function normalizeGuestName(name) {
  let s = String(name ?? '');
  try {
    s = s.normalize('NFKC');
  } catch {
    // ignore
  }
  s = s.replace(ZERO_WIDTH_AND_CONTROLS, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLocaleLowerCase();
  return s;
}

export function goToGuestNameStep(navigate, sessionCode) {
  try {
    sessionStorage.removeItem('studentName');
  } catch {
    // ignore
  }
  const code = String(sessionCode || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sessionCode') : '') || '')
    .trim()
    .toUpperCase();
  navigate('/join', {
    replace: true,
    state: { sessionCode: code, useDifferentName: true },
  });
}

export function collectLegacyParticipantIds() {
  const ids = [];
  const push = (value) => {
    const id = String(value || '').trim();
    if (id) ids.push(id);
  };
  try {
    const map = JSON.parse(localStorage.getItem('quizParticipantSessions') || '{}');
    if (map && typeof map === 'object') {
      Object.values(map).forEach((row) => push(row?.participantId));
    }
  } catch {
    // ignore
  }
  try {
    const session = JSON.parse(localStorage.getItem('studentSession') || 'null');
    push(session?.participantId);
  } catch {
    // ignore
  }
  try {
    const subs = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
    if (Array.isArray(subs)) subs.forEach((row) => push(row?.participantId));
  } catch {
    // ignore
  }
  try {
    const raw =
      localStorage.getItem('spaceRaceParticipant') ||
      sessionStorage.getItem('spaceRaceParticipant');
    const participant = raw ? JSON.parse(raw) : null;
    push(participant?.id);
  } catch {
    // ignore
  }
  try {
    const tickets = JSON.parse(localStorage.getItem('exitTicketSubmissions') || '[]');
    if (Array.isArray(tickets)) {
      tickets.forEach((row) => {
        push(row?.responseId);
        push(row?.attemptId);
      });
    }
  } catch {
    // ignore
  }
  return [...new Set(ids)];
}
