const test = require('node:test');
const assert = require('node:assert/strict');
const {
  guestAttemptSlotId,
  matchesGuestDeviceName,
  normalizeGuestName,
} = require('./guestAttemptIdentity');

test('normalizeGuestName folds case, trim, spaces, unicode, zero-width', () => {
  assert.equal(normalizeGuestName('Ali'), 'ali');
  assert.equal(normalizeGuestName('ALI'), 'ali');
  assert.equal(normalizeGuestName(' Ali '), 'ali');
  assert.equal(normalizeGuestName('Ali  '), 'ali');
  assert.equal(normalizeGuestName('  ALI '), 'ali');
  assert.equal(normalizeGuestName('Ali\u200B'), 'ali');
  assert.notEqual(normalizeGuestName('A li'), 'ali');
  assert.equal(normalizeGuestName('علی'), normalizeGuestName('  علی  '));
});

test('slot id is deterministic', () => {
  const a = guestAttemptSlotId('quiz1:launch1', 'dev-1', 'ali');
  const b = guestAttemptSlotId('quiz1:launch1', 'dev-1', 'ali');
  const c = guestAttemptSlotId('quiz1:launch1', 'dev-1', 'sara');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('guest match requires device+name or legacy id, never name-only', () => {
  const row = { participantId: 'old1', name: 'Ali', deviceId: 'dev-1' };
  assert.equal(
    matchesGuestDeviceName(row, { deviceId: 'dev-1', normalizedName: 'ali', legacyParticipantIds: [] }),
    true
  );
  assert.equal(
    matchesGuestDeviceName(row, { deviceId: 'dev-2', normalizedName: 'ali', legacyParticipantIds: [] }),
    false
  );
  assert.equal(
    matchesGuestDeviceName(
      { participantId: 'old1', name: 'Ali' },
      { deviceId: 'dev-9', normalizedName: 'ali', legacyParticipantIds: ['old1'] }
    ),
    true
  );
  assert.equal(
    matchesGuestDeviceName(
      { participantId: 'other', name: 'Ali' },
      { deviceId: 'dev-9', normalizedName: 'ali', legacyParticipantIds: [] }
    ),
    false
  );
});
