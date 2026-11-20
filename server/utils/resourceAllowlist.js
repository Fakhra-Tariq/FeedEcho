/**
 * Shared allow-list for Live Chat (and UI) file sharing.
 * Keep Web/client/src/constants/resourceAllowlist.js in sync with this file.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_LABEL = '5 MB';

const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
];

const EXT_TO_MIME = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  txt: ['text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const OFFICE_ZIP_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx']);
const OFFICE_OLE_EXTENSIONS = new Set(['doc', 'ppt', 'xls']);

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function extensionOf(fileName) {
  const base = String(fileName || '').split(/[/\\]/).pop() || '';
  const parts = base.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.pop();
}

function sanitizeDisplayName(fileName) {
  const raw = String(fileName || 'file').split(/[/\\]/).pop() || 'file';
  const cleaned = raw.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'file';
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  if (sample.includes(0)) return false;
  const start = sample.toString('utf8').trimStart().slice(0, 64).toLowerCase();
  if (start.startsWith('<!doctype html') || start.startsWith('<html') || start.startsWith('<svg')) {
    return false;
  }
  return true;
}

function hasZipMagic(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function hasJpegMagic(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function hasPngMagic(buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function hasPdfMagic(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

function hasWebpMagic(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

function hasOleMagic(buffer) {
  return buffer.length >= OLE_MAGIC.length && buffer.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC);
}

function validateFileBuffer({ originalName, mimeType, size, buffer }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'The file is empty.' };
  }
  if (typeof size === 'number' && size > MAX_FILE_BYTES) {
    return { ok: false, error: `File is too large. Maximum size is ${MAX_FILE_LABEL}.` };
  }
  if (buffer.length > MAX_FILE_BYTES) {
    return { ok: false, error: `File is too large. Maximum size is ${MAX_FILE_LABEL}.` };
  }

  const ext = extensionOf(originalName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error: `That file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    };
  }

  const allowedMimes = EXT_TO_MIME[ext] || [];
  const reportedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (reportedMime && !allowedMimes.includes(reportedMime) && reportedMime !== 'application/octet-stream') {
    return { ok: false, error: 'File type does not match the allowed list.' };
  }

  let signatureOk = false;
  if (ext === 'pdf') signatureOk = hasPdfMagic(buffer);
  else if (ext === 'png') signatureOk = hasPngMagic(buffer);
  else if (ext === 'jpg' || ext === 'jpeg') signatureOk = hasJpegMagic(buffer);
  else if (ext === 'webp') signatureOk = hasWebpMagic(buffer);
  else if (OFFICE_ZIP_EXTENSIONS.has(ext)) signatureOk = hasZipMagic(buffer);
  else if (OFFICE_OLE_EXTENSIONS.has(ext)) signatureOk = hasOleMagic(buffer);
  else if (ext === 'txt') signatureOk = looksLikeText(buffer);

  if (!signatureOk) {
    return {
      ok: false,
      error: 'The file contents do not match its type. The upload was rejected.',
    };
  }

  const kind = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'file';
  return {
    ok: true,
    ext,
    kind,
    mimeType: allowedMimes[0] || 'application/octet-stream',
    displayName: sanitizeDisplayName(originalName),
  };
}

function parseSafeHttpUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a link.' };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That is not a valid link.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https links are allowed.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'That link is not allowed.' };
  }
  const host = String(parsed.hostname || '').replace(/^www\./i, '');
  if (!host) {
    return { ok: false, error: 'That link is not allowed.' };
  }
  return { ok: true, href: parsed.toString(), domain: host };
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  ALLOWED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  extensionOf,
  sanitizeDisplayName,
  validateFileBuffer,
  parseSafeHttpUrl,
};
