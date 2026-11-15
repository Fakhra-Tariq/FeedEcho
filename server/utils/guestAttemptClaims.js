const { db } = require('../config/firebase');
const {
  guestAttemptSlotId,
  matchesGuestDeviceName,
  normalizeGuestName,
  parseLegacyParticipantIds,
  sanitizePathSegment,
} = require('./guestAttemptIdentity');

function claimRef(kind, activitySessionId, slotId) {
  return db.ref(
    `guest_attempt_claims/${sanitizePathSegment(kind)}/${sanitizePathSegment(activitySessionId)}/${slotId}`
  );
}

function asRowList(val) {
  if (!val || typeof val !== 'object') return [];
  return Object.entries(val)
    .map(([key, row]) => {
      if (!row || typeof row !== 'object') return null;
      return { ...row, participantId: row.participantId || row.id || key, id: row.id || key };
    })
    .filter(Boolean);
}

function findMatchingGuestRow(rows, identity) {
  return (rows || []).find((row) => matchesGuestDeviceName(row, identity)) || null;
}

function isCompletedGuestRow(row) {
  if (!row) return false;
  if (row.status === 'completed') return true;
  if (row.submittedAt) return true;
  if (row.completedAt) return true;
  return false;
}

/**
 * Atomically claim (activitySessionId, deviceId, normalizedName).
 * Two tabs / two taps share one slot document.
 */
async function claimGuestAttempt({
  kind,
  activitySessionId,
  deviceId,
  name,
  legacyParticipantIds,
  existingRows = [],
}) {
  const normalizedName = normalizeGuestName(name);
  const device = String(deviceId || '').trim();
  if (!device || !normalizedName || !activitySessionId) {
    return { ok: false, reason: 'missing-identity' };
  }

  const identity = {
    deviceId: device,
    normalizedName,
    legacyParticipantIds: parseLegacyParticipantIds(legacyParticipantIds),
  };

  const existing = findMatchingGuestRow(existingRows, identity);
  const slotId = guestAttemptSlotId(activitySessionId, device, normalizedName);
  const ref = claimRef(kind, activitySessionId, slotId);

  const mintedParticipantId =
    (existing && (existing.participantId || existing.id)) || `g_${slotId}`;

  const txn = await ref.transaction((current) => {
    if (current && typeof current === 'object') return current;
    return {
      participantId: mintedParticipantId,
      deviceId: device,
      normalizedName,
      status: existing && isCompletedGuestRow(existing) ? 'completed' : 'started',
      createdAt: Date.now(),
    };
  });

  const claim = txn.snapshot.exists() ? txn.snapshot.val() : null;
  if (!claim) {
    return { ok: false, reason: 'claim-failed' };
  }

  if (claim.status === 'completed' || (existing && isCompletedGuestRow(existing))) {
    if (claim.status !== 'completed') {
      await ref.update({ status: 'completed' });
    }
    return {
      ok: false,
      reason: 'already-attempted',
      participantId: claim.participantId,
      claim,
      existing,
    };
  }

  const createdNew = !existing && String(claim.participantId) === String(mintedParticipantId);
  return {
    ok: true,
    resume: Boolean(existing) || !createdNew,
    participantId: claim.participantId,
    deviceId: device,
    normalizedName,
    claim,
    existing,
  };
}

async function markGuestAttemptCompleted({ kind, activitySessionId, deviceId, name }) {
  const normalizedName = normalizeGuestName(name);
  const device = String(deviceId || '').trim();
  if (!device || !normalizedName || !activitySessionId) return;
  const slotId = guestAttemptSlotId(activitySessionId, device, normalizedName);
  await claimRef(kind, activitySessionId, slotId).update({
    status: 'completed',
    completedAt: Date.now(),
  });
}

module.exports = {
  asRowList,
  claimGuestAttempt,
  findMatchingGuestRow,
  isCompletedGuestRow,
  markGuestAttemptCompleted,
};
