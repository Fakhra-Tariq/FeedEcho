const express = require('express');
const {
  conversationRef,
  generateConversationId,
  generateTitleFromMessage,
  normalizeMessages,
  normalizeConversationRecord,
  buildConversation,
} = require('../utils/studyAssistantConversations');
const {
  generateStudyAssistantReply,
  generateConversationTitle,
} = require('../utils/studyAssistantChat');

const router = express.Router();

const buildUserMessage = (text) => ({
  role: 'user',
  text: String(text).trim(),
  timestamp: new Date().toISOString(),
});

const buildAssistantMessage = (text) => ({
  role: 'assistant',
  text: String(text).trim(),
  timestamp: new Date().toISOString(),
});

/**
 * POST /chat
 * Body: { studentId, conversationId?, message }
 */
router.post('/chat', async (req, res) => {
  try {
    const { studentId, conversationId, message } = req.body || {};

    if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
      return res.status(400).json({ success: false, error: 'studentId is required' });
    }

    const messageText = typeof message === 'string' ? message.trim() : '';
    if (!messageText) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const trimmedStudentId = studentId.trim();
    const userMessage = buildUserMessage(messageText);
    const isNewConversation = !conversationId || !String(conversationId).trim();

    let resolvedConversationId = isNewConversation ? '' : String(conversationId).trim();
    let priorMessages = [];
    let existing = null;

    if (!isNewConversation) {
      const snap = await conversationRef(resolvedConversationId).get();

      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }

      existing = normalizeConversationRecord(resolvedConversationId, snap.val());
      if (!existing || existing.studentId !== trimmedStudentId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      priorMessages = normalizeMessages(existing.messages);
    }

    const assistantReply = await generateStudyAssistantReply(priorMessages, messageText);
    const assistantMessage = buildAssistantMessage(assistantReply);

    if (isNewConversation) {
      resolvedConversationId = generateConversationId();
      const title = await generateConversationTitle(messageText);
      const conversation = buildConversation({
        conversationId: resolvedConversationId,
        studentId: trimmedStudentId,
        title,
        messages: [userMessage, assistantMessage],
      });

      await conversationRef(resolvedConversationId).set(conversation);

      return res.status(201).json({
        success: true,
        data: {
          conversationId: resolvedConversationId,
          reply: assistantReply,
          title,
        },
      });
    }

    const nextMessages = [...priorMessages, userMessage, assistantMessage];
    let nextTitle = existing.title;
    if (!nextTitle || nextTitle === 'New conversation') {
      const firstUserMessage = nextMessages.find((entry) => entry.role === 'user');
      if (firstUserMessage) {
        nextTitle = generateTitleFromMessage(firstUserMessage.text);
      }
    }

    await conversationRef(resolvedConversationId).update({
      title: nextTitle,
      messages: nextMessages,
    });

    return res.json({
      success: true,
      data: {
        conversationId: resolvedConversationId,
        reply: assistantReply,
      },
    });
  } catch (error) {
    console.error('[study-assistant] chat request failed', {
      name: error?.name,
      message: error?.message,
      statusCode: error?.statusCode,
      status: error?.status,
      statusText: error?.statusText,
      errorDetails: error?.errorDetails,
      stack: error?.stack,
      studentId: req.body?.studentId,
      conversationId: req.body?.conversationId || null,
      messagePreview:
        typeof req.body?.message === 'string' ? req.body.message.slice(0, 120) : null,
    });
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500
        ? 'Failed to process chat message'
        : error.message || 'Request failed';
    return res.status(statusCode).json({ success: false, error: message });
  }
});

module.exports = router;
