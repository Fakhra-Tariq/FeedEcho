import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';
import { anonymousChatAPI, quizzesAPI, exitTicketsAPI, spaceRacesAPI, sessionsAPI } from '../services/api';
import { generateSessionCode } from '../utils/sessionCodeGenerator';
import { useAuth } from './AuthContext';
import { useTeacherRealtimeRevision } from './TeacherRealtimeSyncContext';
import { normalizeSessionCurrentActivity } from '../utils/sessionActivityLabel';
import { canAccessTeacherPortal, getActivePortal } from '../utils/userRoles';

/** Map Firebase activeSession/singleton to TeacherDataContext.activeSession shape */
function mapRemoteActiveSession(raw) {
  if (!raw) {
    console.log('🔥 mapRemoteActiveSession: No raw data');
    return null;
  }
  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : raw.status;
  console.log('🔥 mapRemoteActiveSession: status =', status);
  if (status !== 'active') {
    console.log('🔥 mapRemoteActiveSession: Status not active');
    return null;
  }
  const joinCode = (raw.accessCode || raw.joinCode || '').toString();
  const sessionId = raw.sessionId || raw.quizId || raw.raceId;
  console.log('🔥 mapRemoteActiveSession: joinCode =', joinCode, 'sessionId =', sessionId);
  if (!sessionId) {
    console.log('🔥 mapRemoteActiveSession: No sessionId');
    return null;
  }
  const base = {
    id: raw.id || 'live',
    joinCode,
    startedAt: raw.createdAt || new Date().toISOString(),
    participants: typeof raw.participants === 'number' ? raw.participants : 0,
    endTime: raw.endTime || null,
    quizAvailabilityMinutes: raw.quizAvailabilityMinutes,
    timePerStudentMinutes: raw.timePerStudentMinutes,
  };
  const t = raw.type;
  console.log('🔥 mapRemoteActiveSession: type =', t);
  if (t === 'session') {
    return {
      ...base,
      type: 'session',
      sessionId,
      sessionName: raw.sessionName || null,
    };
  }
  if (t === 'quiz') return { ...base, type: 'quiz', quizId: sessionId };
  if (t === 'spaceRace') return { ...base, type: 'spaceRace', quizId: sessionId };
  console.log('🔥 mapRemoteActiveSession: Unknown type', t);
  return null;
}

/** Skip setData when API list matches what we already have (by id + updatedAt) */
function apiListUnchanged(prevList, nextList) {
  if (prevList === nextList) return true;
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return false;
  if (prevList.length !== nextList.length) return false;
  for (let i = 0; i < prevList.length; i += 1) {
    if (prevList[i]?.id !== nextList[i]?.id) return false;
    if (prevList[i]?.updatedAt !== nextList[i]?.updatedAt) return false;
    if (prevList[i]?.status !== nextList[i]?.status) return false;
  }
  return true;
}

const TeacherDataContext = createContext(null);
const STORAGE_KEY = 'feedEcho_teacher_workspace_v1';
const LEGACY_STORAGE_KEY = 'learneXa_teacher_workspace_v1';

const generateId = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
};

const defaultData = {
  theme: 'light',
  settings: {
    anonymousChatEnabled: true,
    quizDefaults: {
      timerMinutes: 5,
      allowRetakes: false,
      shuffleQuestions: true,
    },
    notifications: {
      email: true,
      push: false,
      weeklyDigest: true,
    },
  },
  activeSession: null,
  quizzes: [
    {
      id: 'quiz-algebra-warmup',
      title: 'Algebra Warmup',
      description: 'Quick bell-ringer to gauge readiness on linear equations.',
      status: 'Ready',
      questionCount: 8,
      createdAt: '2026-01-10T08:20:00.000Z',
      updatedAt: '2026-01-10T08:20:00.000Z',
      submissions: 34,
      avgScore: 78,
      participation: 92,
      joinCode: null,
    },
    {
      id: 'quiz-ecosystems-exit',
      title: 'Exit Ticket · Ecosystems',
      description: 'Short pulse-check on food chains and energy flow.',
      status: 'Draft',
      questionCount: 5,
      createdAt: '2026-01-08T14:05:00.000Z',
      updatedAt: '2026-01-09T10:32:00.000Z',
      submissions: 0,
      avgScore: null,
      participation: null,
      joinCode: null,
    },
  ],
  exitTickets: [],
  spaceRaces: [
    {
      id: 'space-race-geometry',
      quizId: 'quiz-algebra-warmup',
      title: 'Geometry Sprint',
      status: 'Ended',
      teams: 4,
      avgScore: 85,
      createdAt: '2026-01-04T09:00:00.000Z',
      updatedAt: '2026-01-04T09:25:00.000Z',
    },
  ],
  anonymousChats: [
    {
      id: 'chat-climate-change',
      title: 'Lecture · Climate Change Impacts',
      status: 'ended',
      createdAt: '2026-01-07T11:00:00.000Z',
      endedAt: '2026-01-07T11:35:00.000Z',
      joinCode: 'CLIMATE',
      lastActivity: '2026-01-07T11:35:00.000Z',
      participants: 19,
      slides: 12,
      messages: [
        {
          id: 'msg-1',
          sender: 'Anonymous Student',
          message: 'Will this be on the assessment next week?',
          timestamp: '2026-01-07T11:12:00.000Z',
          upvotes: 4,
        },
        {
          id: 'msg-2',
          sender: 'Anonymous Student',
          message: 'Can you clarify the difference between mitigation and adaptation?',
          timestamp: '2026-01-07T11:18:00.000Z',
          upvotes: 7,
        },
      ],
      settings: {
        allowQuestions: true,
        allowComments: true,
        autoModerate: false,
        profanityFilter: true,
        moderationMode: false,
      },
      analytics: {
        uniqueStudents: 19,
        totalQuestions: 24,
        questionsPerStudent: 1.3,
      },
    },
  ],
  reports: [
    {
      id: 'report-week-01',
      title: 'Week 01 · Engagement Overview',
      type: 'Summary',
      submissions: 142,
      avgScore: 81,
      lastUpdated: '2026-01-10T17:45:00.000Z',
    },
  ],
  activityLog: [
    {
      id: 'activity-1',
      type: 'quiz',
      title: 'Algebra Warmup',
      status: 'Ready',
      timestamp: '2026-01-10T08:20:00.000Z',
    },
    {
      id: 'activity-2',
      type: 'spaceRace',
      title: 'Geometry Sprint',
      status: 'Ended',
      timestamp: '2026-01-04T09:25:00.000Z',
    },
    {
      id: 'activity-3',
      type: 'exitTicket',
      title: 'Exit Ticket · Fractions',
      status: 'Ready',
      timestamp: '2026-01-05T15:10:00.000Z',
    },
    {
      id: 'activity-4',
      type: 'anonymousChat',
      title: 'Lecture · Climate Change Impacts',
      status: 'Archived',
      timestamp: '2026-01-07T11:35:00.000Z',
    },
  ],
};

const withDefaults = (saved) => ({
  ...defaultData,
  ...saved,
  settings: {
    ...defaultData.settings,
    ...(saved?.settings || {}),
    quizDefaults: {
      ...defaultData.settings.quizDefaults,
      ...(saved?.settings?.quizDefaults || {}),
    },
    notifications: {
      ...defaultData.settings.notifications,
      ...(saved?.settings?.notifications || {}),
    },
  },
});

export const TeacherDataProvider = ({ children }) => {
  const { userProfile } = useAuth();
  const activePortal = getActivePortal();
  const isTeacherPortal =
    canAccessTeacherPortal(userProfile) &&
    (!activePortal || activePortal === 'teacher');
  const dataRevision = useTeacherRealtimeRevision();

  const [data, setData] = useState(() => {
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        return withDefaults(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to parse teacher workspace data:', error);
    }
    return defaultData;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.error('Failed to persist teacher workspace data:', error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [data]);

  // Hydrate activeSession from server (scoped to logged-in teacher)
  useEffect(() => {
    if (!isTeacherPortal || !userProfile?.uid) return undefined;

    const syncActiveSessionFromServer = async () => {
      try {
        const res = await sessionsAPI.getActive(userProfile.uid);
        const active = res.data?.data;

        setData((prev) => {
          if (active && String(active.status || '').toLowerCase() === 'active') {
            const sessionId = active.id || active.sessionId;
            const joinCode = (active.sessionCode || active.accessCode || '').toString().toUpperCase();
            if (
              prev.activeSession?.type === 'session' &&
              prev.activeSession.sessionId === sessionId &&
              prev.activeSession.joinCode === joinCode
            ) {
              return prev;
            }
            return {
              ...prev,
              activeSession: {
                id: sessionId,
                type: 'session',
                sessionId,
                joinCode,
                sessionName: active.sessionName,
                participants: active.participants || 0,
                startedAt: active.createdAt,
                currentActivity: normalizeSessionCurrentActivity(active.currentActivity),
              },
            };
          }

          if (prev.activeSession?.type === 'session') {
            return { ...prev, activeSession: null };
          }
          return prev;
        });
      } catch (error) {
        console.warn('Failed to sync active session from server:', error);
      }
    };

    syncActiveSessionFromServer();
    const interval = setInterval(syncActiveSessionFromServer, 20000);
    return () => clearInterval(interval);
  }, [isTeacherPortal, userProfile?.uid]);

  // Standalone session details (currentActivity, sessionName) from sessions/{id}
  useEffect(() => {
    if (!isTeacherPortal || !userProfile?.uid) return undefined;
    const sessionId =
      data.activeSession?.type === 'session'
        ? data.activeSession.sessionId || data.activeSession.id
        : null;
    if (!sessionId) return undefined;

    const sessionRef = dbRef(db, `sessions/${sessionId}`);

    const applySessionFields = (sessionSnap) => {
      if (!sessionSnap.exists()) return;
      const s = sessionSnap.val() || {};
      if (s.teacherId && userProfile?.uid && s.teacherId !== userProfile.uid) {
        return;
      }
      setData((prev) => {
        if (prev.activeSession?.type !== 'session' || prev.activeSession.sessionId !== sessionId) {
          return prev;
        }
        const sessionCode = (s.sessionCode || prev.activeSession.joinCode || '')
          .toString()
          .toUpperCase();
        const sessionName = s.sessionName ?? prev.activeSession.sessionName;
        const joinCode = sessionCode || prev.activeSession.joinCode;
        const currentActivity = normalizeSessionCurrentActivity(s.currentActivity);
        const participants =
          typeof s.participants === 'number' ? s.participants : prev.activeSession.participants;
        if (
          prev.activeSession.sessionName === sessionName &&
          prev.activeSession.joinCode === joinCode &&
          prev.activeSession.currentActivity === currentActivity &&
          prev.activeSession.participants === participants
        ) {
          return prev;
        }
        return {
          ...prev,
          activeSession: {
            ...prev.activeSession,
            sessionName,
            joinCode,
            currentActivity,
            participants,
          },
        };
      });
    };

    const unsubSession = onValue(sessionRef, applySessionFields, () => {});
    return () => {
      try {
        unsubSession();
      } catch {
        off(sessionRef);
      }
    };
  }, [isTeacherPortal, userProfile?.uid, data.activeSession?.type, data.activeSession?.sessionId]);

  // Real-time activity label + participant count from live Firebase data
  useEffect(() => {
    if (!isTeacherPortal || !userProfile?.uid) return undefined;

    const sessionId =
      data.activeSession?.type === 'session'
        ? data.activeSession.sessionId || data.activeSession.id
        : null;
    const joinCode = String(data.activeSession?.joinCode || '').trim().toUpperCase();
    if (!sessionId || joinCode.length !== 6) return undefined;

    let unsubQuiz = null;
    let unsubParticipants = null;
    let unsubRace = null;
    let unsubRaceParticipants = null;

    const applyLiveStats = (updates) => {
      setData((prev) => {
        if (prev.activeSession?.type !== 'session' || prev.activeSession.sessionId !== sessionId) {
          return prev;
        }
        const next = { ...prev.activeSession, ...updates };
        if (
          next.participants === prev.activeSession.participants &&
          next.currentActivity === prev.activeSession.currentActivity
        ) {
          return prev;
        }
        return { ...prev, activeSession: next };
      });
    };

    const cleanupNested = () => {
      if (unsubQuiz) {
        unsubQuiz();
        unsubQuiz = null;
      }
      if (unsubParticipants) {
        unsubParticipants();
        unsubParticipants = null;
      }
      if (unsubRace) {
        unsubRace();
        unsubRace = null;
      }
      if (unsubRaceParticipants) {
        unsubRaceParticipants();
        unsubRaceParticipants = null;
      }
    };

    const attachQuizListeners = (quizId) => {
      cleanupNested();
      unsubQuiz = onValue(dbRef(db, `quizzes/${quizId}`), (qSnap) => {
        if (!qSnap.exists()) return;
        const quiz = qSnap.val() || {};
        const status = String(quiz.status || '').toLowerCase();
        const isLive = quiz.launched === true && (status === 'launched' || status === 'active');
        if (isLive) {
          applyLiveStats({ currentActivity: 'quiz' });
        }
      });
      unsubParticipants = onValue(dbRef(db, `quiz_participants/${quizId}`), (pSnap) => {
        const count = pSnap.exists() ? Object.keys(pSnap.val() || {}).length : 0;
        applyLiveStats({ participants: count });
      });
    };

    const attachRaceListeners = (raceId) => {
      cleanupNested();
      unsubRace = onValue(dbRef(db, `spaceRaces/${raceId}`), (rSnap) => {
        if (!rSnap.exists()) return;
        const race = rSnap.val() || {};
        const status = String(race.status || '').toLowerCase();
        const isLive = ['active', 'running', 'started', 'live'].includes(status);
        if (isLive) {
          applyLiveStats({ currentActivity: 'spacerace' });
        }
      });
      unsubRaceParticipants = onValue(dbRef(db, `space_race_participants/${raceId}`), (pSnap) => {
        const count = pSnap.exists() ? Object.keys(pSnap.val() || {}).length : 0;
        applyLiveStats({ participants: count });
      });
    };

    const unsubQuizCode = onValue(dbRef(db, `quiz_codes/${joinCode}`), (codeSnap) => {
      if (codeSnap.exists()) {
        attachQuizListeners(codeSnap.val());
        return;
      }
      cleanupNested();
    });

    const unsubRaceCode = onValue(dbRef(db, `space_race_codes/${joinCode}`), (codeSnap) => {
      if (codeSnap.exists()) {
        attachRaceListeners(codeSnap.val());
      }
    });

    return () => {
      unsubQuizCode();
      unsubRaceCode();
      cleanupNested();
    };
  }, [
    isTeacherPortal,
    userProfile?.uid,
    data.activeSession?.type,
    data.activeSession?.sessionId,
    data.activeSession?.joinCode,
  ]);

  const logActivity = useCallback((entry) => {
    setData((prev) => ({
      ...prev,
      activityLog: [
        {
          id: generateId('activity'),
          timestamp: new Date().toISOString(),
          ...entry,
        },
        ...prev.activityLog,
      ].slice(0, 50),
    }));
  }, []);

  const createQuiz = useCallback((payload) => {
    // Normalize status to consistent values
    let normalizedStatus = payload.status || 'draft';
    if (normalizedStatus === 'Draft') {
      normalizedStatus = 'draft';
    } else if (normalizedStatus === 'Ready' || normalizedStatus === 'Active') {
      normalizedStatus = 'active';
    } else if (normalizedStatus === 'Ended' || normalizedStatus === 'Completed') {
      normalizedStatus = 'completed';
    }
    
    console.log('Creating quiz with normalized status:', normalizedStatus, 'from input:', payload.status);
    
    const quiz = {
      id: payload.id || generateId('quiz'),
      title: payload.title,
      description: payload.description || '',
      status: normalizedStatus, // ✅ Use normalized status
      questionCount: payload.questionCount || (payload.questions?.length ?? 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submissions: payload.submissions ?? 0,
      avgScore: payload.avgScore ?? null,
      participation: payload.participation ?? null,
      joinCode: null,
      questions: payload.questions || [],
      timer: payload.timer ?? null,
    };

    console.log('Quiz created in context:', {
      id: quiz.id,
      title: quiz.title,
      status: quiz.status
    });

    setData((prev) => ({
      ...prev,
      quizzes: [quiz, ...prev.quizzes],
    }));

    logActivity({ type: 'quiz', title: quiz.title, status: quiz.status });
    return quiz;
  }, [logActivity]);

  const updateQuizStatus = useCallback((quizId, status) => {
    setData((prev) => ({
      ...prev,
      quizzes: prev.quizzes.map((quiz) =>
        quiz.id === quizId ? { ...quiz, status, updatedAt: new Date().toISOString() } : quiz
      ),
    }));

    const quiz = data.quizzes.find((item) => item.id === quizId);
    if (quiz) {
      logActivity({ type: 'quiz', title: quiz.title, status });
    }
  }, [data.quizzes, logActivity]);

  const launchQuiz = useCallback((quizId, launchSettings = {}) => {
    const joinCode = launchSettings.accessCode || generateSessionCode();
    const now = new Date();
    
    setData((prev) => ({
      ...prev,
      activeSession: {
        id: generateId('session'),
        type: 'quiz',
        quizId,
        joinCode,
        participants: 0,
        startedAt: now.toISOString(),
        endTime: launchSettings.endTime,
        quizAvailabilityMinutes: launchSettings.quizAvailabilityMinutes,
        timePerStudentMinutes: launchSettings.timePerStudentMinutes,
        launchSettings
      },
      quizzes: prev.quizzes.map((quiz) =>
        quiz.id === quizId
          ? { 
              ...quiz, 
              status: 'Active', 
              joinCode, 
              launched: true,
              launchSettings,
              timer: launchSettings.timePerStudentMinutes || quiz.timer,
              updatedAt: now.toISOString() 
            }
          : { ...quiz, status: quiz.status === 'Active' ? 'Ended' : quiz.status, joinCode: null }
      ),
    }));

    const quiz = data.quizzes.find((item) => item.id === quizId);
    if (quiz) {
      logActivity({ type: 'quiz', title: quiz.title, status: 'Active' });
    }
  }, [data.quizzes, logActivity]);

  const endActiveSession = useCallback(() => {
    setData((prev) => {
      if (!prev.activeSession) return prev;
      const { type, quizId } = prev.activeSession;
      return {
        ...prev,
        activeSession: null,
        quizzes: prev.quizzes.map((quiz) =>
          quiz.id === quizId ? { ...quiz, status: 'Ended', joinCode: null, updatedAt: new Date().toISOString() } : quiz
        ),
        exitTickets: prev.exitTickets.map((ticket) =>
          type === 'exitTicket' && ticket.id === quizId
            ? { ...ticket, status: 'Ended', updatedAt: new Date().toISOString() }
            : ticket
        ),
      };
    });
  }, []);

  const addExitTicket = useCallback((payload) => {
    const ticket = {
      id: payload.id || generateId('exit-ticket'),
      title: payload.title,
      prompt: payload.prompt,
      questionTypes: payload.questionTypes || [],
      status: payload.status || 'Ready',
      submissions: payload.submissions ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      exitTickets: [ticket, ...prev.exitTickets],
    }));

    logActivity({ type: 'exitTicket', title: ticket.title, status: ticket.status });
    return ticket;
  }, [logActivity]);

  const startExitTicket = useCallback((ticketId) => {
    const joinCode = generateSessionCode();
    setData((prev) => ({
      ...prev,
      activeSession: {
        id: generateId('session'),
        type: 'exitTicket',
        quizId: ticketId,
        joinCode,
        participants: 0,
        startedAt: new Date().toISOString(),
      },
      exitTickets: prev.exitTickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, status: 'Active', updatedAt: new Date().toISOString() }
          : ticket
      ),
    }));

    const ticket = data.exitTickets.find((item) => item.id === ticketId);
    if (ticket) {
      logActivity({ type: 'exitTicket', title: ticket.title, status: 'Active' });
    }
  }, [data.exitTickets, logActivity]);

  const recordSpaceRace = useCallback((payload) => {
    const race = {
      id: generateId('space-race'),
      quizId: payload.quizId,
      title: payload.title,
      status: payload.status || 'Active',
      teams: payload.teams,
      timerMinutes: payload.timerMinutes,
      answerRules: payload.answerRules,
      joinCode: payload.joinCode || generateSessionCode(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      spaceRaces: [race, ...prev.spaceRaces],
      activeSession: {
        id: generateId('session'),
        type: 'spaceRace',
        quizId: payload.quizId,
        joinCode: race.joinCode,
        participants: 0,
        startedAt: new Date().toISOString(),
      },
    }));

    logActivity({ type: 'spaceRace', title: race.title, status: race.status });
    return race;
  }, [logActivity]);

  const createSpaceRace = useCallback((payload) => {
    return recordSpaceRace({
      ...payload,
      status: 'draft'
    });
  }, [recordSpaceRace]);

  const updateSpaceRace = useCallback((raceId, updates) => {
    // Persist to Firebase via API
    spaceRacesAPI.update(raceId, updates).catch((error) => {
      console.error('Failed to update Space Race in Firebase:', error);
    });

    setData((prev) => {
      const updatedRaces = prev.spaceRaces.map((race) =>
        race.id === raceId ? { ...race, ...updates, updatedAt: new Date().toISOString() } : race
      );

      // If starting a race, create active session
      let activeSession = prev.activeSession;
      if (updates.status === 'active' && !prev.activeSession) {
        const race = updatedRaces.find(r => r.id === raceId);
        activeSession = {
          id: generateId('session'),
          type: 'spaceRace',
          raceId,
          joinCode: race?.joinCode || generateSessionCode(),
          participants: 0,
          startedAt: new Date().toISOString(),
        };
      }

      return {
        ...prev,
        spaceRaces: updatedRaces,
        activeSession
      };
    });

    const race = data.spaceRaces.find((item) => item.id === raceId);
    if (race && updates.status) {
      logActivity({ type: 'spaceRace', title: race.title, status: updates.status });
    }
  }, [data.spaceRaces, logActivity]);

  const archiveChat = useCallback((chatId) => {
    setData((prev) => ({
      ...prev,
      anonymousChats: prev.anonymousChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              archivedAt: new Date().toISOString(),
            }
          : chat
      ),
    }));

    const chat = data.anonymousChats.find((item) => item.id === chatId);
    if (chat) {
      logActivity({ type: 'anonymousChat', title: chat.title, status: 'Archived' });
    }
  }, [data.anonymousChats, logActivity]);

  const addAnonymousMessage = useCallback((chatId, message) => {
    setData((prev) => ({
      ...prev,
      anonymousChats: prev.anonymousChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: generateId('msg'),
                  sender: 'Anonymous Student',
                  message,
                  timestamp: new Date().toISOString(),
                  upvotes: 0,
                },
              ],
              analytics: {
                ...chat.analytics,
                totalQuestions: chat.analytics.totalQuestions + 1,
              },
            }
          : chat
      ),
    }));
  }, []);

  const addAnonymousChatSession = useCallback(async (payload) => {
    try {
      const response = await anonymousChatAPI.create({
        title: payload.title,
        description: payload.description || '',
        settings: {
          allowQuestions: payload.allowQuestions,
          allowComments: payload.allowComments,
          autoModerate: payload.autoModerate,
          profanityFilter: payload.profanityFilter,
          moderationMode: payload.moderationMode || false,
        }
      });

      if (response.data.success) {
        const chat = response.data.data;
        
        // Update local state with the new chat
        setData((prev) => ({
          ...prev,
          anonymousChats: [chat, ...prev.anonymousChats],
        }));

        logActivity({ type: 'anonymousChat', title: chat.title, status: 'Active' });
        return chat;
      } else {
        throw new Error(response.data.error || 'Failed to create chat session');
      }
    } catch (error) {
      console.error('Error creating anonymous chat session:', error);
      throw error;
    }
  }, [logActivity, setData]);

  // Sync anonymous chats from backend
  const syncAnonymousChats = useCallback(async () => {
    try {
      const response = await anonymousChatAPI.getAll();
      if (response.data.success) {
        const backendChats = response.data.data;
        
        // Update local state with backend chats
        setData((prev) => {
          if (apiListUnchanged(prev.anonymousChats, backendChats)) return prev;
          return { ...prev, anonymousChats: backendChats };
        });
      }
    } catch (error) {
      console.error('Error syncing anonymous chats:', error);
    }
  }, [setData]);

  const syncQuizzes = useCallback(async () => {
    try {
      const response = await quizzesAPI.getAll();
      if (response.data.success) {
        const backendQuizzes = response.data.data;
        setData((prev) => {
          if (apiListUnchanged(prev.quizzes, backendQuizzes)) return prev;
          return { ...prev, quizzes: backendQuizzes };
        });
      }
    } catch (error) {
      console.error('Error syncing quizzes:', error);
    }
  }, [setData]);

  // Sync exit tickets from backend
  const syncExitTickets = useCallback(async () => {
    try {
      const response = await exitTicketsAPI.getAll();
      if (response.data.success) {
        const backendExitTickets = response.data.data;
        setData((prev) => {
          if (apiListUnchanged(prev.exitTickets, backendExitTickets)) return prev;
          return { ...prev, exitTickets: backendExitTickets };
        });
      }
    } catch (error) {
      console.error('Error syncing exit tickets:', error);
    }
  }, [setData]);

  const syncSpaceRaces = useCallback(async () => {
    try {
      const response = await spaceRacesAPI.getAll();
      if (response.data?.success) {
        const list = response.data.data || [];
        setData((prev) => {
          if (apiListUnchanged(prev.spaceRaces, list)) return prev;
          return { ...prev, spaceRaces: list };
        });
      }
    } catch (error) {
      console.error('Error syncing space races:', error);
    }
  }, [setData]);

  // Toggle moderation mode
  const toggleChatModeration = useCallback(async (chatId, moderationMode) => {
    try {
      const response = await anonymousChatAPI.toggleModeration(chatId, moderationMode);
      
      if (response.data.success) {
        const updatedChat = response.data.data;
        
        // Update local state with the updated chat
        setData((prev) => ({
          ...prev,
          anonymousChats: prev.anonymousChats.map(chat => 
            chat.id === chatId ? updatedChat : chat
          ),
        }));
        
        logActivity({ type: 'anonymousChat', title: `Moderation ${moderationMode ? 'enabled' : 'disabled'}` });
        return updatedChat;
      } else {
        throw new Error(response.data.error || 'Failed to toggle moderation');
      }
    } catch (error) {
      console.error('Error toggling moderation:', error);
      throw error;
    }
  }, [logActivity, setData]);

  const updateAnonymousChat = useCallback(async (chatId, updates) => {
    // Special flag used by UI to request a delete without changing UI code paths
    if (updates?.__delete) {
      await anonymousChatAPI.delete(chatId);
      setData((prev) => ({
        ...prev,
        anonymousChats: prev.anonymousChats.filter((c) => c.id !== chatId),
      }));
      return;
    }

    const response = await anonymousChatAPI.update(chatId, updates);
    if (response.data?.success) {
      const updatedChat = response.data.data;
      setData((prev) => ({
        ...prev,
        anonymousChats: prev.anonymousChats.map((chat) =>
          chat.id === chatId ? updatedChat : chat
        ),
      }));
    }
  }, [setData]);

  const addStudentToChat = useCallback((chatId) => {
    setData((prev) => ({
      ...prev,
      anonymousChats: prev.anonymousChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              participants: chat.participants + 1,
              analytics: {
                ...chat.analytics,
                uniqueStudents: chat.analytics.uniqueStudents + 1,
              },
            }
          : chat
      ),
    }));
  }, []);

  const incrementParticipantCount = useCallback(() => {
    setData((prev) => {
      if (!prev.activeSession) return prev;
      return {
        ...prev,
        activeSession: {
          ...prev.activeSession,
          participants: prev.activeSession.participants + 1,
        },
      };
    });
  }, []);

  const createSession = useCallback(async (sessionName) => {
    try {
      const teacherId = userProfile?.uid;
      
      if (!teacherId) {
        throw new Error('Teacher ID not found');
      }

      console.log('🔧 Creating session with:', { sessionName, teacherId });

      const response = await sessionsAPI.create({
        sessionName,
        teacherId
      });

      console.log('🔧 Session creation response:', response);

      if (response?.data?.success) {
        const sessionData = response.data.data;
        
        console.log('✅ Session created successfully:', sessionData);
        
        // Update local state with the new session
        setData((prev) => ({
          ...prev,
          activeSession: {
            id: sessionData.id,
            type: 'session',
            sessionId: sessionData.id,
            joinCode: sessionData.sessionCode,
            participants: 0,
            startedAt: sessionData.createdAt,
            sessionName: sessionData.sessionName,
            currentActivity: normalizeSessionCurrentActivity(sessionData.currentActivity),
          }
        }));

        logActivity({ type: 'session', title: sessionData.sessionName, status: 'Active' });
        
        return sessionData;
      } else {
        throw new Error(response?.data?.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('❌ Error creating session:', error);
      throw error;
    }
  }, [logActivity, userProfile]);

  const endStandaloneSession = useCallback(async (sessionId) => {
    try {
      const response = await sessionsAPI.end(sessionId);

      if (response.data.success) {
        // Clear active session from local state
        setData((prev) => ({
          ...prev,
          activeSession: null
        }));

        return true;
      } else {
        throw new Error(response.data.error || 'Failed to end session');
      }
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }, []);

  // RTDB revision bumps → debounced refresh of API-backed lists (avoids storm of parallel getAll calls)
  const syncDebounceRef = useRef(null);
  useEffect(() => {
    if (!isTeacherPortal) return undefined;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    const delay = dataRevision === 0 ? 0 : 450;
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;
      void Promise.all([
        syncQuizzes(),
        syncExitTickets(),
        syncAnonymousChats(),
        syncSpaceRaces(),
      ]);
    }, delay);
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [isTeacherPortal, dataRevision, syncQuizzes, syncExitTickets, syncAnonymousChats, syncSpaceRaces]);

  const value = useMemo(
    () => ({
      data,
      setData,
      logActivity,
      createQuiz,
      updateQuizStatus,
      launchQuiz,
      endActiveSession,
      addExitTicket,
      startExitTicket,
      syncQuizzes,
      syncExitTickets,
      syncSpaceRaces,
      recordSpaceRace,
      createSpaceRace,
      updateSpaceRace,
      addAnonymousChatSession,
      syncAnonymousChats,
      toggleChatModeration,
      addAnonymousMessage,
      updateAnonymousChat,
      addStudentToChat,
      archiveChat,
      incrementParticipantCount,
      createSession,
      endStandaloneSession,
    }),
    [
      data,
      logActivity,
      createQuiz,
      updateQuizStatus,
      launchQuiz,
      endActiveSession,
      addExitTicket,
      startExitTicket,
      syncQuizzes,
      syncExitTickets,
      syncSpaceRaces,
      recordSpaceRace,
      createSpaceRace,
      updateSpaceRace,
      addAnonymousChatSession,
      syncAnonymousChats,
      toggleChatModeration,
      addAnonymousMessage,
      updateAnonymousChat,
      addStudentToChat,
      archiveChat,
      incrementParticipantCount,
      createSession,
      endStandaloneSession,
    ]
  );

  return (
    <TeacherDataContext.Provider value={value}>{children}</TeacherDataContext.Provider>
  );
};

export const useTeacherData = () => {
  const context = useContext(TeacherDataContext);
  if (!context) {
    throw new Error('useTeacherData must be used within a TeacherDataProvider');
  }
  return context;
};
