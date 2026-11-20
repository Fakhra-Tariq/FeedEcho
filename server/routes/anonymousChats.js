const express = require('express');
const multer = require('multer');
const { db } = require('../config/firebase');
const { auth } = require('../config/firebase');
const { verifyFirebaseToken } = require('../middleware/auth');
const { generateSessionCode } = require('../utils/sessionCodeGenerator');
const { MAX_FILE_BYTES, MAX_FILE_LABEL } = require('../utils/resourceAllowlist');
const {
  saveStudentChatJoin,
  listStudentJoins,
  listChatResourceRecords,
  getChatResourceRecord,
  isChatHost,
  assertDownloadAccess,
  shareFile,
  shareLink,
  streamStoredFile,
  deleteChatResourceData,
} = require('../utils/liveChatResources');
const {
  prepareActivityLaunch,
  setSessionCurrentActivity,
  clearActivityFromActiveSession,
  appendSessionActivityHistory,
} = require('../utils/teacherSessionGuard');
const router = express.Router();

const generateId = (prefix = 'chat') =>
  `${prefix}-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

// ERD-aligned RTDB paths
const chatSessionRef = (id) => db.ref(`chat_sessions/${id}`);
const chatMessagesRef = (id) => db.ref(`chat_messages/${id}`);
const chatParticipantsRef = (id) => db.ref(`chat_participants/${id}`);
const chatJoinCodeRef = (code) => db.ref(`chat_join_codes/${String(code).toUpperCase()}`);

const sanitizeParticipantKey = (value) =>
  String(value || 'anonymous')
    .replace(/[.#$/[\]]/g, '_')
    .slice(0, 128);

const PARTICIPANT_STALE_MS = 45000;

async function syncChatMessageCount(chatId) {
  const msgsSnap = await chatMessagesRef(chatId).get();
  const count = msgsSnap.exists() ? Object.keys(msgsSnap.val() || {}).length : 0;
  await chatSessionRef(chatId).update({
    messageCount: count,
    updatedAt: new Date().toISOString(),
  });
  return count;
}

async function pruneStaleChatParticipants(chatId) {
  const snap = await chatParticipantsRef(chatId).get();
  if (!snap.exists()) return;

  const now = Date.now();
  const updates = {};
  Object.entries(snap.val() || {}).forEach(([key, participant]) => {
    const lastSeen = participant?.lastSeenAt ? new Date(participant.lastSeenAt).getTime() : 0;
    if (!lastSeen || now - lastSeen > PARTICIPANT_STALE_MS) {
      updates[key] = null;
    }
  });

  if (Object.keys(updates).length > 0) {
    await chatParticipantsRef(chatId).update(updates);
  }
}

async function syncChatParticipantCount(chatId) {
  const participantsSnap = await chatParticipantsRef(chatId).get();
  const count = participantsSnap.exists() ? Object.keys(participantsSnap.val() || {}).length : 0;
  await chatSessionRef(chatId).update({
    participants: count,
    updatedAt: new Date().toISOString(),
  });
  return count;
}

async function registerChatParticipant(chatId, participantId) {
  const key = sanitizeParticipantKey(participantId);
  if (!key) return null;

  const now = new Date().toISOString();
  const participantRef = chatParticipantsRef(chatId).child(key);
  const existingSnap = await participantRef.get();

  await participantRef.set({
    id: key,
    joinedAt: existingSnap.exists() ? existingSnap.val()?.joinedAt || now : now,
    lastSeenAt: now,
  });

  await pruneStaleChatParticipants(chatId);
  return syncChatParticipantCount(chatId);
}

// Optional auth: doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (token) {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
    } else {
      req.user = null;
    }
  } catch (e) {
    req.user = null;
  }
  next();
};

const resourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

const handleResourceUpload = (req, res, next) => {
  resourceUpload.single('file')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File is too large. Maximum size is ${MAX_FILE_LABEL}.`,
      });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
    }
    return next();
  });
};

async function loadChatOr404(id, res) {
  const snap = await chatSessionRef(id).get();
  if (!snap.exists()) {
    res.status(404).json({ success: false, error: 'Chat session not found' });
    return null;
  }
  return { id, ...(snap.val() || {}) };
}

function requireChatOwner(chat, uid, res) {
  if (!isChatHost(chat, uid)) {
    res.status(403).json({ success: false, error: 'Only the host of this chat can share resources' });
    return false;
  }
  return true;
}

function sendResourceError(res, error, fallback) {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    error: status === 500 ? fallback : error.message,
  });
}

// Create anonymous chat (auth optional; if present, store createdBy)
router.post('/create', optionalAuth, async (req, res) => {
  try {
    const { title, settings, description } = req.body;
    const headerUserId = req.headers['x-user-id'];
    const fallbackUserId =
      typeof headerUserId === 'string' && headerUserId.trim()
        ? headerUserId.trim()
        : (typeof req.body.createdBy === 'string' ? req.body.createdBy.trim() : null);
    const ownerId = req.user?.uid || fallbackUserId || null;

    // Enforce one active chat per teacher.
    if (ownerId) {
      // Use a plain read + in-memory filter to avoid requiring RTDB index deployment.
      const ownerChatsSnap = await db.ref('chat_sessions').get();
      const ownerChatsAll = ownerChatsSnap.exists() ? Object.values(ownerChatsSnap.val() || {}) : [];
      const ownerChats = ownerChatsAll.filter((chat) => chat?.createdBy === ownerId);
      const hasActiveChat = ownerChats.some((chat) => {
        if (!chat || typeof chat !== 'object') return false;
        if (String(chat.status || '').toLowerCase() === 'ended' || chat.isActive === false) {
          return false;
        }
        return chat.isActive === true || String(chat.status || '').toLowerCase() === 'active';
      });

      if (hasActiveChat) {
        return res.status(409).json({
          success: false,
          error: 'You already have an active chat. Please end it before creating a new one.',
        });
      }
    }

    const launchPrep = await prepareActivityLaunch('anonymousChat', null, ownerId);
    if (!launchPrep.ok) {
      console.warn('❌ anonymous chat create blocked', {
        ownerId,
        error: launchPrep.error,
      });
      return res.status(400).json({ success: false, error: launchPrep.error });
    }

    const joinCode = launchPrep.sessionCode;
    const id = generateId();
    const now = new Date().toISOString();
    const newChat = {
      id,
      title: title || 'Anonymous Chat',
      description: description || '',
      joinCode,
      sessionCode: joinCode,
      status: 'active',
      isActive: true,
      chatEnabled: true,
      moderationMode: settings?.moderationMode || false,
      namesVisible: false,
      createdBy: ownerId,
      createdAt: now,
      lastActivity: now,
      updatedAt: now,
      participants: 0,
      messageCount: 0,
      settings: {
        allowQuestions: settings?.allowQuestions !== false,
        allowComments: settings?.allowComments !== false,
        autoModerate: settings?.autoModerate || false,
        profanityFilter: settings?.profanityFilter !== false,
        moderationMode: settings?.moderationMode || false,
        namesVisible: false,
      },
      analytics: {
        uniqueStudents: 0,
        totalQuestions: 0,
        questionsPerStudent: 0,
      },
      endedAt: null,
    };
    await chatSessionRef(id).set(newChat);
    await chatJoinCodeRef(joinCode).set(id);

    const claim = await setSessionCurrentActivity(launchPrep.sessionId, 'anonymousChat', id);
    if (!claim.ok) {
      await chatSessionRef(id).remove();
      await chatJoinCodeRef(joinCode).remove();
      return res.status(400).json({ success: false, error: claim.error });
    }

    await appendSessionActivityHistory(launchPrep.sessionId, {
      type: 'anonymousChat',
      name: newChat.title,
      activityId: id,
    });
    return res.status(201).json({
      success: true,
      data: { ...newChat, messages: [] },
      message: 'Anonymous chat session created successfully',
    });
  } catch (error) {
    console.error('Error creating anonymous chat:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create anonymous chat session',
    });
  }
});

// Get all (if auth: only own; else all for backward compat)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const status = req.query.status;
    const headerUserId = req.headers['x-user-id'];
    const fallbackUserId =
      typeof headerUserId === 'string' && headerUserId.trim() ? headerUserId.trim() : null;
    let chats = [];
    const ownerId = req.user?.uid || fallbackUserId;
    if (ownerId) {
      try {
        const indexedSnap = await db.ref('chat_sessions').orderByChild('createdBy').equalTo(ownerId).get();
        if (indexedSnap.exists()) {
          const raw = indexedSnap.val() || {};
          chats = Object.entries(raw).map(([id, d]) => ({ id, ...(d || {}) }));
        }
      } catch (indexError) {
        console.warn('Indexed chat list failed, falling back to full scan:', indexError.message);
        const snap = await db.ref('chat_sessions').get();
        const all = snap.exists() ? snap.val() : {};
        chats = Object.entries(all || {})
          .map(([id, d]) => ({ id, ...(d || {}) }))
          .filter((c) => c.createdBy === ownerId || c.createdBy == null);
      }
    } else {
      const snap = await db.ref('chat_sessions').get();
      const all = snap.exists() ? snap.val() : {};
      chats = Object.entries(all || {}).map(([id, d]) => ({ id, ...(d || {}) }));
    }
    if (status) {
      chats = chats.filter((c) => c.status === status);
    }

    chats.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.status(200).json({ success: true, data: chats.map((c) => ({ ...c, messages: [] })) });
  } catch (error) {
    console.error('Error fetching anonymous chats:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch anonymous chat sessions' });
  }
});

// Logged-in student: Live Chat resources from chats they joined with this account
router.get('/my-resources', verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const joins = await listStudentJoins(uid);
    const groups = await Promise.all(
      joins.map(async (join) => {
        const chatId = join.chatId;
        const resources = chatId ? await listChatResourceRecords(chatId) : [];
        return {
          chatId,
          chatName: join.chatName || 'Live Chat',
          joinCode: join.joinCode || '',
          joinedAt: join.joinedAt || join.lastJoinedAt || null,
          resources,
        };
      })
    );
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    console.error('Error listing student live chat resources:', error);
    return res.status(500).json({ success: false, error: 'Failed to load live chat resources' });
  }
});

// Get by join code (NO AUTH - for students; optional token stamps account join)
router.get('/code/:joinCode', optionalAuth, async (req, res) => {
  try {
    const joinCode = req.params.joinCode.toUpperCase();
    const participantId = req.query.participantId;
    const idSnap = await chatJoinCodeRef(joinCode).get();
    if (!idSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive session code' });
    }
    const id = idSnap.val();
    const chatSnap = await chatSessionRef(id).get();
    if (!chatSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive session code' });
    }
    const chat = { id, ...(chatSnap.val() || {}) };
    if (chat.status !== 'active' || !chat.isActive) {
      return res.status(404).json({ success: false, error: 'This chat has ended or is no longer available' });
    }

    if (participantId) {
      await registerChatParticipant(id, participantId);
      await pruneStaleChatParticipants(id);
      await syncChatParticipantCount(id);
      await syncChatMessageCount(id);
      const refreshedSnap = await chatSessionRef(id).get();
      if (refreshedSnap.exists()) {
        Object.assign(chat, refreshedSnap.val() || {});
      }
    }
    if (req.user?.uid) {
      await saveStudentChatJoin(req.user.uid, chat);
    }
    // Include messages
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({ success: true, data: { ...chat, messages: msgs } });
  } catch (error) {
    console.error('Error fetching chat by code:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch chat session' });
  }
});

router.get('/:id/resources', verifyFirebaseToken, async (req, res) => {
  try {
    const chat = await loadChatOr404(req.params.id, res);
    if (!chat) return undefined;
    if (!requireChatOwner(chat, req.user.uid, res)) return undefined;
    const resources = await listChatResourceRecords(chat.id);
    return res.status(200).json({ success: true, data: resources });
  } catch (error) {
    console.error('Error listing chat resources:', error);
    return res.status(500).json({ success: false, error: 'Failed to load resources' });
  }
});

router.post('/:id/resources', verifyFirebaseToken, handleResourceUpload, async (req, res) => {
  try {
    const chat = await loadChatOr404(req.params.id, res);
    if (!chat) return undefined;
    if (!requireChatOwner(chat, req.user.uid, res)) return undefined;
    if (!chat.isActive || chat.status === 'ended') {
      return res.status(403).json({ success: false, error: 'This chat has ended' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Choose a file to upload.' });
    }
    const result = await shareFile({
      chat,
      hostUid: req.user.uid,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer,
    });
    const now = new Date().toISOString();
    await chatSessionRef(chat.id).update({ lastActivity: now, updatedAt: now });
    await syncChatMessageCount(chat.id);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error sharing chat file:', error);
    return sendResourceError(res, error, 'Failed to upload file');
  }
});

router.post('/:id/resources/link', verifyFirebaseToken, async (req, res) => {
  try {
    const chat = await loadChatOr404(req.params.id, res);
    if (!chat) return undefined;
    if (!requireChatOwner(chat, req.user.uid, res)) return undefined;
    if (!chat.isActive || chat.status === 'ended') {
      return res.status(403).json({ success: false, error: 'This chat has ended' });
    }
    const result = await shareLink({
      chat,
      hostUid: req.user.uid,
      url: req.body.url || req.body.link,
      title: req.body.title,
    });
    const now = new Date().toISOString();
    await chatSessionRef(chat.id).update({ lastActivity: now, updatedAt: now });
    await syncChatMessageCount(chat.id);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error sharing chat link:', error);
    return sendResourceError(res, error, 'Failed to share link');
  }
});

router.get('/:id/resources/:resourceId/download', verifyFirebaseToken, async (req, res) => {
  try {
    const chat = await loadChatOr404(req.params.id, res);
    if (!chat) return undefined;
    const record = await getChatResourceRecord(chat.id, req.params.resourceId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }
    if (record.type === 'link') {
      return res.status(400).json({ success: false, error: 'Links are opened in the browser, not downloaded' });
    }
    const access = await assertDownloadAccess(req.user.uid, chat, record);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }
    await streamStoredFile(res, record);
    return undefined;
  } catch (error) {
    console.error('Error downloading chat resource:', error);
    if (!res.headersSent) {
      return sendResourceError(res, error, 'Failed to download file');
    }
    return undefined;
  }
});

// Get by ID (auth optional; if auth, check ownership for private fields)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const snap = await chatSessionRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const chat = { id, ...(snap.val() || {}) };
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({ success: true, data: { ...chat, messages: msgs } });
  } catch (error) {
    console.error('Error fetching chat by ID:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch chat session' });
  }
});

// Update chat (auth required for ownership)
router.put('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const updates = { ...req.body, updatedAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
    delete updates.id;
    delete updates.createdBy;
    delete updates.createdAt;
    // Creating/activating a chat must go through /create so session.currentActivity is claimed.
    const activating =
      updates.isActive === true || String(updates.status || '').toLowerCase() === 'active';
    const wasInactive =
      existing.isActive === false || String(existing.status || '').toLowerCase() === 'ended';
    if (activating && wasInactive) {
      return res.status(400).json({
        success: false,
        error: 'Use the chat create endpoint to start a live chat. Another activity may already be active.',
      });
    }
    await ref.update(updates);

    const ending =
      updates.isActive === false || String(updates.status || '').toLowerCase() === 'ended';
    if (ending) {
      const joinCode = String(existing.joinCode || existing.sessionCode || '').trim().toUpperCase();
      if (joinCode) {
        await chatJoinCodeRef(joinCode).remove();
      }
      await clearActivityFromActiveSession('anonymousChat', id, req.user.uid);
    }

    const updated = await ref.get();
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({
      success: true,
      data: { id, ...(updated.val() || {}), messages: msgs },
      message: 'Chat session updated successfully',
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    return res.status(500).json({ success: false, error: 'Failed to update chat session' });
  }
});

// Add message (NO AUTH - for students; the chat owner may also post as the teacher)
router.post('/:id/messages', optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const chat = snap.val() || {};
    if (!chat.isActive || chat.status === 'ended') {
      return res.status(403).json({
        success: false,
        error: 'This chat has ended',
      });
    }
    // Only the authenticated owner may post as the teacher; the moderation gate applies to students.
    const isOwner = Boolean(
      req.user?.uid && (chat.createdBy == null || chat.createdBy === req.user.uid)
    );
    const isTeacherMessage = req.body.asTeacher === true;
    if (isTeacherMessage && !isOwner) {
      return res.status(401).json({
        success: false,
        error: 'Sign in as the chat owner to post as the host',
      });
    }
    if (!isTeacherMessage && !chat.settings?.moderationMode) {
      return res.status(403).json({
        success: false,
        error: 'Chat is not currently accepting messages',
      });
    }
    const participantId = isTeacherMessage ? null : req.body.participantId || req.body.sender;
    if (String(req.body.type || '') === 'resource') {
      return res.status(400).json({
        success: false,
        error: 'Resources can only be shared by the host from the attach menu',
      });
    }
    if (participantId) {
      await registerChatParticipant(id, participantId);
    }
    const namesVisible = Boolean(chat.namesVisible || chat.settings?.namesVisible);
    const requestedName = String(req.body.senderName || '').trim().slice(0, 80);
    const showName = Boolean(!isTeacherMessage && namesVisible && requestedName);
    const msgId = generateId('msg');
    const newMessage = {
      id: msgId,
      sender: isTeacherMessage ? 'Teacher' : req.body.sender || 'Anonymous Student',
      message: String(req.body.message || '').trim(),
      timestamp: new Date().toISOString(),
      isTeacher: isTeacherMessage,
      isAnswered: false,
      isHidden: false,
      showName,
      ...(showName ? { senderName: requestedName } : {}),
      ...(isTeacherMessage
        ? {}
        : { participantId: req.body.participantId || req.body.sender || null }),
    };
    const now = new Date().toISOString();
    const analytics = chat.analytics || { uniqueStudents: 0, totalQuestions: 0, questionsPerStudent: 0 };
    await chatMessagesRef(id).child(msgId).set(newMessage);
    await pruneStaleChatParticipants(id);
    await syncChatParticipantCount(id);
    await syncChatMessageCount(id);
    await ref.update({
      lastActivity: now,
      updatedAt: now,
      analytics: isTeacherMessage
        ? analytics
        : {
            ...analytics,
            totalQuestions: (analytics.totalQuestions || 0) + 1,
          },
    });
    return res.status(201).json({ success: true, data: newMessage, message: 'Message added successfully' });
  } catch (error) {
    console.error('Error adding message:', error);
    return res.status(500).json({ success: false, error: 'Failed to add message' });
  }
});

// Sync message/participant counts (teacher)
router.post('/:id/sync-stats', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const snap = await chatSessionRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await pruneStaleChatParticipants(id);
    const participants = await syncChatParticipantCount(id);
    const messageCount = await syncChatMessageCount(id);

    return res.status(200).json({
      success: true,
      data: { participants, messageCount },
    });
  } catch (error) {
    console.error('Error syncing chat stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to sync chat stats' });
  }
});

// Student presence heartbeat (optional token stamps account join for Resources)
router.post('/:id/presence', optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const participantId = req.body.participantId;
    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }

    const snap = await chatSessionRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    const chat = snap.val() || {};
    if (!chat.isActive || chat.status === 'ended') {
      return res.status(403).json({ success: false, error: 'This chat has ended' });
    }

    await registerChatParticipant(id, participantId);
    await pruneStaleChatParticipants(id);
    const participants = await syncChatParticipantCount(id);
    if (req.user?.uid) {
      await saveStudentChatJoin(req.user.uid, { id, ...chat });
    }

    return res.status(200).json({
      success: true,
      data: { participants },
    });
  } catch (error) {
    console.error('Error updating chat presence:', error);
    return res.status(500).json({ success: false, error: 'Failed to update chat presence' });
  }
});

// Student leave chat (NO AUTH)
router.post('/:id/leave', async (req, res) => {
  try {
    const id = req.params.id;
    const participantId = req.body.participantId;
    if (!participantId) {
      return res.status(400).json({ success: false, error: 'participantId is required' });
    }

    const snap = await chatSessionRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    const key = sanitizeParticipantKey(participantId);
    await chatParticipantsRef(id).child(key).remove();
    const participants = await syncChatParticipantCount(id);

    return res.status(200).json({
      success: true,
      data: { participants },
    });
  } catch (error) {
    console.error('Error leaving chat:', error);
    return res.status(500).json({ success: false, error: 'Failed to leave chat' });
  }
});

// Toggle moderation (teacher)
router.put('/:id/toggle-moderation', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const moderationMode = !!req.body.moderationMode;
    const now = new Date().toISOString();
    await ref.update({
      moderationMode,
      isActive: true,
      settings: { ...(existing.settings || {}), moderationMode },
      lastActivity: now,
      updatedAt: now,
    });
    const updated = await ref.get();
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({
      success: true,
      data: { id, ...(updated.val() || {}), messages: msgs },
      message: `Moderation mode ${moderationMode ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('Error toggling moderation:', error);
    return res.status(500).json({ success: false, error: 'Failed to toggle moderation mode' });
  }
});

// Toggle whether new student messages store a display name (teacher)
router.put('/:id/toggle-names', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const namesVisible = !!req.body.namesVisible;
    const now = new Date().toISOString();
    await ref.update({
      namesVisible,
      settings: { ...(existing.settings || {}), namesVisible },
      lastActivity: now,
      updatedAt: now,
    });
    const updated = await ref.get();
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({
      success: true,
      data: { id, ...(updated.val() || {}), messages: msgs },
      message: `Names ${namesVisible ? 'visible' : 'hidden'} on new messages`,
    });
  } catch (error) {
    console.error('Error toggling names visibility:', error);
    return res.status(500).json({ success: false, error: 'Failed to toggle names visibility' });
  }
});

// End chat
router.put('/:id/end', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const now = new Date().toISOString();
    await ref.update({
      status: 'ended',
      isActive: false,
      endedAt: now,
      lastActivity: now,
      updatedAt: now,
    });
    const joinCode = String(existing.joinCode || existing.sessionCode || '').trim().toUpperCase();
    if (joinCode) {
      await chatJoinCodeRef(joinCode).remove();
    }
    await clearActivityFromActiveSession('anonymousChat', id, req.user.uid);
    const updated = await ref.get();
    const msgsSnap = await chatMessagesRef(id).get();
    const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val() || {}) : [];
    msgs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return res.status(200).json({
      success: true,
      data: { id, ...(updated.val() || {}), messages: msgs },
      message: 'Chat session ended successfully',
    });
  } catch (error) {
    console.error('Error ending chat:', error);
    return res.status(500).json({ success: false, error: 'Failed to end chat session' });
  }
});

// Delete chat
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = chatSessionRef(id);
    const snap = await ref.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    const existing = snap.val() || {};
    if (existing.createdBy && existing.createdBy !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    // delete session + messages + participants + join code mapping
    const joinCode = existing.joinCode ? String(existing.joinCode).toUpperCase() : null;
    const updates = {
      [`chat_sessions/${id}`]: null,
      [`chat_messages/${id}`]: null,
      [`chat_participants/${id}`]: null,
    };
    if (joinCode) updates[`chat_join_codes/${joinCode}`] = null;
    await db.ref().update(updates);
    await deleteChatResourceData(id);
    await clearActivityFromActiveSession('anonymousChat', id, req.user.uid);
    return res.status(200).json({ success: true, message: 'Chat session deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete chat session' });
  }
});

module.exports = router;
