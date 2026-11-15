const crypto = require('crypto');

const GUEST_ALREADY_ATTEMPTED_MESSAGE =
  'This name has already been used on this device for this activity.';

const GUEST_ALREADY_ATTEMPTED_BODY = {
  success: false,
  code: 'ALREADY_ATTEMPTED',
  error: GUEST_ALREADY_ATTEMPTED_MESSAGE,
  message: GUEST_ALREADY_ATTEMPTED_MESSAGE,
};

/** Zero-width + C0/C1 controls (not including whitespace, which is collapsed separately). */
const ZERO_WIDTH_AND_CONTROLS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/**
 * Same algorithm as client `guestAttemptIdentity.js`.
 * Display names must keep the original typing; only this value is compared.
 */
function normalizeGuestName(name) {
  let s = String(name ?? '');
  try {
    s = s.normalize('NFKC');
  } catch {
    // ignore
  }
  s = s.replace(ZERO_WIDTH_AND_CONTROLS, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLocaleLowerCase();
  return s;
}

function sanitizePathSegment(value) {
  return String(value || '_')
    .replace(/[.#$\[\]]/g, '_')
    .slice(0, 200) || '_';
}

function guestAttemptSlotId(activitySessionId, deviceId, normalizedName) {
  return crypto
    .createHash('sha256')
    .update(`${String(activitySessionId)}|${String(deviceId)}|${String(normalizedName)}`)
    .digest('hex')
    .slice(0, 32);
}

function parseLegacyParticipantIds(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
}

function rowGuestName(row) {
  return normalizeGuestName(row?.studentName || row?.name || '');
}

/**
 * Guest match: same deviceId + normalized name, or a legacy participant id
 * for this activity (old push-key ids) with the same normalized name.
 * Never matches name-only (that would block another device).
 */
function matchesGuestDeviceName(row, { deviceId, normalizedName, legacyParticipantIds } = {}) {
  if (!row || typeof row !== 'object') return false;
  const rowName = rowGuestName(row);
  const wantName = String(normalizedName || '');
  if (!wantName || (rowName && rowName !== wantName)) return false;

  if (deviceId && row.deviceId && String(row.deviceId) === String(deviceId) && rowName === wantName) {
    return true;
  }

  const pid = String(row.participantId || row.id || '');
  const legacy = parseLegacyParticipantIds(legacyParticipantIds);
  if (pid && legacy.includes(pid) && (!rowName || rowName === wantName)) {
    return true;
  }
  return false;
}

function isLoggedInStudentUid(studentUid) {
  return Boolean(studentUid && String(studentUid).trim());
}

module.exports = {
  GUEST_ALREADY_ATTEMPTED_BODY,
  GUEST_ALREADY_ATTEMPTED_MESSAGE,
  guestAttemptSlotId,
  isLoggedInStudentUid,
  matchesGuestDeviceName,
  normalizeGuestName,
  parseLegacyParticipantIds,
  sanitizePathSegment,
};
