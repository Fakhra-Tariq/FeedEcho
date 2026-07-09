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

// Check if Firebase credentials are properly configured (env-based fallback)
const hasValidCredentials =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PROJECT_ID !== 'your-project-id' &&
  process.env.FIREBASE_PRIVATE_KEY &&
  process.env.FIREBASE_PRIVATE_KEY !== '"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"' &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_CLIENT_EMAIL !== 'firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com';

let db, auth;

if (hasServiceAccountFile || hasValidCredentials) {
  try {
    const serviceAccount = hasServiceAccountFile
      ? JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      : {
          type: 'service_account',
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: process.env.FIREBASE_AUTH_URI,
          token_uri: process.env.FIREBASE_TOKEN_URI,
          auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
          client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
          universe_domain: 'googleapis.com'
        };

    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      // Initialize with service account credentials
      const config = {
        credential: admin.credential.cert(serviceAccount)
      };
      
      // Realtime Database requires databaseURL
      let databaseURL = process.env.FIREBASE_DATABASE_URL;
      
      // Try to extract databaseURL from service account if not in env
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
