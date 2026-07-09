const express = require('express');
const {
  conversationsRef,
  conversationRef,
  normalizeConversationRecord,
  toConversationListItem,
} = require('../utils/studyAssistantConversations');

const router = express.Router();

const parseStudentId = (value) => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return value.trim();
};

const assertConversationOwner = (conversation, studentId) =>
  conversation && conversation.studentId === studentId;

const listConversationsForStudent = async (studentId) => {
  const collectMatches = (snap) => {
    const conversations = [];
    if (!snap.exists()) return conversations;

    snap.forEach((child) => {
      const normalized = normalizeConversationRecord(child.key, child.val());
      if (normalized && normalized.studentId === studentId) {
        conversations.push(toConversationListItem(normalized));
      }
    });

    return conversations;
  };

  try {
    const indexedSnap = await conversationsRef()
      .orderByChild('studentId')
      .equalTo(studentId)
      .get();
    return collectMatches(indexedSnap);
  } catch (indexedError) {
    console.warn(
      'Study assistant indexed history query failed; falling back to full scan:',
      indexedError.message
    );
    const fullSnap = await conversationsRef().get();
    return collectMatches(fullSnap);
  }
};

/** GET /?studentId=xxx — list past conversations for a student */
router.get('/', async (req, res) => {
  try {
    const studentId = parseStudentId(req.query.studentId);
    if (!studentId) {
      return res.status(400).json({ success: false, error: 'studentId is required' });
    }

    const conversations = await listConversationsForStudent(studentId);

    conversations.sort((a, b) =>
      String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''))
    );

    return res.json({ success: true, data: conversations });
  } catch (error) {
    console.error('List study assistant conversations error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

/** GET /:conversationId — full messages for reopening a chat */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const studentId = parseStudentId(req.query.studentId);
    const snap = await conversationRef(conversationId).get();

    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const conversation = normalizeConversationRecord(conversationId, snap.val());
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (studentId && !assertConversationOwner(conversation, studentId)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({
      success: true,
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
      },
    });
  } catch (error) {
    console.error('Get study assistant conversation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
});

/** DELETE /:conversationId — permanently delete a conversation */
router.delete('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const studentId = parseStudentId(req.query.studentId);
    const snap = await conversationRef(conversationId).get();

    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const conversation = normalizeConversationRecord(conversationId, snap.val());
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (studentId && !assertConversationOwner(conversation, studentId)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await conversationRef(conversationId).remove();
    return res.json({ success: true, data: { conversationId } });
  } catch (error) {
    console.error('Delete study assistant conversation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

module.exports = router;
