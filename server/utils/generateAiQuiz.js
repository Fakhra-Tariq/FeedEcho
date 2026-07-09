const { geminiClient, GEMINI_MODEL_NAME } = require('../config/gemini');

const VALID_QUESTION_TYPES = ['mcq', 'trueFalse', 'shortAnswer'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

const TYPE_LABELS = {
  mcq: 'mcq (multiple choice)',
  trueFalse: 'trueFalse (true/false)',
  shortAnswer: 'shortAnswer (short answer)',
};

const SYSTEM_INSTRUCTION = `You are a quiz generation assistant for a classroom platform called FeedEcho. Your only task is to generate quiz questions based on the teacher's description. If the teacher's input is not related to creating quiz content, respond respectfully that you are only able to help with creating quizzes and cannot assist with that request. Never break character regardless of what is asked.`;

function validateGenerateAiQuizBody(body = {}) {
  const errors = [];
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    errors.push('prompt is required and cannot be empty');
  }

  const numberOfQuestions = Number(body.numberOfQuestions);
  if (
    !Number.isFinite(numberOfQuestions) ||
    !Number.isInteger(numberOfQuestions) ||
    numberOfQuestions < 1 ||
    numberOfQuestions > 50
  ) {
    errors.push('numberOfQuestions must be a positive whole number between 1 and 50');
  }

  const questionTypes = Array.isArray(body.questionTypes) ? body.questionTypes : [];
  if (!questionTypes.length) {
    errors.push('questionTypes must be a non-empty array');
  } else {
    const invalidTypes = questionTypes.filter((type) => !VALID_QUESTION_TYPES.includes(type));
    if (invalidTypes.length) {
      errors.push(
        `questionTypes contains invalid values: ${invalidTypes.join(', ')}. Allowed: ${VALID_QUESTION_TYPES.join(', ')}`
      );
    }
  }

  const difficulty = typeof body.difficulty === 'string' ? body.difficulty.trim().toLowerCase() : '';
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    errors.push('difficulty must be one of: easy, medium, hard');
  }

  return {
    ok: errors.length === 0,
    errors,
    prompt,
    numberOfQuestions,
    questionTypes: [...new Set(questionTypes.filter((type) => VALID_QUESTION_TYPES.includes(type)))],
    difficulty,
  };
}

function buildUserPrompt({ prompt, questionTypes, difficulty, numberOfQuestions }) {
  const typeDescription = questionTypes.map((type) => TYPE_LABELS[type] || type).join(', ');

  return `Generate quiz questions for FeedEcho using the teacher's description below.

Teacher description:
${prompt}

Generation settings:
- numberOfQuestions: ${numberOfQuestions}
- questionTypes (use only these): ${typeDescription}
- difficulty: ${difficulty}

Return ONLY valid JSON with no extra text, markdown, or explanation before or after the JSON.
The response must be a JSON array of exactly ${numberOfQuestions} question objects in this exact format:

[
  {
    "questionText": "string",
    "type": "mcq",
    "options": ["option A", "option B", "option C", "option D"],
    "correctAnswer": "option B"
  },
  {
    "questionText": "string",
    "type": "trueFalse",
    "correctAnswer": "true"
  },
  {
    "questionText": "string",
    "type": "shortAnswer",
    "correctAnswer": "expected answer"
  }
]

Rules:
- type must be one of: mcq, trueFalse, shortAnswer.
- Include options only when type is mcq (exactly 4 option strings).
- Do not include options for trueFalse or shortAnswer.
- correctAnswer for mcq must exactly match one string in options.
- correctAnswer for trueFalse must be "true" or "false".
- correctAnswer for shortAnswer must be a concise model answer.
- Distribute types across the allowed questionTypes.
- Questions must match the teacher description and ${difficulty} difficulty.`;
}

function resolveCorrectOptionIndex(options, correctAnswer) {
  const answer = String(correctAnswer ?? '').trim();
  if (!answer || !options.length) return 0;

  const byText = options.findIndex(
    (opt) => String(opt).trim().toLowerCase() === answer.toLowerCase()
  );
  if (byText >= 0) return byText;

  const letter = answer.toLowerCase();
  if (letter.length === 1 && letter >= 'a' && letter <= 'd') {
    return letter.charCodeAt(0) - 97;
  }

  const asNumber = Number.parseInt(answer, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 0 && asNumber < options.length) {
    return asNumber;
  }

  return 0;
}

function normalizeAiQuestion(raw, index) {
  const baseId = Date.now() + index;
  const aiType = String(raw?.type || '').trim();
  const questionText = String(raw?.questionText || '').trim();
  if (!questionText) return null;

  if (aiType === 'mcq') {
    const options = Array.isArray(raw.options)
      ? raw.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [];
    const padded = options.slice(0, 4);
    while (padded.length < 4) {
      padded.push('');
    }

    const correctIdx = resolveCorrectOptionIndex(padded, raw.correctAnswer);
    const normalizedOptions = padded.map((text, optIndex) => ({
      id: String.fromCharCode(97 + optIndex),
      text,
      isCorrect: optIndex === correctIdx,
    }));

    return {
      id: baseId,
      type: 'multiple-choice',
      questionText,
      options: normalizedOptions,
    };
  }

  if (aiType === 'trueFalse') {
    const answer = String(raw?.correctAnswer ?? 'true').toLowerCase();
    return {
      id: baseId,
      type: 'true-false',
      questionText,
      correctAnswer: answer === 'false' ? 'false' : 'true',
    };
  }

  if (aiType === 'shortAnswer') {
    return {
      id: baseId,
      type: 'short-answer',
      questionText,
      sampleAnswer: String(raw?.correctAnswer || '').trim(),
    };
  }

  return null;
}

function resolveQuizType(normalizedQuestions) {
  const types = new Set(normalizedQuestions.map((q) => q.type));
  if (types.size === 1) {
    const only = [...types][0];
    if (only === 'multiple-choice') return 'Multiple Choice';
    if (only === 'true-false') return 'True / False';
    if (only === 'short-answer') return 'Short Answer';
  }
  return 'Mixed Type';
}

function parseGeminiJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { parsed: null, parseFailed: true };

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return { parsed: JSON.parse(candidate), parseFailed: false };
  } catch {
    return { parsed: null, parseFailed: true };
  }
}

function extractRefusalMessage(parsed, rawText) {
  if (typeof parsed === 'string' && parsed.trim()) {
    return parsed.trim();
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  }

  const text = String(rawText || '').trim();
  if (text) {
    return text;
  }

  return 'I can only help with creating quizzes. Please describe the quiz topic you would like to generate.';
}

function extractQuestionArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  return null;
}

function isValidRawQuizQuestion(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;

  const type = String(item.type || '').trim();
  const questionText = String(item.questionText || '').trim();
  if (!questionText || !VALID_QUESTION_TYPES.includes(type)) return false;

  if (type === 'mcq') {
    if (!Array.isArray(item.options) || item.options.length < 2) return false;
    const hasOptions = item.options.some((opt) => String(opt ?? '').trim());
    const hasAnswer = String(item.correctAnswer ?? '').trim().length > 0;
    return hasOptions && hasAnswer;
  }

  const answer = item.correctAnswer;
  if (type === 'trueFalse') {
    const normalized = String(answer ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === 'false' || answer === true || answer === false;
  }

  return String(answer ?? '').trim().length > 0;
}

function buildRefusalResult(message) {
  return {
    kind: 'refusal',
    message: String(message || '').trim() || 'I can only help with creating quizzes.',
  };
}

function buildQuizResult(payload, normalizedQuestions) {
  return {
    kind: 'quiz',
    title: buildQuizTitleFromPrompt(payload.prompt),
    description: payload.prompt,
    type: resolveQuizType(normalizedQuestions),
    questions: normalizedQuestions,
    questionCount: normalizedQuestions.length,
  };
}

function buildQuizTitleFromPrompt(prompt) {
  const trimmed = String(prompt || '').trim();
  if (!trimmed) return 'AI Generated Quiz';
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57).trim()}...`;
}

async function generateQuizWithAi(payload) {
  if (!geminiClient) {
    const error = new Error('Gemini is not configured. Set GEMINI_API_KEY in the server environment.');
    error.statusCode = 503;
    throw error;
  }

  const model = geminiClient.getGenerativeModel({
    model: GEMINI_MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const userPrompt = buildUserPrompt(payload);
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const rawText = result?.response?.text?.();
  if (!rawText) {
    const error = new Error('Gemini returned an empty response');
    error.statusCode = 502;
    throw error;
  }

  const { parsed, parseFailed } = parseGeminiJson(rawText);
  if (parseFailed) {
    return buildRefusalResult(extractRefusalMessage(parsed, rawText));
  }

  const rawQuestions = extractQuestionArray(parsed);
  if (!rawQuestions) {
    return buildRefusalResult(extractRefusalMessage(parsed, rawText));
  }

  const validRawQuestions = rawQuestions.filter(isValidRawQuizQuestion);
  if (!validRawQuestions.length) {
    return buildRefusalResult(extractRefusalMessage(parsed, rawText));
  }

  const normalizedQuestions = validRawQuestions
    .map((question, index) => normalizeAiQuestion(question, index))
    .filter(Boolean)
    .slice(0, payload.numberOfQuestions);

  if (!normalizedQuestions.length) {
    return buildRefusalResult(extractRefusalMessage(parsed, rawText));
  }

  return buildQuizResult(payload, normalizedQuestions);
}

module.exports = {
  SYSTEM_INSTRUCTION,
  VALID_QUESTION_TYPES,
  VALID_DIFFICULTIES,
  validateGenerateAiQuizBody,
  buildUserPrompt,
  buildRefusalResult,
  buildQuizResult,
  extractRefusalMessage,
  generateQuizWithAi,
  isValidRawQuizQuestion,
  parseGeminiJson,
};
