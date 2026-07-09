/**
 * End a session by join code in Firebase.
 * Usage (from server/): node -r dotenv/config scripts/endSessionByCode.js 4PMFHX dotenv_config_path=../.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { db } = require('../config/firebase');

const code = String(process.argv[2] || '').trim().toUpperCase();

if (!code) {
  console.error('Usage: node scripts/endSessionByCode.js <SESSION_CODE>');
  process.exit(1);
}

(async () => {
  let sessionId = null;

  const codeSnap = await db.ref(`session_codes/${code}`).get();
  if (codeSnap.exists()) {
    sessionId = codeSnap.val();
  }

  if (!sessionId) {
    const all = await db.ref('sessions').get();
    if (all.exists()) {
      for (const [id, val] of Object.entries(all.val() || {})) {
        if (val && String(val.sessionCode || '').toUpperCase() === code) {
          sessionId = val.id || id;
          break;
        }
      }
    }
  }

  if (!sessionId) {
    console.error('Session not found for code:', code);
    process.exit(1);
  }

  const snap = await db.ref(`sessions/${sessionId}`).get();
  if (!snap.exists()) {
    console.error('Session record missing:', sessionId);
    process.exit(1);
  }

  const before = snap.val();
  console.log('Found:', before.sessionName, '| status:', before.status, '| id:', sessionId);

  const now = new Date().toISOString();
  await db.ref(`sessions/${sessionId}`).update({
    status: 'ended',
    currentActivity: null,
    endedAt: before.endedAt || now,
    updatedAt: now,
  });
  await db.ref(`session_codes/${code}`).remove();

  const after = await db.ref(`sessions/${sessionId}`).get();
  console.log('Updated to status:', after.val()?.status);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
