# Student Panel Backend Setup

The student panel now uses the **same Firebase + Node backend** as the teacher panel. Teachers panel code was **not changed**.

## What was connected

| Feature | Backend |
|---------|---------|
| Student sign up / login | Firebase Auth + `/api/auth/ensure-profile` + `/api/auth/login` |
| Forgot password | Firebase Auth reset email |
| Join session (home) | `/api/sessions/join` (via `/student/join`) |
| Quiz history | Firebase Realtime Database `quiz_submissions` |
| Progress page | Firebase RTDB (quizzes, submissions, exit tickets, space races) |
| Space race history | `/api/space-races/student/history` + shared resources |
| Profile (name, bio) | `/api/auth/profile` |
| Recent activity (home + progress) | `/api/students/activity` |

---

## Firebase Console steps

### 1. Enable Email/Password Authentication

1. Open [Firebase Console](https://console.firebase.google.com)
2. Select your FeedEcho project
3. Go to **Build → Authentication → Sign-in method**
4. Enable **Email/Password**
5. (Optional) Enable **Google** if you want Google sign-in for students later

### 2. Enable Realtime Database (if not already)

1. Go to **Build → Realtime Database**
2. Click **Create Database** if needed
3. Choose your region (same as in `.env`: `FIREBASE_DATABASE_URL`)
4. Start in **test mode** for development, or use rules below for production

### 3. Realtime Database rules (recommended)

In **Realtime Database → Rules**, allow authenticated users to read/write their profile and allow public read for active sessions:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "quiz_submissions": {
      ".read": true,
      "$quizId": {
        ".write": true
      }
    },
    "quiz_participants": {
      ".read": true,
      ".write": true
    },
    "space_race_participants": {
      ".read": true,
      ".write": true
    },
    "space_race_student_history": {
      ".read": true,
      ".write": true
    },
    "space_race_shared_resources": {
      ".read": true,
      ".write": true
    },
    "exit_responses": {
      ".read": true,
      ".write": true
    }
  }
}
```

> Student quiz/space-race join flows use **no-auth API routes** on your Node server, which writes to RTDB via Admin SDK. The rules above mainly affect direct client RTDB reads (Progress page).

### 4. Copy Firebase web config to client

In **Project settings → General → Your apps → Web app**, copy config into `client/.env`:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

### 5. Server `.env` (root folder)

Ensure these match your Firebase service account (same as teacher setup):

```env
FIREBASE_PROJECT_ID=...
FIREBASE_DATABASE_URL=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
PORT=5000
CLIENT_URL=http://localhost:3000
```

---

## How to run

**Terminal 1 – Backend:**
```bash
cd server
npm install
npm start
```

**Terminal 2 – Frontend:**
```bash
cd client
npm install
npm start
```

---

## Test the student flow

1. Go to `http://localhost:3000/student/signup`
2. Create account with **email + password** (not username anymore)
3. Login at `/student/auth`
4. From home, enter a **6-digit session code** from a teacher-launched quiz/space race
5. After submitting a quiz, check **My Quizzes** and **Progress** for real data

---

## Notes

- Old **localStorage-only** student accounts (`studentAccounts`) no longer work. Students must sign up again with email.
- Teacher panel is untouched — same routes, same auth, same APIs.
- AI Study Assistant chat on the home page is still local (no backend yet).
- Notifications on the home page are still placeholder UI.
