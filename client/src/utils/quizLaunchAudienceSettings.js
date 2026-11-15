import { normalizeToArray } from './quizQuestionNormalization';

const seededRandomGenerator = (seed) => {
  let state;
  if (typeof seed === 'string') {
    state = seed.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  } else if (typeof seed === 'number') {
    state = seed;
  } else {
    state = String(seed)
      .split('')
      .reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  }
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
};

const shuffleArray = (array, seed) => {
  const seededRandom = seededRandomGenerator(seed);
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const cloneQuestionOptions = (options) => {
  if (!Array.isArray(options)) return options;
  return options.map((option) =>
    typeof option === 'object' && option !== null ? { ...option } : option
  );
};

const getQuestionShuffleKey = (question, index) =>
  question?.id ?? question?.questionId ?? `idx-${index}`;

const cloneQuestionsForShuffle = (questions) =>
  normalizeToArray(questions).map((question, index) => ({
    ...question,
    options: cloneQuestionOptions(question?.options),
    _shuffleKey: getQuestionShuffleKey(question, index),
  }));

/**
 * Apply per-student shuffle settings from launchSettings using a stable participant seed.
 */
export function applyQuizShuffleSettings(quizData, participantId) {
  const settings = quizData?.launchSettings || {};
  const seedBase = String(participantId || quizData?.id || 'student');
  let questions = cloneQuestionsForShuffle(quizData?.questions);

  if (settings.shuffleQuestions && questions.length > 1) {
    questions = shuffleArray(questions, `quiz-${quizData.id}-p-${seedBase}`);
  }

  if (settings.shuffleAnswers) {
    questions = questions.map((question) => {
      const options = question?.options;
      if (Array.isArray(options) && options.length > 1) {
        const questionKey = question._shuffleKey || getQuestionShuffleKey(question, 0);
        const optionsCopy = cloneQuestionOptions(options);
        const { _shuffleKey, ...questionWithoutKey } = question;
        return {
          ...questionWithoutKey,
          options: shuffleArray(
            optionsCopy,
            `quiz-${quizData.id}-p-${seedBase}-answers-${questionKey}`
          ),
        };
      }
      const { _shuffleKey, ...questionWithoutKey } = question;
      return questionWithoutKey;
    });
  } else {
    questions = questions.map(({ _shuffleKey, ...question }) => question);
  }

  return {
    ...quizData,
    questions,
  };
}

export function isQuizJoinWindowExpired(launchSettings) {
  if (!launchSettings?.endTime) return false;
  const endMs = new Date(launchSettings.endTime).getTime();
  return !Number.isNaN(endMs) && Date.now() > endMs;
}

export function getStudentAttemptSecondsRemaining(launchSettings, joinedAtIso) {
  if (!launchSettings?.timePerStudentMinutes) return null;

  const joinTime = joinedAtIso ? new Date(joinedAtIso) : new Date();
  const now = new Date();
  const timeSinceJoin = Math.floor((now.getTime() - joinTime.getTime()) / 1000);
  const totalStudentTime = Number(launchSettings.timePerStudentMinutes) * 60;
  let remaining = Math.max(0, totalStudentTime - timeSinceJoin);

  if (launchSettings?.endTime) {
    const quizEndTime = new Date(launchSettings.endTime);
    const quizTimeRemaining = Math.max(
      0,
      Math.floor((quizEndTime.getTime() - now.getTime()) / 1000)
    );
    remaining = Math.min(remaining, quizTimeRemaining);
  }

  return remaining;
}

function rowMatchesLocalIdentity(row, { participantId, studentUid, studentEmail, studentName } = {}) {
  if (participantId && String(row.participantId) === String(participantId)) return true;
  if (studentUid && row.studentUid && String(row.studentUid) === String(studentUid)) return true;
  if (studentEmail && row.studentEmail && String(row.studentEmail) === String(studentEmail)) return true;
  if (studentName && row.studentName && String(row.studentName).trim() === String(studentName).trim()) {
    return true;
  }
  return false;
}

function readLocalQuizSubmissions() {
  try {
    const raw = localStorage.getItem('quizSubmissions') || '[]';
    const submissions = JSON.parse(raw);
    return Array.isArray(submissions) ? submissions : [];
  } catch {
    return [];
  }
}

/**
 * One completed attempt is owned by quiz + this live launch + this person.
 * Stale rows without launchId must not count against a new launchId.
 */
export function localQuizAttemptMatchesLiveLaunch(row, {
  quizId,
  launchId,
  sessionCode,
  participantId,
  studentUid,
  studentEmail,
  studentName,
} = {}) {
  if (!row || !quizId) return false;
  if (String(row.quizId) !== String(quizId)) return false;

  const liveLaunchId = launchId != null && String(launchId).trim() !== '' ? String(launchId) : '';
  if (liveLaunchId) {
    if (!row.launchId) return false;
    if (String(row.launchId) !== liveLaunchId) return false;
  }

  const code = String(sessionCode || '').trim().toUpperCase();
  if (code) {
    const rowCode = String(row.sessionCode || '').trim().toUpperCase();
    if (rowCode && rowCode !== code) return false;
  }

  return rowMatchesLocalIdentity(row, { participantId, studentUid, studentEmail, studentName });
}

export function hasLocalQuizSubmission(quizId, identity = {}) {
  if (!quizId) return false;
  return readLocalQuizSubmissions().some((row) =>
    localQuizAttemptMatchesLiveLaunch(row, { quizId, ...identity })
  );
}

/** Device-local completed attempt for this live quiz launch (same browser / same person). */
export function findLocalQuizSubmissionForJoin({
  quizId,
  launchId,
  sessionCode,
  studentUid,
  studentEmail,
  studentName,
  participantId,
} = {}) {
  const liveQuizId = quizId != null ? String(quizId).trim() : '';
  if (!liveQuizId) return null;
  return (
    readLocalQuizSubmissions().find((row) =>
      localQuizAttemptMatchesLiveLaunch(row, {
        quizId: liveQuizId,
        launchId,
        sessionCode,
        participantId,
        studentUid,
        studentEmail,
        studentName,
      })
    ) || null
  );
}
