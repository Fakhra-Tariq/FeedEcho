const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const anonymousChatRoutes = require('./routes/anonymousChats');
const quizRoutes = require('./routes/quizzes');
const { verifyFirebaseToken, checkRole } = require('./middleware/auth');
const quizSubmissionRoutes = require('./routes/quizSubmissions');
const exitTicketRoutes = require('./routes/exitTickets');
const spaceRaceRoutes = require('./routes/spaceRaces');
const sessionRoutes = require('./routes/sessions');
const studentRoutes = require('./routes/students');
const studyAssistantConversationRoutes = require('./routes/studyAssistantConversations');
const studyAssistantRoutes = require('./routes/studyAssistant');

const parseAllowedOrigins = () =>
  (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins();

const app = express();

// Middleware
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'combined'));
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalized)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/anonymous-chats', anonymousChatRoutes);
app.use('/api/quizzes', quizRoutes);
app.post(
  '/api/quiz/generate-ai',
  verifyFirebaseToken,
  checkRole(['teacher', 'admin']),
  quizRoutes.generateAiQuizHandler
);
app.use('/api/quiz-submissions', quizSubmissionRoutes);
app.use('/api/exit-tickets', exitTicketRoutes);
app.use('/api/space-races', spaceRaceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/study-assistant/conversations', studyAssistantConversationRoutes);
app.use('/api/study-assistant', studyAssistantRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'FeedEcho API is running',
    timestamp: new Date().toISOString()
  });
});

// Clear active sessions (development/debug only — disabled in production)
app.post('/api/clear-sessions', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Route not found' });
  }

  try {
    console.log('🧹 Clearing active sessions via API...');
    
    // Clear active session
    const { db } = require('./config/firebase');
    await db.ref('activeSession/singleton').remove();
    
    // End all active space races
    const spaceRacesSnap = await db.ref('spaceRaces').orderByChild('status').equalTo('active').get();
    if (spaceRacesSnap.exists()) {
      const updates = {};
      spaceRacesSnap.forEach((child) => {
        updates[`spaceRaces/${child.key}/status`] = 'ended';
        updates[`spaceRaces/${child.key}/endedAt`] = new Date().toISOString();
      });
      await db.ref().update(updates);
    }

    // End all active quizzes (status === 'active' AND launched === true)
    const quizzesSnap = await db.ref('quizzes').orderByChild('status').equalTo('active').get();
    if (quizzesSnap.exists()) {
      const updates = {};
      quizzesSnap.forEach((child) => {
        const quiz = child.val();
        if (quiz && quiz.launched === true) {
          updates[`quizzes/${child.key}/status`] = 'completed';
          updates[`quizzes/${child.key}/launched`] = false;
          updates[`quizzes/${child.key}/finishedAt`] = new Date().toISOString();
          updates[`quizzes/${child.key}/launchSettings`] = null;
        }
      });
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    }

    // Also end launched quizzes regardless of status string
    const launchedQuizzesSnap = await db.ref('quizzes').orderByChild('launched').equalTo(true).get();
    if (launchedQuizzesSnap.exists()) {
      const updates = {};
      launchedQuizzesSnap.forEach((child) => {
        updates[`quizzes/${child.key}/status`] = 'ready';
        updates[`quizzes/${child.key}/launched`] = false;
        updates[`quizzes/${child.key}/launchSettings`] = null;
        updates[`quizzes/${child.key}/finishedAt`] = new Date().toISOString();
      });
      await db.ref().update(updates);
    }

    // Clear stale currentActivity flags on all teacher sessions
    const sessionsSnap = await db.ref('sessions').get();
    if (sessionsSnap.exists()) {
      const sessionUpdates = {};
      sessionsSnap.forEach((child) => {
        const session = child.val();
        if (session?.currentActivity) {
          sessionUpdates[`sessions/${child.key}/currentActivity`] = null;
          sessionUpdates[`sessions/${child.key}/updatedAt`] = new Date().toISOString();
        }
      });
      if (Object.keys(sessionUpdates).length > 0) {
        await db.ref().update(sessionUpdates);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'All active sessions cleared successfully!' 
    });
    
  } catch (error) {
    console.error('Error clearing sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 FeedEcho server running on port ${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.log('👉 Trying next available port...');

    const newPort = Number(PORT) + 1;

    app.listen(newPort, () => {
      console.log(`✅ Server started on fallback port ${newPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
