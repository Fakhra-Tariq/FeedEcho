const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const path = require('path');

const defaultServiceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const defaultServiceAccountPathDoubleExt = path.join(__dirname, '..', 'serviceAccountKey.json.json');

const envServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const resolvedServiceAccountPath = envServiceAccountPath
  ? envServiceAccountPath
  : fs.existsSync(defaultServiceAccountPath)
    ? defaultServiceAccountPath
    : defaultServiceAccountPathDoubleExt;

const serviceAccountPath = resolvedServiceAccountPath;
const hasServiceAccountFile = fs.existsSync(serviceAccountPath);

/** Normalize private key from Render/env (handles \\n, quotes, and real line breaks). */
const normalizePrivateKey = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') return '';

  let key = rawKey.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // JSON-style escaped newlines from Render / .env
  key = key.replace(/\\n/g, '\n');

  return key;
};

const logPrivateKeyDiagnostics = (key, source) => {
  const hasBegin = key.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = key.includes('-----END PRIVATE KEY-----');
  const lineCount = key.split('\n').length;
  console.log(
    `[firebase] ${source} private key check: begin=${hasBegin} end=${hasEnd} lines=${lineCount} length=${key.length}`
  );
  if (!hasBegin || !hasEnd || lineCount < 3) {
    console.error(
      '[firebase] Private key format looks wrong. Regenerate the service account JSON and paste private_key with \\n (Option A) into FIREBASE_PRIVATE_KEY on Render.'
    );
  }
};

const verifyFirebaseCredential = async (credential) => {
  try {
    await credential.getAccessToken();
    console.log('[firebase] OAuth access token acquired — credentials are valid');
  } catch (error) {
    console.error('[firebase] Credential verification failed:', error.message);
    console.error(
      '[firebase] Fix: set FIREBASE_SERVICE_ACCOUNT_JSON on Render (full JSON, one line) or regenerate the service account key and update env vars, then redeploy.'
    );
  }
};

const normalizeServiceAccount = (account, source) => {
  if (!account || typeof account !== 'object') {
    throw new Error(`Invalid service account from ${source}`);
  }
  const privateKey = normalizePrivateKey(account.private_key || account.privateKey || '');
  logPrivateKeyDiagnostics(privateKey, source);
  return {
    ...account,
    private_key: privateKey,
  };
};

/** Prefer full JSON on Render — avoids broken FIREBASE_PRIVATE_KEY pasting. */
const parseServiceAccountFromEnv = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && String(rawJson).trim()) {
    const parsed = JSON.parse(String(rawJson).trim());
    return normalizeServiceAccount(parsed, 'FIREBASE_SERVICE_ACCOUNT_JSON');
  }

  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawBase64 && String(rawBase64).trim()) {
    const decoded = Buffer.from(String(rawBase64).trim(), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return normalizeServiceAccount(parsed, 'FIREBASE_SERVICE_ACCOUNT_BASE64');
  }

  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  logPrivateKeyDiagnostics(privateKey, 'env');
  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: 'googleapis.com',
  };
};

const hasJsonCredentials =
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) ||
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim());

// Check if Firebase credentials are properly configured (env-based fallback)
const hasValidCredentials =
  hasJsonCredentials ||
  (process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PROJECT_ID !== 'your-project-id' &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_PRIVATE_KEY !== '"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"' &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_CLIENT_EMAIL !== 'firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com');

let db, auth;

if (hasServiceAccountFile || hasValidCredentials) {
  try {
    const serviceAccount = hasServiceAccountFile
      ? normalizeServiceAccount(
          JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')),
          'service account file'
        )
      : parseServiceAccountFromEnv();

    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      const credential = admin.credential.cert(serviceAccount);
      // Initialize with service account credentials
      const config = {
        credential,
      };
      
      // Realtime Database requires databaseURL
      let databaseURL = process.env.FIREBASE_DATABASE_URL;

      if (!databaseURL && serviceAccount.project_id) {
        databaseURL = `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`;
        console.log('🔑 Using database URL from service account project_id:', databaseURL);
      }
      
      // Try to extract databaseURL from service account file if still missing
      if (!databaseURL && hasServiceAccountFile) {
        try {
          const serviceAccountData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
          if (serviceAccountData.project_id) {
            databaseURL = `https://${serviceAccountData.project_id}-default-rtdb.firebaseio.com`;
            console.log('🔑 Extracted database URL from service account:', databaseURL);
          }
        } catch (e) {
          console.log('⚠️ Could not extract database URL from service account');
        }
      }
      
      if (!databaseURL) {
        throw new Error('Missing FIREBASE_DATABASE_URL (Realtime Database URL) in environment');
      }
      config.databaseURL = databaseURL;
      
      admin.initializeApp(config);
      if (!hasServiceAccountFile) {
        void verifyFirebaseCredential(credential);
      }
    }

    db = getDatabase(); // Realtime Database
    auth = admin.auth();
    console.log(
      `✅ Firebase Admin SDK initialized successfully (${hasServiceAccountFile ? 'service account file' : 'env credentials'})`
    );
    console.log(`🔐 Firebase Auth: Ready`);
    console.log(`💾 Realtime Database: Ready`);
    console.log(`💾 Realtime Database URL: ${admin.app().options.databaseURL}`);
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
    // Fall back to mock implementations
    setupMockImplementations();
  }
} else {
  console.log('⚠️  Firebase credentials not configured. Using mock data for development.');
  console.log(
    'Please add a Firebase service account key JSON at server/serviceAccountKey.json (recommended) or set FIREBASE_* env vars.'
  );
  setupMockImplementations();
}

function setupMockImplementations() {
  // Mock implementations for development
  // Minimal RTDB-like mock used by routes in dev
  db = {
    ref: () => ({
      get: async () => ({ exists: () => false, val: () => null }),
      set: async () => undefined,
      update: async () => undefined,
      remove: async () => undefined,
      push: () => ({ key: 'mock-id' }),
      child: () => this
    })
  };
  
  auth = {
    verifyIdToken: async () => ({ uid: 'mock-user-id', email: 'mock@example.com' }),
    createUser: async () => ({ uid: 'mock-user-id' }),
    deleteUser: async () => ({})
  };
}

module.exports = { db, auth, admin };
