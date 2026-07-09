export const AI_GENERATED_QUIZ_SOURCE = 'ai_generated';

export function getQuizEditorRoute(quizType) {
  switch (quizType) {
    case 'Multiple Choice':
      return '/create/multiple-choice';
    case 'True / False':
      return '/create/true-false';
    case 'Short Answer':
      return '/create/short-answer';
    case 'Mixed Type':
      return '/create/mixed-type';
    default:
      return '/create/mixed-type';
  }
}

function normalizeMcqForSingleTypeEditor(question, index) {
  const id = question.id || Date.now() + index;
  const questionText = question.questionText || '';

  if (Array.isArray(question.options) && question.options.length && typeof question.options[0] === 'object') {
    const options = question.options.map((option, optionIndex) => ({
      id: option.id || String.fromCharCode(97 + optionIndex),
      text: option.text || '',
      isCorrect: Boolean(option.isCorrect),
    }));

    while (options.length < 4) {
      options.push({
        id: String.fromCharCode(97 + options.length),
        text: '',
        isCorrect: false,
      });
    }

    return { id, questionText, options: options.slice(0, 4) };
  }

  const optionTexts = (question.options || []).map((option) =>
    typeof option === 'string' ? option : option.text || ''
  );
  while (optionTexts.length < 4) optionTexts.push('');

  const correctIndex =
    typeof question.correctAnswer === 'number' && question.correctAnswer >= 0
      ? question.correctAnswer
      : 0;

  return {
    id,
    questionText,
    options: optionTexts.slice(0, 4).map((text, optionIndex) => ({
      id: String.fromCharCode(97 + optionIndex),
      text,
      isCorrect: optionIndex === correctIndex,
    })),
  };
}

function normalizeTrueFalseForSingleTypeEditor(question, index) {
  const answer = question.correctAnswer;
  let correctAnswer = null;

  if (answer === true || answer === 'true') correctAnswer = 'true';
  if (answer === false || answer === 'false') correctAnswer = 'false';

  return {
    id: question.id || Date.now() + index,
    questionText: question.questionText || '',
    correctAnswer,
  };
}

function normalizeShortAnswerForEditor(question, index) {
  return {
    id: question.id || Date.now() + index,
    questionText: question.questionText || '',
    sampleAnswer: question.sampleAnswer || '',
  };
}

function normalizeForMixedTypeEditor(question, index) {
  const id = question.id || Date.now() + index;

  if (question.type === 'multiple-choice') {
    if (Array.isArray(question.options) && question.options.length && typeof question.options[0] === 'object') {
      const options = question.options.map((option) => option.text || '');
      const correctAnswer = question.options.findIndex((option) => option.isCorrect);
      return {
        id,
        type: 'multiple-choice',
        questionText: question.questionText || '',
        options,
        correctAnswer: correctAnswer >= 0 ? correctAnswer : 0,
      };
    }

    return {
      id,
      type: 'multiple-choice',
      questionText: question.questionText || '',
      options: question.options || ['', '', '', ''],
      correctAnswer: question.correctAnswer ?? 0,
    };
  }

  if (question.type === 'true-false') {
    const answer = question.correctAnswer;
    return {
      id,
      type: 'true-false',
      questionText: question.questionText || '',
      correctAnswer: answer === true || answer === 'true',
    };
  }

  if (question.type === 'short-answer') {
    return {
      id,
      type: 'short-answer',
      questionText: question.questionText || '',
      sampleAnswer: question.sampleAnswer || '',
    };
  }

  return question;
}

export function normalizeAiQuestionsForQuizType(questions, quizType) {
  return (questions || []).map((question, index) => {
    switch (quizType) {
      case 'Multiple Choice':
        return normalizeMcqForSingleTypeEditor(question, index);
      case 'True / False':
        return normalizeTrueFalseForSingleTypeEditor(question, index);
      case 'Short Answer':
        return normalizeShortAnswerForEditor(question, index);
      case 'Mixed Type':
      default:
        return normalizeForMixedTypeEditor(question, index);
    }
  });
}

export function buildEditingQuizFromAiResponse(data) {
  const quizType = data.type || 'Mixed Type';
  const questions = normalizeAiQuestionsForQuizType(data.questions || [], quizType);

  return {
    id: Date.now(),
    title: data.title || 'AI Generated Quiz',
    type: quizType,
    questions,
    questionCount: questions.length,
    createdDate: new Date().toISOString(),
    status: 'Draft',
    launched: false,
    isFromPaste: true,
    source: AI_GENERATED_QUIZ_SOURCE,
  };
}
