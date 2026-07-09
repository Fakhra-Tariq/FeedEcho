const normalizeQuestionsList = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

export const getAttemptKey = (row) => {
  if (row?.quizId && row?.participantId) return `${row.quizId}-${row.participantId}`;
  if (row?.quizId && row?.submittedAt) return `${row.quizId}-${row.submittedAt}`;
  return row?.rowId || row?.id || '';
};

export const getRowSubmittedAt = (row) => {
  if (row?.submittedAt) return row.submittedAt;
  if (row?.sortKey) return row.sortKey;
  if (row?.timestamp instanceof Date) return row.timestamp.toISOString();
  if (row?.timestamp) return row.timestamp;
  return '';
};

export const normalizeSubmittedAtKey = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso).slice(0, 19);
  return String(Math.floor(t / 1000));
};

const getSubmissionSecondKey = (row) => {
  if (!row?.quizId) return '';
  const sec = normalizeSubmittedAtKey(getRowSubmittedAt(row));
  return sec ? `${row.quizId}@${sec}` : '';
};

/** True when two rows represent the same quiz attempt (API vs local, or duplicate local writes). */
export const isSameQuizAttempt = (a, b) => {
  if (!a?.quizId || !b?.quizId || a.quizId !== b.quizId) return false;
  if (a.participantId && b.participantId && String(a.participantId) === String(b.participantId)) {
    return true;
  }
  const secA = normalizeSubmittedAtKey(getRowSubmittedAt(a));
  const secB = normalizeSubmittedAtKey(getRowSubmittedAt(b));
  return Boolean(secA && secB && secA === secB);
};

/** One key per quiz attempt — merges duplicate rows from API/local/Firebase for the same submission. */
export const getQuizAttemptCollapseKey = (row) => {
  if (!row?.quizId) return getAttemptKey(row);
  if (row.participantId) return `quiz-${row.quizId}-p-${row.participantId}`;
  const submittedAt = getRowSubmittedAt(row);
  if (submittedAt) {
    const t = new Date(submittedAt).getTime();
    if (!Number.isNaN(t)) return `quiz-${row.quizId}-at-${t}`;
    return `quiz-${row.quizId}-at-${String(submittedAt)}`;
  }
  return getAttemptKey(row);
};

export const attemptRichnessScore = (row) => {
  if (!row) return 0;
  let score = 0;
  const questions = normalizeQuestionsList(row.questions);
  if (
    questions.some(
      (q) =>
        q?.questionText &&
        String(q.questionText).trim() &&
        !/^Question \d+$/i.test(String(q.questionText).trim())
    )
  ) {
    score += 20;
  } else if (questions.length) {
    score += 5;
  }
  if (row.answers && Object.keys(row.answers).length) score += 3;
  if (row.timeTaken != null) score += 2;
  if (row.participantId) score += 2;
  if (row.studentUid) score += 2;
  if (row.source === 'firebase') score += 1;
  return score;
};

export const mergeQuizAttemptRows = (existing, row) => {
  const primary = attemptRichnessScore(row) >= attemptRichnessScore(existing) ? row : existing;
  const secondary = primary === row ? existing : row;
  const primaryQuestions = normalizeQuestionsList(primary.questions);
  const secondaryQuestions = normalizeQuestionsList(secondary.questions);
  const primaryHasRealText = primaryQuestions.some(
    (q) =>
      q?.questionText &&
      String(q.questionText).trim() &&
      !/^Question \d+$/i.test(String(q.questionText).trim())
  );

  return {
    ...secondary,
    ...primary,
    participantId: primary.participantId || secondary.participantId,
    studentUid: primary.studentUid || secondary.studentUid,
    studentEmail: primary.studentEmail || secondary.studentEmail,
    questions: primaryHasRealText ? primary.questions : secondary.questions || primary.questions,
    answers:
      primary.answers && Object.keys(primary.answers).length
        ? primary.answers
        : secondary.answers || primary.answers,
    timeTaken: primary.timeTaken ?? secondary.timeTaken ?? null,
  };
};

export const collapseQuizAttemptRows = (rows) => {
  const merged = new Map();
  const secondIndex = new Map();

  rows.forEach((row) => {
    if (!row) return;
    let collapseKey = getQuizAttemptCollapseKey(row);
    const secondKey = getSubmissionSecondKey(row);

    if (secondKey && secondIndex.has(secondKey)) {
      collapseKey = secondIndex.get(secondKey);
    }

    if (!merged.has(collapseKey)) {
      merged.set(collapseKey, row);
      if (secondKey) secondIndex.set(secondKey, collapseKey);
      return;
    }

    merged.set(collapseKey, mergeQuizAttemptRows(merged.get(collapseKey), row));
    if (secondKey) secondIndex.set(secondKey, collapseKey);
  });

  return Array.from(merged.values());
};

/** Upsert one attempt into localStorage and collapse duplicates in-place. */
export const saveLocalQuizSubmission = (incoming) => {
  if (!incoming || typeof incoming !== 'object') return;
  try {
    const raw = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
    const list = Array.isArray(raw) ? raw : [];
    const merged = collapseQuizAttemptRows([...list, incoming]);
    localStorage.setItem('quizSubmissions', JSON.stringify(merged));
  } catch (err) {
    console.warn('Failed to save local quiz submission:', err);
  }
};

/** Read local submissions with duplicate attempts collapsed. */
export const readDedupedLocalQuizSubmissions = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
    const list = Array.isArray(raw) ? raw : [];
    const merged = collapseQuizAttemptRows(list);
    if (merged.length !== list.length) {
      localStorage.setItem('quizSubmissions', JSON.stringify(merged));
    }
    return merged;
  } catch {
    return [];
  }
};

/** Collapse raw quiz rows, then run formatter so UI fields stay intact. */
export const buildDedupedQuizAttempts = (rawRows, formatRow) => {
  const collapsed = collapseQuizAttemptRows(rawRows);
  return collapsed.map((row) => formatRow(row));
};

export const getQuizActivityDedupeKey = (item) => {
  if (!item) return '';
  if (item.type === 'quiz' && item.quizId) {
    return getQuizAttemptCollapseKey(item);
  }
  return item.id || '';
};
