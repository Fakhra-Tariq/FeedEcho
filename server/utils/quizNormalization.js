function normalizeToArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter(Boolean);
  }
  return [];
}

function normalizeQuizTypeLabel(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'multiple choice' || raw === 'multiple-choice') return 'Multiple Choice';
  if (raw === 'true / false' || raw === 'true-false' || raw === 'true/false') return 'True / False';
  if (raw === 'short answer' || raw === 'short-answer') return 'Short Answer';
  if (raw === 'long answer' || raw === 'long-answer') return 'Long Answer';
  if (raw === 'mixed type' || raw === 'mixed-type') return 'Mixed Type';
  return type || 'Multiple Choice';
}

function normalizeMcqOptions(options) {
  return normalizeToArray(options).map((option, index) => {
    if (typeof option === 'string') {
      return {
        id: String.fromCharCode(97 + index),
        text: option,
        isCorrect: false,
      };
    }

    if (option && typeof option === 'object') {
      return {
        id: option.id || String.fromCharCode(97 + index),
        text: option.text ?? '',
        isCorrect: Boolean(option.isCorrect),
      };
    }

    return {
      id: String.fromCharCode(97 + index),
      text: '',
      isCorrect: false,
    };
  });
}

function normalizeQuestion(question, quizType) {
  if (!question || typeof question !== 'object') return question;

  const normalizedType = normalizeQuizTypeLabel(quizType);
  const next = { ...question };

  if (normalizedType === 'Multiple Choice' || String(next.type || '').toLowerCase() === 'multiple-choice') {
    const options = normalizeMcqOptions(next.options);
    while (options.length < 4) {
      options.push({
        id: String.fromCharCode(97 + options.length),
        text: '',
        isCorrect: false,
      });
    }

    if (typeof next.correctAnswer === 'number' && !options.some((opt) => opt.isCorrect)) {
      options.forEach((opt, index) => {
        opt.isCorrect = index === next.correctAnswer;
      });
    }

    next.options = options.slice(0, 4);
    return next;
  }

  if (normalizedType === 'Mixed Type') {
    const questionType = String(next.type || 'multiple-choice').toLowerCase();
    if (questionType === 'multiple-choice') {
      const optionTexts = normalizeToArray(next.options).map((option) =>
        typeof option === 'string' ? option : option.text || ''
      );
      while (optionTexts.length < 4) optionTexts.push('');

      let correctAnswer = next.correctAnswer ?? 0;
      if (typeof correctAnswer !== 'number') {
        const flagged = normalizeMcqOptions(next.options).findIndex((opt) => opt.isCorrect);
        correctAnswer = flagged >= 0 ? flagged : 0;
      }

      return {
        ...next,
        type: 'multiple-choice',
        options: optionTexts.slice(0, 4),
        correctAnswer,
      };
    }

    if (questionType === 'true-false') {
      const answer = next.correctAnswer;
      return {
        ...next,
        type: 'true-false',
        correctAnswer: answer === true || answer === 'true',
      };
    }

    if (questionType === 'short-answer') {
      return {
        ...next,
        type: 'short-answer',
        sampleAnswer: next.sampleAnswer || next.correctAnswer || '',
      };
    }
  }

  if (next.options) {
    next.options = normalizeMcqOptions(next.options);
  }

  return next;
}

function normalizeQuestions(questions, quizType) {
  return normalizeToArray(questions).map((question) => normalizeQuestion(question, quizType));
}

function normalizeQuizRecord(quiz) {
  if (!quiz || typeof quiz !== 'object') return quiz;

  const type = normalizeQuizTypeLabel(quiz.type);
  const questions = normalizeQuestions(quiz.questions, type);

  return {
    ...quiz,
    type,
    questions,
    questionCount: questions.length,
  };
}

/** List endpoints: metadata only — omit heavy question payloads. */
function normalizeQuizListRecord(quiz) {
  if (!quiz || typeof quiz !== 'object') return quiz;

  const type = normalizeQuizTypeLabel(quiz.type);
  const questions = normalizeQuestions(quiz.questions, type);
  const { questions: _questions, ...rest } = quiz;

  return {
    ...rest,
    type,
    questionCount:
      quiz.questionCount != null ? Number(quiz.questionCount) : questions.length,
  };
}

module.exports = {
  normalizeToArray,
  normalizeQuizTypeLabel,
  normalizeMcqOptions,
  normalizeQuestion,
  normalizeQuestions,
  normalizeQuizRecord,
  normalizeQuizListRecord,
};
