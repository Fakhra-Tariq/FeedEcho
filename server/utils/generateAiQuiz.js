const { geminiClient, GEMINI_MODEL_NAME } = require('../config/gemini');

const VALID_QUESTION_TYPES = ['mcq', 'trueFalse', 'shortAnswer'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

const TYPE_LABELS = {
  mcq: 'mcq (multiple choice)',
  trueFalse: 'trueFalse (true/false)',
  shortAnswer: 'shortAnswer (short answer)',
};

const SYSTEM_INSTRUCTION = `You are a quiz generation assistant for a classroom platform called FeedEcho. Your only task is to generate quiz questions based on the teacher's description. If the teacher's input is not related to creating quiz content, respond respectfully that you are only able to help with creating quizzes and cannot assist with that request. Never break character regardless of what is asked. For shortAnswer questions, always produce objective factual items with a short exact correctAnswer (prefer 1 word, maximum 2–3 words). Never generate Explain/Describe/Discuss-style shortAnswer prompts or paragraph answers.`;

const SHORT_ANSWER_MAX_WORDS = 3;

function countAnswerWords(answer) {
  return String(answer || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Reject explanatory stems that produce long free-text answers. */
function hasForbiddenShortAnswerStem(questionText) {
  const text = String(questionText || '').trim();
  if (!text) return true;
  if (/^(explain|describe|discuss|compare|analyze|analyse|why)\b/i.test(text)) {
    return true;
  }
  // Ban open-ended "How..." prompts, but allow factual forms like "How many/much/long..."
  if (
    /^how\b/i.test(text) &&
    !/^how\s+(many|much|long|old|far|often|tall|wide|high|fast|large)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

function isValidShortAnswerPayload(item) {
  const questionText = String(item?.questionText || '').trim();
  const answer = String(item?.correctAnswer ?? '').trim();
  if (!questionText || !answer) return false;
  if (hasForbiddenShortAnswerStem(questionText)) return false;
  if (countAnswerWords(answer) > SHORT_ANSWER_MAX_WORDS) return false;
  // Exact-match scoring cannot handle sentence/paragraph answers.
  if (/[.!?;:]/.test(answer) || answer.length > 48) return false;
  return true;
}

function buildShortAnswerRules(questionTypes) {
  if (!questionTypes.includes('shortAnswer')) return '';

  return `
Short Answer rules (apply ONLY when type is "shortAnswer"; do not apply these to mcq or trueFalse):
- Generate ONLY objective, factual questions with one clear exact answer.
- Prefer a single-word correctAnswer whenever possible.
- If a single word is not possible, correctAnswer may contain at most 2–3 words (e.g. "Alexander Graham Bell", "carbon dioxide").
- Never use explanatory, descriptive, analytical, essay-style, or paragraph-length sample answers.
- Never begin shortAnswer questionText with: Explain, Describe, Discuss, Compare, Analyze, Why, or open-ended How (How many / How much / How long are allowed).
- Students type an exact answer, so correctAnswer must be short and matchable.
- Good shortAnswer examples:
  - "What is the capital of Japan?" → "Tokyo"
  - "Which planet is known as the Red Planet?" → "Mars"
  - "What is the chemical symbol for gold?" → "Au"
  - "What is the largest continent?" → "Asia"
  - "Who invented the telephone?" → "Alexander Graham Bell"
- Bad shortAnswer examples (never generate these):
  - "Explain the concept of semantic bleaching..."
  - "Describe the process of photosynthesis."
  - "Discuss the causes of World War I."
  - "Compare TCP and UDP."
  - "Explain the four pillars of OOP."
`;
}

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
  const shortAnswerRules = buildShortAnswerRules(questionTypes);

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
    "correctAnswer": "Tokyo"
  }
]

Rules:
- type must be one of: mcq, trueFalse, shortAnswer.
- Include options only when type is mcq (exactly 4 option strings).
- Do not include options for trueFalse or shortAnswer.
- correctAnswer for mcq must exactly match one string in options.
- correctAnswer for trueFalse must be "true" or "false".
- correctAnswer for shortAnswer must be a short exact answer: prefer 1 word, maximum 2–3 words.
- Distribute types across the allowed questionTypes.
- Questions must match the teacher description and ${difficulty} difficulty.
${shortAnswerRules}`;
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

  if (type === 'shortAnswer') {
    return isValidShortAnswerPayload(item);
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

const TITLE_PREFIX_PATTERNS = [
  /^(please\s+)?(can\s+you|could\s+you|would\s+you)\s+/i,
  /^(i\s+want\s+you\s+to|i\s+would\s+like\s+you\s+to|i\s+need\s+you\s+to|i'?d\s+like\s+you\s+to)\s+/i,
  /^(i\s+want|i\s+would\s+like|i\s+need|i'?d\s+like)\s+(a\s+|an\s+|to\s+)?/i,
  /^(please\s+)?(help\s+me\s+)?(to\s+)?/i,
  /^(generate|create|make|write|build|prepare|design|produce|give\s+me|make\s+me)\s+/i,
  /^(a\s+|an\s+|some\s+|the\s+)?(short\s+|quick\s+|simple\s+|brief\s+)?(quiz|quizzes|questions?|test|exam|assessment)\s*/i,
  /^(on|about|for|regarding|covering|based\s+on|related\s+to|with\s+topic|with\s+the\s+topic|on\s+the\s+topic\s+of|on\s+topic)\s+/i,
  /^(topic|subject)\s*[:\-–—]\s*/i,
];

const TITLE_MAX_WORDS = 5;

function stripTitlePrefixes(value) {
  let text = String(value || '').trim();
  if (!text) return '';

  let changed = true;
  while (changed && text) {
    changed = false;
    for (const pattern of TITLE_PREFIX_PATTERNS) {
      const next = text.replace(pattern, '').trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }

  // Drop a leftover leading "quiz on/about ..." if prefixes left a fragment.
  text = text
    .replace(/^(quiz|quizzes|questions?|test|exam)\s+(on|about|for|regarding)\s+/i, '')
    .replace(/^(on|about|for|regarding)\s+/i, '')
    .trim();

  return text;
}

function titleCaseWord(word) {
  if (!word) return word;

  if (word.includes('-')) {
    return word.split('-').map(titleCaseWord).join('-');
  }

  // Keep acronyms (HTML, DNA) and mixed-case tokens (DevOps).
  if (word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word;
  }
  if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) {
    return word;
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function toQuizTitleCase(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

/** Derive a short subject title from the teacher prompt — never reuse the full prompt. */
function buildQuizTitleFromPrompt(prompt) {
  const original = String(prompt || '').trim().replace(/\s+/g, ' ');
  if (!original) return 'AI Generated Quiz';

  // Prefer the overall subject before a colon (subtopics after the colon are ignored).
  // Do not split on hyphens — titles like "object-oriented programming" must stay intact.
  const colonIndex = original.search(/[:：]/);
  let candidate = colonIndex >= 0 ? original.slice(0, colonIndex).trim() : original;
  if (!candidate) candidate = original;

  // Use the first sentence/clause if the prompt is conversational.
  candidate = candidate.split(/[.?!]/)[0].trim() || candidate;

  candidate = stripTitlePrefixes(candidate);

  // Remove trailing instructional leftovers.
  candidate = candidate
    .replace(/\b(please|thanks|thank\s+you)\b/gi, ' ')
    .replace(/["""''`]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;.\-–—\s]+|[,;.\-–—\s]+$/g, '')
    .trim();

  if (!candidate) return 'AI Generated Quiz';

  // Prefer a concise title (1–5 words).
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > TITLE_MAX_WORDS) {
    candidate = words.slice(0, TITLE_MAX_WORDS).join(' ');
  }

  const titled = toQuizTitleCase(candidate);
  if (!titled) return 'AI Generated Quiz';

  // Safety: never fall back to dumping a long conversational prompt as the title.
  if (
    titled.length > 60 ||
    (titled.toLowerCase() === original.toLowerCase() && original.split(/\s+/).length > TITLE_MAX_WORDS)
  ) {
    const shortened = toQuizTitleCase(words.slice(0, Math.min(TITLE_MAX_WORDS, words.length)).join(' '));
    return shortened || 'AI Generated Quiz';
  }

  return titled;
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
  SHORT_ANSWER_MAX_WORDS,
  validateGenerateAiQuizBody,
  buildUserPrompt,
  buildShortAnswerRules,
  buildRefusalResult,
  buildQuizResult,
  buildQuizTitleFromPrompt,
  extractRefusalMessage,
  generateQuizWithAi,
  isValidRawQuizQuestion,
  isValidShortAnswerPayload,
  hasForbiddenShortAnswerStem,
  parseGeminiJson,
};
