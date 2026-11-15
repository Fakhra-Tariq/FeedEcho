import { loadEditingQuizFromStorage, normalizeQuizTypeLabel } from './quizQuestionNormalization';

function optionSnapshot(question) {
  const options = question?.options;
  if (!Array.isArray(options)) return [];
  return options.map((opt, index) => {
    if (typeof opt === 'string') {
      return { t: opt.trim(), c: question.correctAnswer === index };
    }
    return {
      t: String(opt?.text ?? '').trim(),
      c: Boolean(opt?.isCorrect),
    };
  });
}

function questionSnapshot(question) {
  if (!question || typeof question !== 'object') return null;
  let correct = question.correctAnswer;
  if (correct === true || correct === 'true') correct = true;
  else if (correct === false || correct === 'false') correct = false;
  else if (typeof correct === 'number') correct = correct;
  else if (correct == null) correct = null;
  else correct = String(correct);

  return {
    text: String(question.questionText || '').trim(),
    type: question.type || null,
    sampleAnswer: String(question.sampleAnswer || question.modelAnswer || '').trim(),
    maxWords: question.maxWords ?? null,
    marks: question.marks ?? question.points ?? null,
    gradingNotes: String(question.gradingNotes || '').trim(),
    correctAnswer: correct,
    options: optionSnapshot(question),
  };
}

/** Stable JSON of title + questions. Ignores UI ids, timestamps, launched/status/source. */
export function serializeQuizEditorSnapshot({ title, questions, quizType }) {
  return JSON.stringify({
    title: String(title || '').trim(),
    type: quizType || null,
    questions: (questions || []).map(questionSnapshot),
  });
}

/**
 * Read editingQuiz without removing it. Used for first paint so Edit does not flash "Save Quiz".
 */
export function peekEditingQuizForType(expectedType, { acceptAnyWithQuestions = false } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('editingQuiz');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const type = normalizeQuizTypeLabel(parsed.type);
    const matches =
      type === expectedType || (acceptAnyWithQuestions && parsed.questions?.length);
    if (!matches) return null;
    const quiz = loadEditingQuizFromStorage();
    if (!quiz) return null;
    return {
      quiz,
      isSavedEdit: Boolean(quiz.id && !quiz.isFromPaste),
    };
  } catch {
    return null;
  }
}
