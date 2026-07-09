import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = getFirestore();

// Generate random 6-character alphanumeric join code
export function generateJoinCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Firestore helper functions
export const firestoreHelpers = {
  // Get documents with optional filtering
  async getCollection(collection: string, whereClause?: any) {
    let query = db.collection(collection);
    
    if (whereClause) {
      Object.entries(whereClause).forEach(([field, op]) => {
        if (typeof op === 'object' && op.where && op.value) {
          query = query.where(op.where, op.operator, op.value);
        }
      });
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Get single document
  async getDocument(collection: string, docId: string) {
    const doc = await db.collection(collection).doc(docId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  // Create document
  async createDocument(collection: string, data: any) {
    const docRef = await db.collection(collection).add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: docRef.id, ...data };
  },

  // Update document
  async updateDocument(collection: string, docId: string, data: any) {
    await db.collection(collection).doc(docId).update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: docId, ...data };
  },

  // Delete document
  async deleteDocument(collection: string, docId: string) {
    await db.collection(collection).doc(docId).delete();
  },

  // Increment field
  async incrementField(collection: string, docId: string, field: string, value: number = 1) {
    await db.collection(collection).doc(docId).update({
      [field]: admin.firestore.FieldValue.increment(value),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  // Get counts by status
  async getCountsByStatus(collection: string) {
    const snapshot = await db.collection(collection).get();
    const counts = { draft: 0, active: 0, ended: 0, archived: 0 };
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      if (counts.hasOwnProperty(status)) {
        counts[status as keyof typeof counts]++;
      }
    });
    
    return counts;
  }
};
