const crypto = require('crypto');
const { db } = require('../config/firebase');
const {
  MAX_FILE_BYTES,
  sanitizeDisplayName,
  validateFileBuffer,
  parseSafeHttpUrl,
} = require('./resourceAllowlist');

const SOURCE_LIVE_CHAT = 'liveChat';
const SOURCE_SPACE_RACE = 'spaceRace';

const archiveRoot = (chatId) => `space_race_shared_resources/liveChat_${chatId}`;
const fileRoot = (chatId) => `live_chat_resource_files/${chatId}`;
const joinRoot = (uid) => `live_chat_student_joins/${uid}`;
const joinPath = (uid, chatId) => `${joinRoot(uid)}/${chatId}`;

function randomId(prefix = 'res') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function asciiFileName(name) {
  const cleaned = sanitizeDisplayName(name).replace(/[^\w.\- ]+/g, '_');
  return cleaned || 'download';
}

function contentDisposition(fileName) {
  const ascii = asciiFileName(fileName);
  const encoded = encodeURIComponent(sanitizeDisplayName(fileName));
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function withSource(record) {
  if (!record || typeof record !== 'object') return record;
  const source = record.source === SOURCE_LIVE_CHAT ? SOURCE_LIVE_CHAT : SOURCE_SPACE_RACE;
  return { ...record, source };
}

async function saveStudentChatJoin(uid, chat) {
  if (!uid || !chat?.id) return;
  const path = joinPath(uid, chat.id);
  const snap = await db.ref(path).get();
  const existing = snap.exists() ? snap.val() || {} : {};
  const now = new Date().toISOString();
  await db.ref(path).update({
    chatId: chat.id,
    chatName: chat.title || existing.chatName || 'Live Chat',
    joinCode: chat.joinCode || existing.joinCode || '',
    joinedAt: existing.joinedAt || now,
    lastJoinedAt: now,
  });
}

async function listStudentJoins(uid) {
  if (!uid) return [];
  const snap = await db.ref(joinRoot(uid)).get();
  if (!snap.exists()) return [];
  return Object.values(snap.val() || {});
}

async function listChatResourceRecords(chatId) {
  const snap = await db.ref(archiveRoot(chatId)).get();
  if (!snap.exists()) return [];
  const rows = Object.values(snap.val() || {}).map(withSource);
  rows.sort((a, b) => String(b.sharedAt || '').localeCompare(String(a.sharedAt || '')));
  return rows;
}

async function getChatResourceRecord(chatId, resourceId) {
  const snap = await db.ref(`${archiveRoot(chatId)}/${resourceId}`).get();
  if (!snap.exists()) return null;
  return withSource({ id: resourceId, ...(snap.val() || {}) });
}

function isChatHost(chat, uid) {
  return Boolean(uid && chat?.createdBy && chat.createdBy === uid);
}

async function assertDownloadAccess(uid, chat, record) {
  if (!uid) {
    return { ok: false, status: 401, error: 'Log in to download' };
  }
  if (!chat || !record) {
    return { ok: false, status: 404, error: 'Resource not found' };
  }
  if (isChatHost(chat, uid)) {
    return { ok: true, role: 'host' };
  }
  const joinSnap = await db.ref(joinPath(uid, chat.id)).get();
  if (joinSnap.exists()) {
    return { ok: true, role: 'student' };
  }
  return { ok: false, status: 403, error: 'You do not have access to this file' };
}

function fallbackText({ kind, fileName, domain }) {
  if (kind === 'link') {
    return `Shared a link: ${domain || 'link'}`;
  }
  return `Shared a file: ${fileName || 'file'}`;
}

async function writeResourceMessage(chatId, hostUid, payload) {
  const msgId = `msg-${crypto.randomBytes(6).toString('hex')}-${Date.now()}`;
  const message = {
    id: msgId,
    sender: 'Teacher',
    message: payload.fallbackText,
    timestamp: new Date().toISOString(),
    isTeacher: true,
    isAnswered: false,
    isHidden: false,
    showName: true,
    senderName: 'Host',
    type: 'resource',
    resourceId: payload.resourceId,
    resourceKind: payload.kind,
    fileName: payload.fileName || null,
    fileSize: payload.fileSize || null,
    mimeType: payload.mimeType || null,
    linkUrl: payload.linkUrl || null,
    linkTitle: payload.linkTitle || null,
    linkDomain: payload.linkDomain || null,
  };
  await db.ref(`chat_messages/${chatId}/${msgId}`).set(message);
  return message;
}

async function saveArchiveRecord(chat, record) {
  await db.ref(`${archiveRoot(chat.id)}/${record.id}`).set(record);
  return record;
}

async function shareFile({ chat, hostUid, originalName, mimeType, size, buffer }) {
  const check = validateFileBuffer({ originalName, mimeType, size, buffer });
  if (!check.ok) {
    const err = new Error(check.error);
    err.status = 400;
    throw err;
  }

  const resourceId = randomId('lcr');
  const now = new Date().toISOString();
  const kind = check.kind;
  const fallback = fallbackText({ kind, fileName: check.displayName });

  try {
    await db.ref(`${fileRoot(chat.id)}/${resourceId}`).set({
      data: buffer.toString('base64'),
      mimeType: check.mimeType,
      size: buffer.length,
    });
  } catch (error) {
    console.error('Live chat file write failed:', error.message);
    const err = new Error('Could not store the file.');
    err.status = 500;
    throw err;
  }

  const record = {
    id: resourceId,
    source: SOURCE_LIVE_CHAT,
    raceId: `liveChat_${chat.id}`,
    chatId: chat.id,
    chatName: chat.title || 'Live Chat',
    sessionDate: now,
    sharedAt: now,
    teamId: null,
    participantId: hostUid,
    senderName: 'Host',
    type: kind,
    url: '',
    fileName: check.displayName,
    linkTitle: null,
    text: fallback,
    mimeType: check.mimeType,
    size: buffer.length,
    hostUid,
    createdBy: hostUid,
  };

  try {
    const message = await writeResourceMessage(chat.id, hostUid, {
      resourceId,
      kind,
      fileName: check.displayName,
      fileSize: buffer.length,
      mimeType: check.mimeType,
      fallbackText: fallback,
    });
    record.chatMessageId = message.id;
    await saveArchiveRecord(chat, record);
    return { record: withSource(record), message };
  } catch (error) {
    await db.ref(`${fileRoot(chat.id)}/${resourceId}`).remove().catch(() => undefined);
    throw error;
  }
}

async function shareLink({ chat, hostUid, url, title }) {
  const parsed = parseSafeHttpUrl(url);
  if (!parsed.ok) {
    const err = new Error(parsed.error);
    err.status = 400;
    throw err;
  }
  const linkTitle = String(title || '').trim().slice(0, 120);
  const resourceId = randomId('lcl');
  const now = new Date().toISOString();
  const fallback = fallbackText({ kind: 'link', domain: parsed.domain });
  const record = {
    id: resourceId,
    source: SOURCE_LIVE_CHAT,
    raceId: `liveChat_${chat.id}`,
    chatId: chat.id,
    chatName: chat.title || 'Live Chat',
    sessionDate: now,
    sharedAt: now,
    teamId: null,
    participantId: hostUid,
    senderName: 'Host',
    type: 'link',
    url: parsed.href,
    fileName: linkTitle || parsed.domain,
    linkTitle: linkTitle || parsed.domain,
    text: fallback,
    mimeType: null,
    size: null,
    hostUid,
    createdBy: hostUid,
    linkDomain: parsed.domain,
  };
  const message = await writeResourceMessage(chat.id, hostUid, {
    resourceId,
    kind: 'link',
    fileName: record.fileName,
    linkUrl: parsed.href,
    linkTitle: record.linkTitle,
    linkDomain: parsed.domain,
    fallbackText: fallback,
  });
  record.chatMessageId = message.id;
  await saveArchiveRecord(chat, record);
  return { record: withSource(record), message };
}

async function streamStoredFile(res, record) {
  const snap = await db.ref(`${fileRoot(record.chatId)}/${record.id}`).get();
  if (!snap.exists()) {
    const err = new Error(
      record.storagePath
        ? 'This file was stored in Firebase Storage and is no longer available.'
        : 'File is no longer available'
    );
    err.status = 404;
    throw err;
  }
  const stored = snap.val() || {};
  const raw = String(stored.data || '');
  const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) {
    const err = new Error('File is no longer available');
    err.status = 404;
    throw err;
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition(record.fileName || 'download'));
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}

async function deleteChatResourceData(chatId) {
  if (!chatId) return;
  await db.ref().update({
    [fileRoot(chatId)]: null,
    [archiveRoot(chatId)]: null,
  });
}

module.exports = {
  SOURCE_LIVE_CHAT,
  SOURCE_SPACE_RACE,
  MAX_FILE_BYTES,
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
  withSource,
};
