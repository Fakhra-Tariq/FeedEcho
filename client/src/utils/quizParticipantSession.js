const STORAGE_KEY = 'quizParticipantSessions';

const readMap = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

const writeMap = (map) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to persist quiz participant session:', err);
  }
};

/** Persist join metadata so submit still works if studentSession is cleared mid-quiz. */
export const persistQuizParticipantSession = (quizId, payload = {}) => {
  if (!quizId || !payload?.participantId) return;
  const map = readMap();
  map[String(quizId)] = {
    participantId: payload.participantId,
    sessionCode: payload.sessionCode || '',
    studentName: payload.studentName || '',
    joinedAt: payload.joinedAt || new Date().toISOString(),
    studentUid: payload.studentUid || null,
    studentEmail: payload.studentEmail || null,
  };
  writeMap(map);
  sessionStorage.setItem(`quizParticipantId:${quizId}`, String(payload.participantId));
};

export const readQuizParticipantSession = (quizId) => {
  if (!quizId) return null;
  const map = readMap();
  const stored = map[String(quizId)] || null;
  const sessionBackup = sessionStorage.getItem(`quizParticipantId:${quizId}`);
  if (stored?.participantId) return stored;
  if (sessionBackup) {
    return { participantId: sessionBackup, sessionCode: '', studentName: '' };
  }
  return null;
};

export const clearQuizParticipantSession = (quizId) => {
  if (!quizId) return;
  const map = readMap();
  delete map[String(quizId)];
  writeMap(map);
  sessionStorage.removeItem(`quizParticipantId:${quizId}`);
};
