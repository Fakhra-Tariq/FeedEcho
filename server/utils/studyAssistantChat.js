const { geminiClient } = require('../config/gemini');
const { generateShortTitleFromMessage } = require('./studyAssistantConversations');

// gemini-2.5-flash free tier is only 20 requests/day per model — use flash-lite for study assistant.
const STUDY_ASSISTANT_PRIMARY_MODEL =
  process.env.STUDY_ASSISTANT_GEMINI_MODEL || 'gemini-2.5-flash-lite';
const STUDY_ASSISTANT_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

const SYSTEM_INSTRUCTION = `You are FeedEcho's AI Study Assistant, a friendly, accurate and knowledgeable tutor for students. Always answer the student's question directly and correctly FIRST, then explain briefly. For multiple-choice questions, name the correct option clearly (for example: Correct answer: B) Methodology) and explain why it is right and why the other options are wrong. For true/false questions, begin with True or False and give a short one-to-two-line reason. For math, physics, chemistry, statistics and accounting, show clear steps and state the final answer. Handle fill-in-the-blank, matching, one-word, short-answer, long-answer, essay, coding, summaries, paraphrasing, grammar correction, translation, simplifying difficult topics, and exam-prep requests fully, including practice questions, quizzes, study plans, revision tips, and mnemonics. If a student pastes a question with options in a messy format (numbering and choices on one line), interpret it and answer it. If several questions are sent together, answer each one in order, numbered to match. Use earlier messages in the conversation for follow-ups such as "explain that more simply" or "why is A wrong?". Reply in the same language as the student (English, Urdu, or Roman Urdu/Hinglish). Keep answers clear, well-organized and concise unless the student asks for more detail. If a question is genuinely ambiguous, ask one short clarifying question. Be honest: if you are not sure, say so instead of guessing. Help with anything related to learning, studying, academic writing, projects, and academic or career guidance; politely steer back to studies if a request is completely unrelated to education. Never reply with a generic message without actually answering.

Format every reply as plain text only. Use simple line breaks and numbered or dashed lists. Do not use Markdown symbols such as **, ##, \`, or * for emphasis.`;

const HISTORY_MESSAGE_LIMIT = 20;
const MAX_OUTPUT_TOKENS = 8192;

const MAX_GEMINI_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toGeminiRole = (role) => (role === 'assistant' ? 'model' : 'user');

const buildGeminiHistory = (messages = []) =>
  messages
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && entry.text)
    .map((entry) => ({
      role: toGeminiRole(entry.role),
      parts: [{ text: String(entry.text) }],
    }));

/**
 * Gemini chat requires alternating user/model turns and must not end with an
 * unanswered user message before sendMessage adds the next user turn.
 */
const sanitizeGeminiHistory = (history = []) => {
  if (!history.length) return [];

  let sanitized = [...history];

  const firstUserIndex = sanitized.findIndex((entry) => entry.role === 'user');
  if (firstUserIndex === -1) return [];
  if (firstUserIndex > 0) sanitized = sanitized.slice(firstUserIndex);

  const alternated = [];
  for (const entry of sanitized) {
    if (!alternated.length) {
      alternated.push(entry);
      continue;
    }
    const last = alternated[alternated.length - 1];
    if (last.role === entry.role) {
      last.parts[0].text = `${last.parts[0].text}\n${entry.parts[0].text}`;
    } else {
      alternated.push(entry);
    }
  }

  if (alternated.length && alternated[alternated.length - 1].role === 'user') {
    alternated.pop();
  }

  return alternated;
};

const getGeminiHttpStatus = (error) =>
  error?.status ??
  error?.statusCode ??
  error?.response?.status ??
  error?.cause?.status ??
  null;

const isRetryableGeminiError = (error) => {
  const status = getGeminiHttpStatus(error);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
};

const logGeminiError = (context, error) => {
  console.error(`[study-assistant][gemini] ${context} RAW ERROR`, {
    name: error?.name,
    message: error?.message,
    status: getGeminiHttpStatus(error),
    statusText: error?.statusText,
    errorDetails: error?.errorDetails,
    errorDetailsJson: JSON.stringify(error?.errorDetails ?? null),
    stack: error?.stack,
  });
};

const parseRetryDelayMs = (error) => {
  const message = String(error?.message || '');
  const inlineMatch = message.match(/Please retry in ([\d.]+)s/i);
  if (inlineMatch) {
    return Math.ceil(parseFloat(inlineMatch[1]) * 1000) + 500;
  }

  const retryInfo = (error?.errorDetails || []).find(
    (detail) => detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
  );
  if (retryInfo?.retryDelay) {
    const seconds = parseInt(String(retryInfo.retryDelay).replace(/s$/, ''), 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds * 1000 + 500;
    }
  }

  return null;
};

const isDailyQuotaExceeded = (error, modelName) => {
  const message = String(error?.message || '').toLowerCase();
  const details = JSON.stringify(error?.errorDetails || {}).toLowerCase();
  return (
    getGeminiHttpStatus(error) === 429 &&
    (message.includes('generate_content_free_tier_requests') ||
      details.includes('generatecontentfreedaily') ||
      details.includes('perdayperprojectpermodel-freetier') ||
      message.includes(`model: ${String(modelName).toLowerCase()}`))
  );
};

async function withGeminiRetry(operation, context) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logGeminiError(`${context} (attempt ${attempt}/${MAX_GEMINI_ATTEMPTS})`, error);

      if (attempt >= MAX_GEMINI_ATTEMPTS || !isRetryableGeminiError(error)) {
        throw error;
      }

      const retryDelayMs = parseRetryDelayMs(error);
      const delayMs = retryDelayMs || RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[study-assistant][gemini] Retrying ${context} in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const extractReplyText = (result) => {
  const response = result?.response;
  if (!response) return null;

  try {
    const text = response.text?.();
    if (text && String(text).trim()) return String(text).trim();
  } catch (textError) {
    logGeminiError('response.text()', textError);
  }

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    return "I'm not able to respond to that message. Could you rephrase your study question?";
  }

  const partsText = (candidate?.content?.parts || [])
    .map((part) => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim();
  if (partsText) return partsText;

  return null;
};

const toServiceError = (error, fallbackMessage) => {
  const status = getGeminiHttpStatus(error);
  const serviceError = new Error(error?.message || fallbackMessage);
  if (status === 429) {
    serviceError.statusCode = 429;
    const isDaily = String(error?.message || '').toLowerCase().includes('perday');
    serviceError.message = isDaily
      ? 'Daily AI quota reached. Please try again tomorrow or upgrade your Gemini API plan.'
      : 'AI is busy right now. Please wait a moment and try again.';
    return serviceError;
  }
  if (status === 503 || status === 502 || status === 504) {
    serviceError.statusCode = 503;
    serviceError.message = 'AI service is temporarily unavailable. Please try again shortly.';
    return serviceError;
  }
  if (String(error?.message || '').toLowerCase().includes('timeout')) {
    serviceError.statusCode = 504;
    serviceError.message = 'AI is taking too long to respond. Please try again.';
    return serviceError;
  }
  serviceError.statusCode = status && status >= 400 && status < 600 ? status : 502;
  serviceError.message = fallbackMessage;
  return serviceError;
};

async function invokeStudyAssistantModel(modelName, priorMessages, messageText) {
  const model = geminiClient.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.4,
    },
  });

  const recentPrior = Array.isArray(priorMessages)
    ? priorMessages.slice(-HISTORY_MESSAGE_LIMIT)
    : [];
  const history = sanitizeGeminiHistory(buildGeminiHistory(recentPrior));
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(messageText);
  const reply = extractReplyText(result);

  if (!reply) {
    const error = new Error(`Gemini model ${modelName} returned an empty response`);
    error.statusCode = 502;
    throw error;
  }

  return reply;
}

async function generateStudyAssistantReply(priorMessages, newMessage) {
  if (!geminiClient) {
    const error = new Error('Gemini is not configured. Set GEMINI_API_KEY in the server environment.');
    error.statusCode = 503;
    throw error;
  }

  const messageText = String(newMessage || '').trim();
  if (!messageText) {
    const error = new Error('message is required');
    error.statusCode = 400;
    throw error;
  }

  const modelsToTry = [
    STUDY_ASSISTANT_PRIMARY_MODEL,
    ...(STUDY_ASSISTANT_PRIMARY_MODEL !== STUDY_ASSISTANT_FALLBACK_MODEL
      ? [STUDY_ASSISTANT_FALLBACK_MODEL]
      : []),
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      return await withGeminiRetry(
        () => invokeStudyAssistantModel(modelName, priorMessages, messageText),
        `generateStudyAssistantReply:${modelName}`
      );
    } catch (error) {
      lastError = error;
      logGeminiError(`generateStudyAssistantReply model ${modelName} exhausted`, error);

      const canTryFallback =
        modelsToTry.indexOf(modelName) < modelsToTry.length - 1 &&
        (isDailyQuotaExceeded(error, modelName) || getGeminiHttpStatus(error) === 429);

      if (!canTryFallback) {
        break;
      }

      console.warn(
        `[study-assistant][gemini] Quota/rate limit on ${modelName}, trying ${modelsToTry[modelsToTry.indexOf(modelName) + 1]}...`
      );
    }
  }

  try {
    throw lastError;
  } catch (error) {
    throw toServiceError(error, 'Failed to generate study assistant reply');
  }
}

async function generateConversationTitle(firstMessage) {
  // Avoid a second Gemini API call (doubles quota usage on new chats).
  return generateShortTitleFromMessage(firstMessage, 6);
}

module.exports = {
  SYSTEM_INSTRUCTION,
  buildGeminiHistory,
  sanitizeGeminiHistory,
  generateStudyAssistantReply,
  generateConversationTitle,
};
