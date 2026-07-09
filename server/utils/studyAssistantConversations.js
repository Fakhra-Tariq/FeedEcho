const { db } = require('../config/firebase');

const COLLECTION = 'studyAssistantConversations';
const TITLE_MAX_LENGTH = 60;

const conversationsRef = () => db.ref(COLLECTION);
const conversationRef = (conversationId) => db.ref(`${COLLECTION}/${conversationId}`);

const generateConversationId = () =>
  `conv-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

const generateTitleFromMessage = (text) => {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New conversation';
  if (cleaned.length <= TITLE_MAX_LENGTH) return cleaned;
  return `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trim()}…`;
};

/** First 5–6 words of the student's message for a short conversation title. */
const generateShortTitleFromMessage = (text, maxWords = 6) => {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return 'New conversation';
  return words.slice(0, maxWords).join(' ');
};

const normalizeMessages = (messages) => {
  if (!messages) return [];
  if (Array.isArray(messages)) {
    return messages.filter(Boolean);
  }
  if (typeof messages === 'object') {
    return Object.keys(messages)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => messages[key])
      .filter(Boolean);
  }
  return [];
};

const normalizeConversationRecord = (conversationId, data) => {
  if (!data || typeof data !== 'object') return null;
  return {
    conversationId: data.conversationId || conversationId,
    studentId: data.studentId || '',
    title: data.title || 'New conversation',
    createdAt: data.createdAt || null,
    messages: normalizeMessages(data.messages),
  };
};

const validateMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'Message must be an object' };
  }
  const role = message.role;
  if (role !== 'user' && role !== 'assistant') {
    return { ok: false, error: 'Message role must be "user" or "assistant"' };
  }
  const text = String(message.text || '').trim();
  if (!text) {
    return { ok: false, error: 'Message text is required' };
  }
  return {
    ok: true,
    value: {
      role,
      text,
      timestamp: message.timestamp || new Date().toISOString(),
    },
  };
};

const buildConversation = ({ conversationId, studentId, title, messages = [] }) => ({
  conversationId,
  studentId,
  title,
  createdAt: new Date().toISOString(),
  messages: normalizeMessages(messages),
});

const getLastMessageTimestamp = (messages, createdAt = null) => {
  const normalized = normalizeMessages(messages);
  if (!normalized.length) {
    return createdAt || null;
  }
  const lastMessage = normalized[normalized.length - 1];
  return lastMessage?.timestamp || createdAt || null;
};

const toConversationListItem = (conversation) => ({
  conversationId: conversation.conversationId,
  title: conversation.title,
  lastMessageAt: getLastMessageTimestamp(conversation.messages, conversation.createdAt),
});

module.exports = {
  COLLECTION,
  conversationsRef,
  conversationRef,
  generateConversationId,
  generateTitleFromMessage,
  generateShortTitleFromMessage,
  normalizeMessages,
  normalizeConversationRecord,
  validateMessage,
  buildConversation,
  getLastMessageTimestamp,
  toConversationListItem,
};
