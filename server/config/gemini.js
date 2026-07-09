const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

let geminiClient = null;
let geminiModel = null;

if (apiKey) {
  geminiClient = new GoogleGenerativeAI(apiKey);
  geminiModel = geminiClient.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  console.log(`✅ Gemini client initialized (${GEMINI_MODEL_NAME})`);
} else {
  console.warn('⚠️ GEMINI_API_KEY is not set. Gemini features will be unavailable.');
}

module.exports = {
  geminiClient,
  geminiModel,
  GEMINI_MODEL_NAME,
};
