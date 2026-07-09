# Backend Setup Guide - Quiz, Exit Tickets, Space Race & Anonymous Chat

## ✅ What's Been Done

### Backend Routes Created

1. **`/api/quizzes`** - Full CRUD + launch/finish
   - `GET /api/quizzes` - List quizzes (teacher only)
   - `GET /api/quizzes/:id` - Get quiz by ID
   - `GET /api/quizzes/code/:accessCode` - Get active quiz by access code (public, for students)
   - `POST /api/quizzes` - Create quiz
   - `PUT /api/quizzes/:id` - Update quiz
   - `DELETE /api/quizzes/:id` - Soft delete quiz
   - `POST /api/quizzes/:id/launch` - Launch quiz with settings
   - `POST /api/quizzes/:id/finish` - Finish/end quiz session

2. **`/api/exit-tickets`** - Full CRUD + start/end
   - `GET /api/exit-tickets` - List exit tickets
   - `GET /api/exit-tickets/:id` - Get by ID
   - `POST /api/exit-tickets` - Create
   - `PUT /api/exit-tickets/:id` - Update
   - `DELETE /api/exit-tickets/:id` - Delete
   - `POST /api/exit-tickets/:id/start` - Start session
   - `POST /api/exit-tickets/:id/end` - End session

3. **`/api/space-races`** - Full CRUD + start/pause/end
   - `GET /api/space-races` - List space races
   - `GET /api/space-races/:id` - Get by ID
   - `POST /api/space-races` - Create
   - `PUT /api/space-races/:id` - Update
   - `DELETE /api/space-races/:id` - Delete
   - `POST /api/space-races/:id/start` - Start race
   - `POST /api/space-races/:id/pause` - Pause race
   - `POST /api/space-races/:id/end` - End race

4. **`/api/anonymous-chats`** - Migrated to Firestore
   - All routes now persist to Firestore
   - `createdBy` field added when teacher creates chat
   - Student endpoints remain public (no auth)

### Frontend API Client Updated

- Added `quizzesAPI`, `exitTicketsAPI`, `spaceRacesAPI` to `client/src/services/api.js`
- All methods configured with proper auth headers

### QuizLibrary Partially Updated

- Now fetches quizzes from API on mount
- `finishQuiz`, `deleteQuiz`, `launchQuiz` now use API
- Still needs: complete migration of all localStorage references

## 🔧 What You Need to Do

### Step 1: Create Firestore Indexes

Firestore requires composite indexes for queries. When you run the app, Firestore will show errors with links to create indexes. Click those links, or manually create:

1. **Quizzes Collection:**
   - Index: `createdBy` (Ascending) + `updatedAt` (Descending)
   - Index: `status` (Ascending) + `launched` (Ascending) + `createdAt` (Descending)

2. **Exit Tickets Collection:**
   - Index: `createdBy` (Ascending) + `updatedAt` (Descending)
   - Index: `status` (Ascending) + `createdAt` (Descending)

3. **Space Races Collection:**
   - Index: `createdBy` (Ascending) + `updatedAt` (Descending)
   - Index: `status` (Ascending) + `createdAt` (Descending)

4. **Anonymous Chats Collection:**
   - Index: `createdBy` (Ascending) + `createdAt` (Descending)
   - Index: `joinCode` (Ascending) + `status` (Ascending)

**How to create indexes:**
1. Go to Firebase Console → Firestore Database → Indexes
2. Click "Create Index"
3. Select collection name
4. Add fields as listed above
5. Click "Create"

### Step 2: Enable Firestore Database

If you haven't already:
1. Go to Firebase Console → Firestore Database
2. Click "Create database"
3. Choose "Start in test mode" (or production mode with rules)
4. Select location (same region as Realtime Database if possible)

### Step 3: Update Firestore Security Rules

Add these rules to allow teachers to manage their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function isTeacher() {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['teacher', 'admin'];
    }
    
    // Quizzes - teachers can CRUD their own
    match /quizzes/{quizId} {
      allow read: if isAuthenticated() && (resource.data.createdBy == request.auth.uid || isTeacher());
      allow create: if isTeacher();
      allow update, delete: if isOwner(resource.data.createdBy) || isTeacher();
    }
    
    // Exit Tickets - teachers can CRUD their own
    match /exitTickets/{ticketId} {
      allow read: if isAuthenticated() && (resource.data.createdBy == request.auth.uid || isTeacher());
      allow create: if isTeacher();
      allow update, delete: if isOwner(resource.data.createdBy) || isTeacher();
    }
    
    // Space Races - teachers can CRUD their own
    match /spaceRaces/{raceId} {
      allow read: if isAuthenticated() && (resource.data.createdBy == request.auth.uid || isTeacher());
      allow create: if isTeacher();
      allow update, delete: if isOwner(resource.data.createdBy) || isTeacher();
    }
    
    // Anonymous Chats - teachers can manage their own, students can read active ones
    match /anonymousChats/{chatId} {
      allow read: if resource.data.status == 'active' || isOwner(resource.data.createdBy);
      allow create: if true; // Anyone can create (for anonymous access)
      allow update, delete: if resource.data.createdBy == null || isOwner(resource.data.createdBy);
    }
    
    // Users collection (existing)
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId) || isTeacher();
    }
  }
}
```

## 📝 Important Notes

1. **Authentication Required:** All quiz/exit ticket/space race routes require teacher authentication
2. **Access Codes:** Quiz access codes are generated server-side
3. **Soft Delete:** Quizzes are soft-deleted (marked with `deletedAt`)
4. **Firestore Indexes:** You MUST create the indexes listed above

## 🐛 Troubleshooting

**Error: "Missing or insufficient permissions"**
- Check Firestore security rules

**Error: "The query requires an index"**
- Click the error link to create the index

**Quizzes not loading:**
- Check browser console for API errors
- Verify authentication token is valid
