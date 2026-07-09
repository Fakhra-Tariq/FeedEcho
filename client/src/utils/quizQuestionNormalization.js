export function normalizeToArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter(Boolean);
  }
  return [];
}

export function normalizeQuizTypeLabel(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'multiple choice' || raw === 'multiple-choice') return 'Multiple Choice';
  if (raw === 'true / false' || raw === 'true-false' || raw === 'true/false') return 'True / False';
  if (raw === 'short answer' || raw === 'short-answer') return 'Short Answer';
  if (raw === 'long answer' || raw === 'long-answer') return 'Long Answer';
  if (raw === 'mixed type' || raw === 'mixed-type') return 'Mixed Type';
  return type || 'Multiple Choice';
}

export function getEditorRouteForQuizType(type) {
  switch (normalizeQuizTypeLabel(type)) {
    case 'Multiple Choice':
      return '/create/multiple-choice';
    case 'True / False':
      return '/create/true-false';
    case 'Short Answer':
      return '/create/short-answer';
    case 'Long Answer':
      return '/create/long-answer';
    case 'Mixed Type':
      return '/create/mixed-type';
    default:
      return '/create/multiple-choice';
  }
}

function normalizeMcqOptionsForEditor(options) {
  const list = normalizeToArray(options).map((option, index) => {
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

  while (list.length < 4) {
    list.push({
      id: String.fromCharCode(97 + list.length),
      text: '',
      isCorrect: false,
    });
  }

  return list.slice(0, 4);
}

export function normalizeQuestionForEditor(question, quizType) {
  if (!question || typeof question !== 'object') return question;

  const normalizedQuizType = normalizeQuizTypeLabel(quizType);

  if (normalizedQuizType === 'Multiple Choice') {
    const options = normalizeMcqOptionsForEditor(question.options);
    if (typeof question.correctAnswer === 'number' && !options.some((opt) => opt.isCorrect)) {
      options.forEach((opt, index) => {
        opt.isCorrect = index === question.correctAnswer;
      });
    }
    return {
      ...question,
      questionText: question.questionText || '',
      options,
    };
  }

  if (normalizedQuizType === 'True / False') {
    const answer = question.correctAnswer;
    let correctAnswer = null;
    if (answer === true || answer === 'true') correctAnswer = 'true';
    if (answer === false || answer === 'false') correctAnswer = 'false';
    return {
      ...question,
      questionText: question.questionText || '',
      correctAnswer,
    };
  }

  if (normalizedQuizType === 'Short Answer' || normalizedQuizType === 'Long Answer') {
    return {
      ...question,
      questionText: question.questionText || '',
      sampleAnswer: question.sampleAnswer || question.correctAnswer || '',
    };
  }

  if (normalizedQuizType === 'Mixed Type') {
    const questionType = String(question.type || 'multiple-choice').toLowerCase();

    if (questionType === 'multiple-choice') {
      const optionTexts = normalizeToArray(question.options).map((option) =>
        typeof option === 'string' ? option : option.text || ''
      );
      while (optionTexts.length < 4) optionTexts.push('');

      let correctAnswer = question.correctAnswer ?? 0;
      if (typeof correctAnswer !== 'number') {
        const flagged = normalizeMcqOptionsForEditor(question.options).findIndex((opt) => opt.isCorrect);
        correctAnswer = flagged >= 0 ? flagged : 0;
      }

      return {
        ...question,
        type: 'multiple-choice',
        questionText: question.questionText || '',
        options: optionTexts.slice(0, 4),
        correctAnswer,
      };
    }

    if (questionType === 'true-false') {
      const answer = question.correctAnswer;
      return {
        ...question,
        type: 'true-false',
        questionText: question.questionText || '',
        correctAnswer: answer === true || answer === 'true',
      };
    }

    if (questionType === 'short-answer') {
      return {
        ...question,
        type: 'short-answer',
        questionText: question.questionText || '',
        sampleAnswer: question.sampleAnswer || question.correctAnswer || '',
      };
    }

    if (questionType === 'long-answer') {
      return {
        ...question,
        type: 'long-answer',
        questionText: question.questionText || '',
        sampleAnswer: question.sampleAnswer || question.correctAnswer || '',
        maxWords: question.maxWords || 500,
      };
    }
  }

  return question;
}

export function normalizeQuestionsForEditor(questions, quizType) {
  return normalizeToArray(questions).map((question) =>
    normalizeQuestionForEditor(question, quizType)
  );
}

function normalizeMcqOptionsForStudent(options) {
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
        text: option.text ?? String(option),
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

export function normalizeQuestionForStudent(question, quizType) {
  if (!question || typeof question !== 'object') return question;

  const normalizedQuizType = normalizeQuizTypeLabel(quizType);
  const next = { ...question, questionText: question.questionText || '' };

  if (normalizedQuizType === 'Multiple Choice') {
    return {
      ...next,
      options: normalizeMcqOptionsForStudent(next.options),
    };
  }

  if (normalizedQuizType === 'Mixed Type') {
    const questionType = String(next.type || 'multiple-choice').toLowerCase();

    if (questionType === 'multiple-choice') {
      const optionTexts = normalizeToArray(next.options).map((option) =>
        typeof option === 'string' ? option : option.text || ''
      );
      return {
        ...next,
        type: 'multiple-choice',
        options: normalizeMcqOptionsForStudent(optionTexts),
      };
    }

    if (questionType === 'true-false') {
      return {
        ...next,
        type: 'true-false',
        correctAnswer: next.correctAnswer === true || next.correctAnswer === 'true' ? 'true' : 'false',
      };
    }
  }

  if (next.options) {
    next.options = normalizeMcqOptionsForStudent(next.options);
  }

  return next;
}

export function ensureQuestionIds(questions) {
  return normalizeToArray(questions).map((question, index) => ({
    ...question,
    id: question?.id ?? question?.questionId ?? `q-${index}`,
  }));
}

export function normalizeQuestionsForStudent(questions, quizType) {
  return ensureQuestionIds(
    normalizeToArray(questions).map((question) =>
      normalizeQuestionForStudent(question, quizType)
    )
  );
}

export function normalizeQuizForClient(quiz) {
  if (!quiz || typeof quiz !== 'object') return quiz;

  const type = normalizeQuizTypeLabel(quiz.type);
  const questions = normalizeQuestionsForStudent(quiz.questions, type);

  return {
    ...quiz,
    type,
    questions,
    questionCount: questions.length,
  };
}

export function getEffectiveQuestionType(quizType, question) {
  const normalizedQuizType = normalizeQuizTypeLabel(quizType);

  if (normalizedQuizType === 'Mixed Type' && question?.type) {
    const questionType = String(question.type).toLowerCase();
    if (questionType === 'multiple-choice') return 'Multiple Choice';
    if (questionType === 'true-false') return 'True / False';
    if (questionType === 'short-answer') return 'Short Answer';
    if (questionType === 'long-answer') return 'Long Answer';
  }

  return normalizedQuizType;
}

export function loadEditingQuizFromStorage() {
  const raw = localStorage.getItem('editingQuiz');
  if (!raw) return null;

  const quiz = JSON.parse(raw);
  const type = normalizeQuizTypeLabel(quiz.type);

  return {
    ...quiz,
    type,
    questions: normalizeQuestionsForEditor(quiz.questions, type),
  };
}
