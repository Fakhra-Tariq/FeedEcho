const normalizeString = (value) => (value ?? '').toString().toLowerCase().trim();

const normalizeBooleanLike = (value) => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return normalizeString(value);
};

const getStableQuestionId = (question, index = 0) => {
  if (question?.id !== undefined && question?.id !== null && String(question.id).trim() !== '') {
    return String(question.id);
  }
  if (question?.questionId !== undefined && question?.questionId !== null) {
    return String(question.questionId);
  }
  return `q-${index}`;
};

const isLegacyIndexKey = (key) => {
  if (!/^\d+$/.test(String(key))) return false;
  const parsed = Number.parseInt(key, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 200;
};

const normalizeQuizType = (quizType, question) => {
  const raw = normalizeString(question?.type || quizType);
  if (raw === 'multiple-choice' || raw === 'multiple choice') return 'multiple choice';
  if (raw === 'true-false' || raw === 'true / false' || raw === 'true/false') return 'true/false';
  if (raw === 'short-answer' || raw === 'short answer') return 'short answer';
  if (raw === 'long-answer' || raw === 'long answer') return 'long answer';
  return raw;
};

const getCorrectOptionIndex = (question) => {
  if (!question) return null;
  if (Number.isInteger(question.correctAnswer)) return question.correctAnswer;
  if (typeof question.correctAnswer === 'string') {
    const parsed = parseInt(question.correctAnswer, 10);
    if (!Number.isNaN(parsed) && question.options?.[parsed] !== undefined) return parsed;
  }
  if (Array.isArray(question.options)) {
    const flaggedIndex = question.options.findIndex((opt) => opt?.isCorrect === true);
    if (flaggedIndex >= 0) return flaggedIndex;
    if (typeof question.correctAnswer === 'string') {
      const target = normalizeString(question.correctAnswer);
      const matchedIndex = question.options.findIndex((opt) => {
        const text = typeof opt === 'string' ? opt : opt?.text;
        return normalizeString(text) === target;
      });
      if (matchedIndex >= 0) return matchedIndex;
    }
  }
  return null;
};

const normalizeQuestionForScoring = (question, quizType) => {
  if (!question) return question;
  const normalized = { ...question };
  const questionType = normalizeQuizType(quizType, question);

  if (questionType === 'multiple choice' && Array.isArray(normalized.options)) {
    const correctIdx = getCorrectOptionIndex(normalized);
    if (Number.isInteger(correctIdx) && correctIdx >= 0) {
      normalized.options = normalized.options.map((opt, idx) => {
        if (typeof opt === 'string') {
          return { id: String.fromCharCode(97 + idx), text: opt, isCorrect: idx === correctIdx };
        }
        return { ...opt, isCorrect: idx === correctIdx };
      });
    }
  }

  return normalized;
};

const normalizeQuestionsForScoring = (questions, quizType) =>
  (questions || []).map((question) => normalizeQuestionForScoring(question, quizType));

const getSelectedOptionIndex = (question, response) => {
  if (!question || !response) return null;
  if (Number.isInteger(response.selectedOptionIndex)) return response.selectedOptionIndex;
  const answerText = normalizeString(response.answer);
  if (answerText === '') return null;
  if (Array.isArray(question.options)) {
    const matchedIndex = question.options.findIndex((opt) => {
      const text = typeof opt === 'string' ? opt : opt?.text;
      return normalizeString(text) === answerText;
    });
    if (matchedIndex >= 0) return matchedIndex;
  }
  const parsed = parseInt(answerText, 10);
  if (!Number.isNaN(parsed) && Array.isArray(question.options)) return parsed;
  return null;
};

const normalizeResponses = (responses) => {
  const list = [];
  if (Array.isArray(responses)) {
    responses.forEach((item, index) => {
      if (item && typeof item === 'object') {
        list.push({
          questionId: item.questionId ?? item.questionID ?? item.qid ?? null,
          questionIndex: Number.isInteger(item.questionIndex) ? item.questionIndex : index,
          answer: item.answer ?? item.selectedAnswer ?? item.response ?? item.value ?? '',
          selectedOptionIndex: Number.isInteger(item.selectedOptionIndex) ? item.selectedOptionIndex : null
        });
      } else {
        list.push({
          questionId: null,
          questionIndex: index,
          answer: item,
          selectedOptionIndex: null
        });
      }
    });
  } else if (responses && typeof responses === 'object') {
    Object.keys(responses).forEach((key) => {
      const legacyIndex = isLegacyIndexKey(key);
      list.push({
        questionId: legacyIndex ? null : String(key),
        questionIndex: legacyIndex ? Number.parseInt(key, 10) : null,
        answer: responses[key],
        selectedOptionIndex: null,
      });
    });
  }
  return list;
};

const scoreQuestion = (question, response, quizType, totalQuestions) => {
  const normalizedType = normalizeQuizType(quizType, question);
  let isCorrect = false;
  let correctOptionIndex = null;
  let selectedOptionIndex = null;

  // Calculate dynamic points per question based on total questions (out of 100)
  const pointsPerQuestion = totalQuestions > 0 ? 100 / totalQuestions : 10;

  try {
    if (normalizedType === 'multiple choice') {
      correctOptionIndex = getCorrectOptionIndex(question);
      selectedOptionIndex = getSelectedOptionIndex(question, response);
      isCorrect =
        Number.isInteger(correctOptionIndex) &&
        Number.isInteger(selectedOptionIndex) &&
        correctOptionIndex === selectedOptionIndex;

      console.log('Correct:', correctOptionIndex);
      console.log('Selected:', selectedOptionIndex);
      console.log('IsCorrect:', isCorrect);
    } else if (normalizedType === 'true/false') {
      const correctAnswer = normalizeBooleanLike(question?.correctAnswer);
      const studentAnswer = normalizeBooleanLike(response?.answer);
      isCorrect = correctAnswer !== '' && studentAnswer !== '' && correctAnswer === studentAnswer;
    } else if (normalizedType === 'short answer') {
      const correctAnswer = normalizeString(question?.sampleAnswer || question?.correctAnswer);
      const studentAnswer = normalizeString(response?.answer);
      isCorrect =
        correctAnswer !== '' &&
        (studentAnswer === correctAnswer ||
          studentAnswer.includes(correctAnswer) ||
          correctAnswer.includes(studentAnswer) ||
          (correctAnswer.includes(',') || correctAnswer.includes(';')
            ? correctAnswer.split(/[,;]/).some((answer) => {
                const trimmed = normalizeString(answer);
                return (
                  trimmed !== '' &&
                  (studentAnswer === trimmed ||
                    studentAnswer.includes(trimmed) ||
                    trimmed.includes(studentAnswer))
                );
              })
            : false) ||
          studentAnswer.replace(/\s+/g, ' ') === correctAnswer.replace(/\s+/g, ' '));
    } else if (normalizedType === 'long answer') {
      const correctAnswer = normalizeString(question?.correctAnswer || question?.sampleAnswer);
      const studentAnswer = normalizeString(response?.answer);
      isCorrect =
        correctAnswer !== '' &&
        (studentAnswer === correctAnswer ||
          studentAnswer.includes(correctAnswer) ||
          correctAnswer.includes(studentAnswer) ||
          (correctAnswer.includes(',') || correctAnswer.includes(';')
            ? correctAnswer.split(/[,;]/).some((answer) => {
                const trimmed = normalizeString(answer);
                return (
                  trimmed !== '' &&
                  (studentAnswer === trimmed ||
                    studentAnswer.includes(trimmed) ||
                    trimmed.includes(studentAnswer))
                );
              })
            : false) ||
          studentAnswer.replace(/\s+/g, ' ') === correctAnswer.replace(/\s+/g, ' '));
    } else {
      const correctAnswer = normalizeString(question?.correctAnswer || question?.sampleAnswer);
      const studentAnswer = normalizeString(response?.answer);
      isCorrect = correctAnswer !== '' && studentAnswer === correctAnswer;
    }
  } catch (error) {
    console.error('❌ Answer comparison error:', error);
    isCorrect = false;
  }

  return {
    isCorrect,
    points: isCorrect ? pointsPerQuestion : 0,
    correctOptionIndex,
    selectedOptionIndex
  };
};

const calculateQuizScore = (questions, responses, quizType) => {
  const scoringQuestions = normalizeQuestionsForScoring(questions, quizType);
  const totalQuestions = Array.isArray(scoringQuestions) ? scoringQuestions.length : 0;

  console.log('🧮 Starting Score Calculation:', {
    totalQuestions: totalQuestions,
    quizType,
    responseCount: Array.isArray(responses) ? responses.length : Object.keys(responses || {}).length
  });

  const normalizedResponses = normalizeResponses(responses);
  const responsesById = new Map();
  const responsesByIndex = new Map();

  normalizedResponses.forEach((response) => {
    if (response.questionId !== null && response.questionId !== undefined) {
      responsesById.set(String(response.questionId), response);
    }
    if (Number.isInteger(response.questionIndex)) {
      responsesByIndex.set(response.questionIndex, response);
    }
  });

  let totalPoints = 0;
  let correctAnswers = 0;
  let unansweredCount = 0;

  (scoringQuestions || []).forEach((question, index) => {
    const questionId = getStableQuestionId(question, index);
    const response =
      responsesById.get(questionId) ||
      responsesById.get(`q${questionId}`) ||
      responsesById.get(`q${index}`) ||
      responsesByIndex.get(index) ||
      null;

    const studentAnswer = response?.answer ?? '';
    if (normalizeString(studentAnswer) === '') {
      console.log('⏭️ Null/blank answer - 0 points for question', index + 1);
      unansweredCount++;
      return;
    }

    const { isCorrect, points } = scoreQuestion(question, response, quizType, totalQuestions);

    if (isCorrect) {
      correctAnswers++;
      totalPoints += points;
    }

    console.log(`📊 Question ${index + 1} Result:`, {
      isCorrect,
      points,
      totalPoints,
      correctAnswers
    });
  });

  const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  console.log('📊 Final Score Calculation:', {
    totalPoints,
    correctAnswers,
    totalQuestions,
    unansweredCount,
    percentage,
    calculation: `${correctAnswers}/${totalQuestions} × 100 = ${percentage}%`
  });

  return {
    score: totalPoints,
    correctAnswers,
    totalQuestions,
    unansweredCount,
    percentage,
    points: totalPoints
  };
};

const scoreAnswerInBackend = (question, studentAnswer, quizType, totalQuestions) => {
  const normalizedQuestion = normalizeQuestionForScoring(question, quizType);
  const { isCorrect, points } = scoreQuestion(
    normalizedQuestion,
    { answer: studentAnswer },
    quizType,
    totalQuestions
  );

  console.log('🔍 Backend Answer Scoring:', {
    questionId: question?.id,
    studentAnswer,
    quizType,
    correctAnswer: normalizedQuestion?.correctAnswer,
    isCorrect,
    points,
  });

  return { isCorrect, points };
};

const calculateFinalScore = (questions, answers, quizType) => {
  // Handle Space Race answer format (array of objects with questionId, answer, etc.)
  let normalizedAnswers = answers;
  if (Array.isArray(answers) && answers.length > 0 && answers[0]?.questionId !== undefined) {
    normalizedAnswers = {};
    answers.forEach((ans) => {
      const id =
        ans.questionId != null
          ? String(ans.questionId)
          : `q-${ans.questionIndex ?? 0}`;
      normalizedAnswers[id] = ans.answer;
    });
    console.log('🔄 Converted Space Race answers to questionId format:', normalizedAnswers);
  }

  const scoringResult = calculateQuizScore(questions, normalizedAnswers, quizType);

  console.log('📊 Backend Final Score Calculation:', scoringResult);

  return scoringResult;
};

module.exports = {
  calculateQuizScore,
  scoreAnswerInBackend,
  calculateFinalScore,
  normalizeQuestionsForScoring,
  normalizeQuestionForScoring
};
