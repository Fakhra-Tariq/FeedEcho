import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Send, CheckCircle, AlertCircle, ChevronRight, Users } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { spaceRacesAPI } from '../services/api';
import { loadSpaceRaceParticipant } from '../utils/spaceRaceSession';
import { getStoredStudentSession } from '../utils/studentSession';
import { calculateScore, validateQuizData, compareAnswer, getStableQuestionId, normalizeAnswersByQuestionId } from '../utils/scoringUtils';
import { getEffectiveQuestionType, normalizeQuizForClient } from '../utils/quizQuestionNormalization';
import { saveLocalQuizSubmission } from '../utils/studentQuizAttempts';
import {
  persistQuizParticipantSession,
  readQuizParticipantSession,
  clearQuizParticipantSession,
} from '../utils/quizParticipantSession';
import { submitQuizWithRetry } from '../utils/quizSubmissionSync';
import {
  applyQuizShuffleSettings,
  getStudentAttemptSecondsRemaining,
  hasLocalQuizSubmission,
  isQuizJoinWindowExpired,
} from '../utils/quizLaunchStudentSettings';
import { useRtdbValue } from '../hooks/useRtdb';
import { set as dbSet, ref as dbRef, update as dbUpdate, onValue, get } from 'firebase/database';
import { db } from '../firebase';

const StudentQuizAttempt = ({
  embedded = false,
  spaceRaceId = null,
  spaceRaceQuizId = null,
  spaceRaceParticipant = null,
} = {}) => {
  const { quizId: paramQuizId } = useParams();
  const effectiveQuizId = spaceRaceQuizId || paramQuizId;
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionSyncFailed, setSubmissionSyncFailed] = useState(false);
  const [submissionSyncError, setSubmissionSyncError] = useState('');
  const [retryingSync, setRetryingSync] = useState(false);
  const lastSubmissionPayloadRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(10);
  const [studentSession, setStudentSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const timerRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const quizStartedAtRef = useRef(null);
  const { alert } = useHybridAlert();
  const [isSpaceRace, setIsSpaceRace] = useState(false);
  const [raceId, setRaceId] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [participantName, setParticipantName] = useState('Student');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [localTeamSelection, setLocalTeamSelection] = useState(null);
  const [submittedQuestionKeys, setSubmittedQuestionKeys] = useState(() => new Set());
  const [raceData, setRaceData] = useState(null);
  const raceDataRef = useRef(null);
  const [teamAnswersForScore, setTeamAnswersForScore] = useState(null);

  const getQuestionKey = (question, index) => getStableQuestionId(question, index);

  const getAnswerForQuestion = (question, questionIndex) => {
    if (!question) return '';
    const key = getQuestionKey(question, questionIndex);
    return answers[key] ?? answers[String(key)] ?? answers[questionIndex] ?? answers[String(questionIndex)] ?? '';
  };

  const hasAnyAnswer = () =>
    quiz?.questions?.some((question, index) => {
      const value = getAnswerForQuestion(question, index);
      return value != null && String(value).trim() !== '';
    }) ?? Object.keys(answers).length > 0;

  const isSpaceRaceRoute =
    embedded ||
    Boolean(spaceRaceId) ||
    (typeof window !== 'undefined' && window.location.pathname.includes('/student/space-race/'));

  const shellClass = embedded
    ? 'min-h-0 bg-background'
    : 'min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50';

  const applyQuizTimer = (quizData, joinedAtIso = null) => {
    console.log('🕐 applyQuizTimer called with quizData:', { countdown: quizData.launchSettings?.countdown, endTime: quizData.launchSettings?.endTime, isSpaceRace });
    
    // For Space Races, check localStorage for synchronized endTime from SpaceRaceGamePanel
    if (isSpaceRace) {
      const storedEndTime = localStorage.getItem('spaceRaceEndTime');
      if (storedEndTime && !quizData.launchSettings?.endTime) {
        quizData.launchSettings = quizData.launchSettings || {};
        quizData.launchSettings.endTime = storedEndTime;
        console.log('🕐 Using stored endTime from localStorage for Space Race:', storedEndTime);
      }
    }
    
    // For Space Races, use endTime if available (synchronized timer), otherwise use quiz duration
    if (isSpaceRace && quizData.launchSettings?.endTime) {
      // Quiz has started - use synchronized endTime
      const endTime = new Date(quizData.launchSettings.endTime);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));
      console.log('🕐 Space Race: Setting timeLeft from synchronized endTime:', remaining);
      setTimeLeft(remaining);
    } else if (isSpaceRace && quizData.launchSettings?.countdown) {
      // Space Race hasn't started yet - use quiz duration
      const quizDurationSeconds = quizData.launchSettings.countdown;
      console.log('🕐 Space Race: No endTime, setting timeLeft to quiz duration:', quizDurationSeconds);
      setTimeLeft(quizDurationSeconds);
    } else if (quizData.launchSettings?.timePerStudentMinutes) {
      const studentTimeRemaining = getStudentAttemptSecondsRemaining(
        quizData.launchSettings,
        joinedAtIso
      );
      console.log('🕐 Regular quiz: Using timePerStudentMinutes:', studentTimeRemaining);
      if (studentTimeRemaining == null) {
        setTimeLeft(null);
      } else {
        setTimeLeft(studentTimeRemaining);
      }
    } else if (quizData.launchSettings?.timeLimit) {
      const timeLimitSeconds = quizData.launchSettings.timeLimit * 60;
      console.log('🕐 Regular quiz: Using timeLimit:', timeLimitSeconds);
      setTimeLeft(timeLimitSeconds);
    } else if (quizData.launchSettings?.quizAvailabilityMinutes && quizData.launchSettings?.endTime) {
      const endTime = new Date(quizData.launchSettings.endTime);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));
      console.log('🕐 Regular quiz: Using quizAvailabilityMinutes with endTime:', remaining);
      setTimeLeft(remaining);
    } else if (!isSpaceRace) {
      // For regular quizzes with no timer settings, set a reasonable default or null (no timer)
      console.log('🕐 Regular quiz: No timer settings configured, setting timer to null (no time limit)');
      setTimeLeft(null);
    }
  };

  // Load student session and quiz data
  useEffect(() => {
    let cancelled = false;

    const finishLoading = () => {
      if (!cancelled) setIsLoading(false);
    };

    const bootstrapSpaceRace = (quizData, participantData, raceIdResolved, raceSettings = null, skipShuffle = false) => {
      // Get race settings from various sources
      const settings = raceSettings || 
                      quizData?.launchSettings?.spaceRaceSettings || 
                      quizData?.spaceRaceSettings ||
                      {};

      console.log('🔧 Race settings received:', { 
        raceSettings,
        quizSettings: quizData?.launchSettings?.spaceRaceSettings,
        quizSpaceRaceSettings: quizData?.spaceRaceSettings,
        finalSettings: settings,
        shuffleQuestions: settings.shuffleQuestions,
        shuffleAnswers: settings.shuffleAnswers,
        showQuestionFeedback: settings.showQuestionFeedback,
        showFinalScore: settings.showFinalScore,
        skipShuffle
      });

      // Only shuffle if skipShuffle is false (i.e., loading from API, not from cache)
      let questions = Array.isArray(quizData.questions) ? [...quizData.questions] : [];
      
      if (!skipShuffle) {
        // Shuffle questions if enabled
        if (settings.shuffleQuestions && questions.length > 1) {
          // Use a simple Fisher-Yates shuffle with a seed based on TEAM ID for team-based shuffling
          // All members of the same team see the same question order
          const teamId = participantData?.teamId;
          if (!teamId) {
            console.warn('⚠️ No teamId found for participant, using participant ID as fallback');
          }
          // Use a more complex seed combining teamId with raceId to ensure different teams get different shuffles
          const seed = `${raceIdResolved}_team_${teamId || participantData?.id || participantData?.participantId || 'default'}`;

          // Log original question order before shuffle
          console.log('📋 Original question order:', questions.map((q, i) => `${i}: ${q.text?.substring(0, 30)}...`));

          questions = shuffleArray(questions, seed);

          // Log shuffled question order
          console.log('🔀 Shuffled question order:', questions.map((q, i) => `${i}: ${q.text?.substring(0, 30)}...`));
          console.log('🔀 Questions shuffled for team:', teamId, 'seed:', seed, 'seed type:', typeof seed, 'participant:', participantData?.id, 'raceId:', raceIdResolved);
        } else {
          console.log('⏭️ Questions NOT shuffled (disabled or not enough questions)', { shuffleEnabled: settings.shuffleQuestions, questionCount: questions.length });
        }

        // Shuffle answers within each question if enabled
        if (settings.shuffleAnswers) {
          const teamId = participantData?.teamId;
          questions = questions.map((question, qIndex) => {
            if (question.options && Array.isArray(question.options) && question.options.length > 1) {
              // Log original answer order
              console.log(`📋 Q${qIndex} Original answers:`, question.options.map((o, i) => `${i}: ${o.text?.substring(0, 20)}...`));

              // Use team ID with raceId as seed so all team members see the same answer order
              const answerSeed = `${raceIdResolved}_team_${teamId || participantData?.id || participantData?.participantId || 'default'}_q${qIndex}`;
              const shuffledOptions = shuffleArray([...question.options], answerSeed);

              // Log shuffled answer order
              console.log(`🔀 Q${qIndex} Shuffled answers:`, shuffledOptions.map((o, i) => `${i}: ${o.text?.substring(0, 20)}...`));
              console.log(`🔀 Q${qIndex} Answer seed:`, answerSeed, 'teamId:', teamId, 'raceId:', raceIdResolved);

              return {
                ...question,
                options: shuffledOptions
              };
            }
            return question;
          });
          console.log('🔀 Answers shuffled for team:', teamId, 'participant:', participantData?.id, 'raceId:', raceIdResolved);
        } else {
          console.log('⏭️ Answers NOT shuffled (disabled)');
        }
      } else {
        console.log('⏭️ Skipping shuffle - loading from cached (already shuffled) quiz');
      }

      const quizToUse = {
        ...quizData,
        id: quizData.id || effectiveQuizId,
        launched: true,
        questions,
        launchSettings: {
          ...quizData.launchSettings,
          spaceRaceSettings: settings
        }
      };

      console.log('🚀 bootstrapSpaceRace called:', { 
        quizId: quizToUse.id, 
        questionCount: quizToUse.questions?.length,
        hasQuestions: !!quizToUse.questions,
        raceId: raceIdResolved,
        settingsApplied: {
          shuffleQuestions: settings.shuffleQuestions,
          shuffleAnswers: settings.shuffleAnswers,
          showQuestionFeedback: settings.showQuestionFeedback,
          showFinalScore: settings.showFinalScore
        }
      });

      setQuiz(quizToUse);
      setIsSpaceRace(true);
      setRaceId(raceIdResolved);
      setTeamId(participantData?.teamId ?? null);
      setParticipantId(participantData?.id ?? null);
      setParticipantName(participantData?.name || 'Student');
      applyQuizTimer(quizToUse);
      
      // Save with team-specific cache key to ensure different teams get different shuffles
      const teamId = participantData?.teamId || 'default';
      const teamCacheKey = `spaceRaceQuiz_team_${teamId}`;
      localStorage.setItem(teamCacheKey, JSON.stringify(quizToUse));
      console.log('💾 Saved quiz with team-specific cache key:', teamCacheKey);
      
      return true;
    };

    // Fisher-Yates shuffle with seed for consistent shuffling per participant
    const shuffleArray = (array, seed) => {
      const seededRandom = seededRandomGenerator(seed);
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // Simple seeded random number generator with better seed distribution
    const seededRandomGenerator = (seed) => {
      let state;
      if (typeof seed === 'string') {
        // Better string hashing to ensure different team IDs produce different states
        state = seed.split('').reduce((acc, char, idx) => {
          return acc + char.charCodeAt(0) * (idx + 1);
        }, 0);
      } else if (typeof seed === 'number') {
        state = seed;
      } else {
        state = String(seed).split('').reduce((acc, char, idx) => {
          return acc + char.charCodeAt(0) * (idx + 1);
        }, 0);
      }
      console.log('🎲 Seeded random generator initialized with seed:', seed, 'converted to state:', state);
      return () => {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
      };
    };

    // Start quiz timer for Space Race
    const startQuizTimer = async (raceIdResolved, quizData) => {
      try {
        const timerSeconds = quizData?.launchSettings?.countdown ||
                            quizData?.launchSettings?.timerSeconds ||
                            900; // Default 15 minutes
        console.log('🚀 Starting quiz timer for Space Race:', { raceId: raceIdResolved, timerSeconds, quizId: effectiveQuizId });

        const res = await spaceRacesAPI.startQuiz(raceIdResolved, {
          quizId: effectiveQuizId,
          timerSeconds
        });

        console.log('🚀 Start quiz API response:', res.data);
        if (res.data?.success) {
          console.log('✅ Quiz timer started successfully:', res.data);
          // If backend returned an endTime (quiz already started), update quiz data with it
          if (res.data.endTime) {
            quizData.launchSettings = quizData.launchSettings || {};
            quizData.launchSettings.endTime = res.data.endTime;
            console.log('🕐 Updated quiz endTime from backend:', res.data.endTime);
            // Re-apply timer with the synchronized endTime
            applyQuizTimer(quizData);
          }
          return res.data;
        } else {
          console.log('⚠️ Start quiz API returned unsuccessful:', res.data);
        }
      } catch (error) {
        console.error('❌ Failed to start quiz timer:', error);
        // Don't block the quiz if timer start fails
      }
    };

    const loadSpaceRaceQuiz = async () => {
      const participantData =
        spaceRaceParticipant ||
        loadSpaceRaceParticipant(spaceRaceId) ||
        loadSpaceRaceParticipant(null);
      const raceDataStored = JSON.parse(localStorage.getItem('spaceRaceData') || 'null');
      const raceIdResolved = spaceRaceId || raceDataStored?.id || participantData?.raceId;
      const quizIdResolved = effectiveQuizId || raceDataStored?.quizId;

      console.log('🔍 loadSpaceRaceQuiz called:', { 
        spaceRaceId, 
        effectiveQuizId, 
        raceIdResolved, 
        quizIdResolved, 
        hasParticipant: !!participantData, 
        hasRaceData: !!raceDataStored,
        participantTeamId: participantData?.teamId,
        participantId: participantData?.id
      });

      // ALWAYS fetch race data from API to get synchronized endTime
      // This is critical for timer synchronization across team members
      let raceData = null;
      if (raceIdResolved) {
        try {
          console.log('🌐 Fetching race from API for synchronized timer:', raceIdResolved);
          const res = await spaceRacesAPI.getById(raceIdResolved);
          console.log('🌐 API response:', res.data);
          if (res.data?.success) {
            raceData = res.data.data;
            console.log('📦 Race data fetched:', { 
              id: raceData.id, 
              endTime: raceData.endTime, 
              quizStartedAt: raceData.quizStartedAt,
              status: raceData.status 
            });
          }
        } catch (error) {
          console.warn('Space race API fetch failed:', error);
        }
      }

      // If we have race data with quiz, use it (always fresh)
      if (raceData?.quiz) {
        const fromApi = {
          ...raceData.quiz,
          id: raceData.quizId || quizIdResolved,
          launched: true,
          launchSettings: {
            ...(raceData.quiz.launchSettings || {}),
            endTime: raceData.endTime || null, // Use synchronized endTime from race
            timeLimit: raceData.timerMinutes || raceData.quiz.launchSettings?.timeLimit,
            countdown: raceData.settings?.countdown || raceData.settings?.timerSeconds || raceData.timerSeconds,
          },
        };
        console.log('📦 Quiz from API with synchronized timer:', { 
          id: fromApi.id, 
          questionCount: fromApi.questions?.length,
          endTime: fromApi.launchSettings.endTime 
        });
        // Pass skipShuffle=false to always shuffle based on team ID
        if (bootstrapSpaceRace(fromApi, participantData, raceIdResolved, raceData.settings, false)) {
          // Start quiz timer when quiz loads
          await startQuizTimer(raceIdResolved, fromApi);
          // Re-apply timer after startQuizTimer to ensure synchronized endTime is used
          applyQuizTimer(fromApi);
          return true;
        }
      }

      // Fallback to cache if API fails
      const teamId = participantData?.teamId || 'default';
      const teamCacheKey = `spaceRaceQuiz_team_${teamId}`;

      const cachedQuizRaw = localStorage.getItem(teamCacheKey);
      console.log('🔍 Team-specific cached quiz raw (fallback):', cachedQuizRaw ? 'EXISTS' : 'NULL', 'key:', teamCacheKey);

      if (cachedQuizRaw) {
        try {
          const parsed = JSON.parse(cachedQuizRaw);
          const normalized = { ...parsed, id: parsed.id || quizIdResolved };
          console.log('📦 Cached quiz found (fallback):', { id: normalized.id, questionCount: normalized.questions?.length, hasQuestions: !!normalized.questions, teamId });
          if (!quizIdResolved || String(normalized.id) === String(quizIdResolved)) {
            // Pass skipShuffle=true because cached quiz is already shuffled
            if (bootstrapSpaceRace(normalized, participantData, raceIdResolved, raceDataStored?.settings, true)) {
              // Start quiz timer when quiz loads from cache
              await startQuizTimer(raceIdResolved, normalized);
              // Re-apply timer after startQuizTimer to ensure synchronized endTime is used
              applyQuizTimer(normalized);
              return true;
            }
          } else {
            console.log('⚠️ Quiz ID mismatch:', { cached: normalized.id, expected: quizIdResolved });
          }
        } catch (e) {
          console.error('Error parsing cached quiz:', e);
          // continue to fallbacks
        }
      }

      // Check old generic cache key for backward compatibility, but reshuffle based on team ID
      const oldGenericCacheRaw = localStorage.getItem('spaceRaceQuiz');
      if (oldGenericCacheRaw) {
        try {
          const parsed = JSON.parse(oldGenericCacheRaw);
          const normalized = { ...parsed, id: parsed.id || quizIdResolved };
          console.log('📦 Found old generic cached quiz, will reshuffle for team:', { id: normalized.id, questionCount: normalized.questions?.length, teamId });
          if (!quizIdResolved || String(normalized.id) === String(quizIdResolved)) {
            // Pass skipShuffle=false to reshuffle based on team ID
            if (bootstrapSpaceRace(normalized, participantData, raceIdResolved, raceDataStored?.settings, false)) {
              // Start quiz timer when quiz loads from old cache
              await startQuizTimer(raceIdResolved, normalized);
              // Re-apply timer after startQuizTimer to ensure synchronized endTime is used
              applyQuizTimer(normalized);
              return true;
            }
          }
        } catch (e) {
          console.error('Error parsing old generic cached quiz:', e);
        }
      }

      if (raceDataStored?.quiz) {
        const fromRace = {
          ...raceDataStored.quiz,
          id: quizIdResolved || raceDataStored.quiz.id,
        };
        console.log('📦 Quiz from raceDataStored (fallback):', { id: fromRace.id, questionCount: fromRace.questions?.length, hasQuestions: !!fromRace.questions });
        // Pass skipShuffle=false to ensure team-based shuffling is applied
        if (bootstrapSpaceRace(fromRace, participantData, raceIdResolved, raceDataStored?.settings, false)) {
          // Start quiz timer when quiz loads from race data
          await startQuizTimer(raceIdResolved, fromRace);
          // Re-apply timer after startQuizTimer to ensure synchronized endTime is used
          applyQuizTimer(fromRace);
          return true;
        }
      }

      console.error('❌ All quiz loading methods failed');
      setError('Quiz not found or not available');
      return false;
    };

    const loadRegularQuiz = () => {
      const sessionData = localStorage.getItem('studentSession');
      const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');

      if (sessionData) {
        const session = JSON.parse(sessionData);
        const sessionQuizId = String(session.quizId);
        const paramQuizId = String(effectiveQuizId);

        if (!session.isLocked || sessionQuizId !== paramQuizId) {
          localStorage.removeItem('studentSession');
          navigate('/student/join', { replace: true });
          return;
        }

        setStudentSession(session);

        if (session.participantId) {
          setParticipantId(session.participantId);
          persistQuizParticipantSession(sessionQuizId, {
            participantId: session.participantId,
            sessionCode: session.sessionCode,
            studentName: session.studentName,
            joinedAt: session.joinedAt,
            studentUid: session.studentUid,
            studentEmail: session.studentEmail,
          });
        }

        const foundQuiz = session.quiz || savedQuizzes.find((q) => String(q.id) === paramQuizId);
        const isLaunched = !!foundQuiz && (!!foundQuiz.launched || !!session.quiz);

        if (foundQuiz && isLaunched) {
          if (isQuizJoinWindowExpired(foundQuiz.launchSettings)) {
            setError('This quiz is no longer joinable.');
            return;
          }

          if (
            foundQuiz.launchSettings?.oneAttempt &&
            hasLocalQuizSubmission(paramQuizId, {
              participantId: session.participantId,
              studentUid: session.studentUid,
              studentEmail: session.studentEmail,
              studentName: session.studentName,
            })
          ) {
            setError('You have already completed this quiz.');
            return;
          }

          if (foundQuiz.launchSettings?.timePerStudentMinutes) {
            const attemptRemaining = getStudentAttemptSecondsRemaining(
              foundQuiz.launchSettings,
              session.joinedAt
            );
            if (attemptRemaining !== null && attemptRemaining <= 0) {
              setError('Your time for this quiz has expired.');
              return;
            }
          }

          let quizToUse = normalizeQuizForClient({ ...foundQuiz, launched: true });
          quizToUse = applyQuizShuffleSettings(quizToUse, session.participantId);
          setQuiz(quizToUse);
          applyQuizTimer(quizToUse, session.joinedAt);
        } else {
          setError('Quiz not found or not launched');
        }
        return;
      }

      const savedQuiz = savedQuizzes.find((q) => String(q.id) === String(effectiveQuizId));
      if (savedQuiz && savedQuiz.launched) {
        setQuiz(normalizeQuizForClient(savedQuiz));
        applyQuizTimer(savedQuiz);
      } else {
        setError('Quiz not found or not available');
      }
    };

    (async () => {
      setIsLoading(true);
      setError(null);

      console.log('🔍 Quiz loading started:', { 
        isSpaceRaceRoute, 
        effectiveQuizId, 
        spaceRaceId, 
        embedded,
        hasSpaceRaceQuiz: !!localStorage.getItem('spaceRaceQuiz'),
        hasSpaceRaceData: !!localStorage.getItem('spaceRaceData')
      });

      if (isSpaceRaceRoute) {
        await loadSpaceRaceQuiz();
      } else {
        loadRegularQuiz();
      }

      finishLoading();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveQuizId,
    embedded,
    spaceRaceId,
    spaceRaceParticipant,
    navigate,
    isSpaceRaceRoute,
  ]);

  useEffect(() => {
    if (!spaceRaceParticipant) return;
    if (spaceRaceParticipant.teamId != null) setTeamId(spaceRaceParticipant.teamId);
    if (spaceRaceParticipant.id) setParticipantId(spaceRaceParticipant.id);
    if (spaceRaceParticipant.name) setParticipantName(spaceRaceParticipant.name);
  }, [spaceRaceParticipant]);

  useEffect(() => {
    if (!quiz || isSubmitted) return;
    let startedAt = Date.now();
    try {
      const raw = localStorage.getItem('studentSession');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.joinedAt) {
        const joined = new Date(parsed.joinedAt).getTime();
        if (!Number.isNaN(joined)) startedAt = joined;
      }
    } catch {
      // ignore
    }
    quizStartedAtRef.current = startedAt;
  }, [quiz?.id, isSubmitted]);

  // Listen to team-specific timer for real-time updates
  useEffect(() => {
    if (!isSpaceRace || !raceId || !teamId) return;

    const teamTimerPath = `space_race_team_timers/${raceId}/team_${teamId}`;
    const teamTimerRef = dbRef(db, teamTimerPath);

    const handleTeamTimerUpdate = (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('🔄 Team timer updated:', { teamId, quizStartedAt: data.quizStartedAt, endTime: data.endTime });
        
        if (data.quizStartedAt && data.endTime) {
          const endTime = new Date(data.endTime);
          const now = new Date();
          const remaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));
          setTimeLeft(remaining);
          console.log('⏱️ Team timer:', remaining, 'seconds remaining for team', teamId);
        } else if (data.duration) {
          setTimeLeft(data.duration);
          console.log('⏱️ Quiz not started, showing duration:', data.duration);
        } else {
          setTimeLeft(300);
        }
      } else {
        console.log('⚠️ No team timer found for team:', teamId, '- showing default');
        setTimeLeft(300);
      }
    };

    let unsubscribe;
    try {
      unsubscribe = onValue(teamTimerRef, handleTeamTimerUpdate);
    } catch (error) {
      console.error('❌ Error setting up team timer listener:', error);
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('❌ Error unsubscribing:', error);
        }
      }
    };
  }, [isSpaceRace, raceId, teamId]);

  // Local countdown timer - decrements every second from the Firebase-synced time
  useEffect(() => {
    if (!isSpaceRace || timeLeft === null || isSubmitted || timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return prev;
        const newTime = prev - 1;
        console.log('⏱️ Countdown:', newTime, 'seconds for team', teamId);
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSpaceRace, isSubmitted, teamId]);

  // Auto-submit when quiz timer reaches 0
  useEffect(() => {
    if (timeLeft !== 0 || isSubmitted || !quiz) return;

    if (isSpaceRace) {
      const hasStartedQuiz = hasAnyAnswer();
      if (!hasStartedQuiz) return;
    }

    console.log('⏰ Quiz time is up! Auto-submitting...');
    handleSubmitQuiz();
  }, [timeLeft, isSubmitted, quiz, answers, isSpaceRace]);

  // Prevent navigation and refresh
  useEffect(() => {
    const preventNavigation = (e) => {
      if (!isSubmitted && navigationBlocked) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    const preventRefresh = (e) => {
      if (!isSubmitted && navigationBlocked) {
        e.preventDefault();
        return '';
      }
    };

    if (navigationBlocked && !isSubmitted) {
      window.addEventListener('beforeunload', preventNavigation);
      window.addEventListener('popstate', preventNavigation);
    }

    return () => {
      window.removeEventListener('beforeunload', preventNavigation);
      window.removeEventListener('popstate', preventNavigation);
    };
  }, [isSubmitted, navigationBlocked]);

  // Block navigation once quiz is loaded
  useEffect(() => {
    if (quiz && !isSubmitted) {
      setNavigationBlocked(true);
    }
  }, [quiz, isSubmitted]);

  const currentQuestionData = quiz?.questions?.[currentQuestion];
  const currentQuestionId = currentQuestionData
    ? getQuestionKey(currentQuestionData, currentQuestion)
    : null;

  const teamSelectionPath =
    isSpaceRace && raceId && teamId != null && currentQuestionId
      ? `space_race_team_selection/${raceId}/team_${teamId}/question_${currentQuestionId}`
      : null;

  console.log('📍 Team selection path:', teamSelectionPath, { isSpaceRace, raceId, teamId, currentQuestionId });

  const { value: teamSelectionRtdb } = useRtdbValue(teamSelectionPath, {
    enabled: Boolean(teamSelectionPath),
  });

  const teamSelection = teamSelectionRtdb || localTeamSelection;

  const isCurrentQuestionSubmitted =
    (currentQuestionId ? submittedQuestionKeys.has(currentQuestionId) : false);

  const syncTeamSelectionFromServer = useCallback(async () => {
    if (!isSpaceRace || !raceId || teamId == null || !currentQuestionId) return null;
    try {
      const response = await spaceRacesAPI.getTeamSelection(
        raceId,
        teamId,
        currentQuestionId
      );
      if (response.data?.success && response.data.data) {
        const data = response.data.data;
        // Sync the selection option AND submitted status from Firebase
        // This allows team members to see when another member has submitted
        const isSubmittedByTeam = data.submitted === true;
        
        setLocalTeamSelection({
          selectedOption: data.selectedOption,
          selectedBy: data.selectedBy,
          selectedByName: data.selectedByName,
          selectedAt: data.selectedAt,
          // Use Firebase submitted status to lock answers for all team members
          submitted: isSubmittedByTeam
        });
        
        // Also update local submittedQuestionKeys to match Firebase state
        if (isSubmittedByTeam && !submittedQuestionKeys.has(currentQuestionId)) {
          setSubmittedQuestionKeys((prev) => {
            const next = new Set(prev);
            next.add(currentQuestionId);
            return next;
          });
        }
        
        return data;
      }
    } catch (error) {
      console.warn('Team selection sync failed:', error);
    }
    return null;
  }, [isSpaceRace, raceId, teamId, currentQuestionId]);

  useEffect(() => {
    setLocalTeamSelection(null);
    syncTeamSelectionFromServer();
    const interval = setInterval(syncTeamSelectionFromServer, 1000); // Reduced from 2000 to 1000 for faster updates
    return () => clearInterval(interval);
  }, [syncTeamSelectionFromServer]);

  useEffect(() => {
    if (teamSelectionRtdb) {
      console.log('🔄 Firebase team selection updated:', {
        teamSelectionRtdb,
        currentQuestionId,
        isSubmitted: teamSelectionRtdb.submitted
      });
      
      // Sync the selection option AND submitted status from Firebase
      // This allows team members to see when another member has submitted
      const isSubmittedByTeam = teamSelectionRtdb.submitted === true;
      
      setLocalTeamSelection({
        selectedOption: teamSelectionRtdb.selectedOption,
        selectedBy: teamSelectionRtdb.selectedBy,
        selectedByName: teamSelectionRtdb.selectedByName,
        selectedAt: teamSelectionRtdb.selectedAt,
        // Use Firebase submitted status to lock answers for all team members
        submitted: isSubmittedByTeam
      });
      
      // Also update local submittedQuestionKeys to match Firebase state
      if (isSubmittedByTeam && !submittedQuestionKeys.has(currentQuestionId)) {
        console.log('🔒 Locking question for team:', currentQuestionId);
        setSubmittedQuestionKeys((prev) => {
          const next = new Set(prev);
          next.add(currentQuestionId);
          return next;
        });
      }
    }
  }, [teamSelectionRtdb, currentQuestionId]);

  const displaySelectedOption =
    getAnswerForQuestion(currentQuestionData, currentQuestion) ||
    teamSelection?.selectedOption ||
    '';

  // Don't auto-update user's answer from teammate selection - let user keep their own choice
  // Teammate selection is only for display/coordination, not to override user's answer

  // Timer effect - use Firebase real-time updates for Space Race, local countdown for regular quiz
  useEffect(() => {
    if (timeLeft === null || isSubmitted) return;

    // For Space Race, rely on Firebase real-time updates instead of local countdown
    // This ensures all team members see the exact same time
    if (isSpaceRace) {
      const checkTimeExpired = () => {
        // Only auto-submit if student has actually started the quiz (answered at least one question)
        const hasStartedQuiz = hasAnyAnswer();
        if (timeLeft <= 0 && !isSubmitted && hasStartedQuiz) {
          console.log('⏰ Time expired! Auto-submitting quiz...');
          handleSubmitQuiz();
        }
      };

      // Check every second if time has expired
      timerRef.current = setInterval(checkTimeExpired, 1000);
      return () => clearInterval(timerRef.current);
    }

    // For regular quiz, use local countdown timer synced to joinedAt
    timerRef.current = setInterval(() => {
      if (!isSpaceRace && quiz?.launchSettings?.timePerStudentMinutes) {
        let joinedAtIso = null;
        try {
          const raw = localStorage.getItem('studentSession');
          const parsed = raw ? JSON.parse(raw) : null;
          joinedAtIso = parsed?.joinedAt || null;
        } catch {
          joinedAtIso = null;
        }
        const remaining = getStudentAttemptSecondsRemaining(
          quiz.launchSettings,
          joinedAtIso
        );
        if (remaining == null) return;
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          console.log('⏰ Time expired! Auto-submitting quiz...');
          handleSubmitQuiz();
        }
        return;
      }

      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current);
          console.log('⏰ Time expired! Auto-submitting quiz...');
          handleSubmitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft, isSubmitted, isSpaceRace]);

  const handleAnswerChange = async (questionIndex, answer) => {
    if (isSpaceRace && isCurrentQuestionSubmitted && questionIndex === currentQuestion) {
      return;
    }

    const question = quiz?.questions?.[questionIndex];
    const answerKey = question ? getQuestionKey(question, questionIndex) : String(questionIndex);

    setAnswers((prev) => ({
      ...prev,
      [answerKey]: answer,
    }));

    if (isSpaceRace && raceId && teamId != null && participantId && quiz?.questions?.[questionIndex]) {
      try {
        const question = quiz.questions[questionIndex];
        const questionId = getQuestionKey(question, questionIndex);
        setLocalTeamSelection((prev) => ({
          ...(prev || {}),
          selectedOption: answer,
          selectedBy: participantId,
          selectedByName: participantName,
          submitted: false,
        }));
        await spaceRacesAPI.setTeamSelection(raceId, {
          participantId,
          teamId,
          questionId,
          selectedOption: answer,
          senderName: participantName,
        });
      } catch (error) {
        console.error('❌ Failed to synchronize team selection:', error);
      }
    }
  };

  const handleSubmitTeamAnswer = async () => {
    if (!isSpaceRace || !quiz || !raceId || !participantId || isCurrentQuestionSubmitted) return;

    const question = quiz.questions[currentQuestion];
    const questionId = getQuestionKey(question, currentQuestion);
    // Prioritize user's current selection over team selection to avoid submitting wrong answer
    const answer =
      getAnswerForQuestion(question, currentQuestion) ||
      displaySelectedOption ||
      teamSelection?.selectedOption;

    if (!answer || String(answer).trim() === '') {
      alert.toast.error('Select an answer with your team first.');
      return;
    }

    setIsSubmittingQuestion(true);
    try {
      console.log('🚀 Submitting team answer:', { raceId, participantId, questionId, answer, questionIndex: currentQuestion, teamId });
      
      const response = await spaceRacesAPI.submitAnswer(raceId, {
        participantId,
        questionId,
        answer,
        questionIndex: currentQuestion,
      });

      console.log('✅ Team answer submitted successfully:', response.data);

      if (response.data?.success) {
        setLocalTeamSelection((prev) => ({
          ...(prev || {}),
          selectedOption: answer,
          submitted: true,
          submittedBy: participantId,
        }));
        setSubmittedQuestionKeys((prev) => {
          const next = new Set(prev);
          next.add(questionId);
          return next;
        });
        // Show feedback based on settings
        const showFeedback = quiz?.launchSettings?.spaceRaceSettings?.showQuestionFeedback || quiz?.spaceRaceSettings?.showQuestionFeedback || false;
        if (showFeedback) {
          alert.toast.success(
            response.data.isCorrect ? '✅ Correct answer!' : '❌ Incorrect answer'
          );
        } else {
          alert.toast.success('Answer submitted for your team.');
        }
        if (currentQuestion < quiz.questions.length - 1) {
          setCurrentQuestion((prev) => prev + 1);
        }
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || '';
      if (errMsg.toLowerCase().includes('already submitted')) {
        const synced = await syncTeamSelectionFromServer();
        setSubmittedQuestionKeys((prev) => {
          const next = new Set(prev);
          next.add(questionId);
          return next;
        });
        if (synced?.selectedOption) {
          setAnswers((prev) => ({
            ...prev,
            [getQuestionKey(quiz.questions[currentQuestion], currentQuestion)]: synced.selectedOption,
          }));
        }
        if (currentQuestion < quiz.questions.length - 1) {
          setCurrentQuestion((prev) => prev + 1);
        } else {
          alert.toast.info('This question was already submitted for your team.');
        }
      } else {
        alert.toast.error(errMsg || 'Failed to submit team answer.');
      }
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const updateLatestSubmission = ({ correctAnswers, totalQuestions, percentage, points, source }) => {
    try {
      const submissions = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
      
      // If no submissions exist, create one (for Space Race case)
      if (!submissions.length) {
        const newSubmission = {
          studentName: studentSession?.studentName || 'Student',
          sessionCode: studentSession?.sessionCode || '',
          quizId: quiz?.id || '',
          quizTitle: quiz?.title || '',
          answers: answers || {},
          score: Number.isFinite(correctAnswers) ? correctAnswers : 0,
          totalQuestions: Number.isFinite(totalQuestions) ? totalQuestions : 0,
          percentage: Number.isFinite(percentage) ? percentage : 0,
          points: Number.isFinite(points) ? points : 0,
          submittedAt: new Date().toISOString(),
          source: source || 'spaceRace'
        };
        submissions.push(newSubmission);
        localStorage.setItem('quizSubmissions', JSON.stringify(submissions));
        console.log('✅ Created new submission record:', newSubmission);
        return;
      }

      const lastIndex = submissions.length - 1;
      const lastSubmission = submissions[lastIndex];

      submissions[lastIndex] = {
        ...lastSubmission,
        score: Number.isFinite(correctAnswers) ? correctAnswers : lastSubmission.score,
        totalQuestions: Number.isFinite(totalQuestions) ? totalQuestions : lastSubmission.totalQuestions,
        percentage: Number.isFinite(percentage) ? percentage : lastSubmission.percentage,
        points: Number.isFinite(points) ? points : lastSubmission.points,
        source: source || lastSubmission.source
      };

      localStorage.setItem('quizSubmissions', JSON.stringify(submissions));
      console.log('✅ Updated submission record:', submissions[lastIndex]);
    } catch (err) {
      console.warn('Failed to update local submission:', err);
    }
  };

  const handleRetrySubmission = async () => {
    const pending = lastSubmissionPayloadRef.current;
    if (!pending?.quizId || !pending?.submissionData?.participantId) {
      alert.toast.error('Cannot retry — session info is missing. Rejoin the quiz and submit again.');
      return;
    }

    setRetryingSync(true);
    try {
      const syncResult = await submitQuizWithRetry(pending.quizId, pending.submissionData);
      if (syncResult.success) {
        saveLocalQuizSubmission({
          ...pending.baseLocalSubmission,
          score: syncResult.data.correctAnswers,
          correctAnswers: syncResult.data.correctAnswers,
          totalQuestions: syncResult.data.totalQuestions ?? pending.baseLocalSubmission.totalQuestions,
          percentage: syncResult.data.percentage,
          points: syncResult.data.score,
          submittedAt: syncResult.data.submittedAt || pending.baseLocalSubmission.submittedAt,
          serverSynced: true,
          syncError: null,
        });
        setSubmissionSyncFailed(false);
        setSubmissionSyncError('');
        localStorage.removeItem('studentSession');
        clearQuizParticipantSession(pending.quizId);
        alert.toast.success('Submission synced successfully!');
      } else {
        setSubmissionSyncError(syncResult.error || 'Retry failed');
        alert.toast.error(syncResult.error || 'Retry failed. Please try again.');
      }
    } finally {
      setRetryingSync(false);
    }
  };

  const handleSubmitQuiz = async () => {
    let score = 0; // Initialize score at the beginning of function
    let percentage = 0; // Initialize percentage at the beginning of function
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const validation = validateQuizData(quiz);
      if (!validation.isValid) {
        console.warn('⚠️ Quiz data validation warnings (scoring will use server-side quiz):', validation.issues);
      }

      // For Space Race, fetch the participant's pre-calculated score from Firebase
      // The backend already calculates team scores and assigns them to all team members
      // This ensures all team members get the same score
      let scoringResult;
      if (isSpaceRace && raceId && participantId) {
        try {
          // Fetch participant data from Firebase to get the team-calculated score
          const participantPath = `space_race_participants/${raceId}/${participantId}`;
          const participantRef = dbRef(db, participantPath);
          const participantSnap = await get(participantRef);
          
          if (participantSnap.exists()) {
            const participantData = participantSnap.val();
            const teamScore = participantData.score || 0;
            const teamAnswers = participantData.answers || [];
            
            // Calculate percentage from team answers
            const correctCount = teamAnswers.filter(a => a.isCorrect).length;
            const totalQuestionsCount = quiz.questions.length;
            const teamPercentage = totalQuestionsCount > 0 ? Math.round((correctCount / totalQuestionsCount) * 100) : 0;
            
            scoringResult = {
              score: teamScore,
              correctAnswers: correctCount,
              totalQuestions: totalQuestionsCount,
              unansweredCount: 0,
              percentage: teamPercentage,
              points: teamScore,
              teamAnswers: teamAnswers
            };
            
            console.log('🎯 Using team-calculated score from Firebase:', {
              teamScore,
              correctCount,
              totalQuestionsCount,
              teamPercentage,
              teamAnswersCount: teamAnswers.length
            });
          } else {
            console.log('⚠️ Participant not found in Firebase, falling back to local calculation');
            // Fallback to local calculation with team answers
            const effectiveAnswers = normalizeAnswersByQuestionId(quiz.questions, answers);
            scoringResult = calculateScore(quiz.questions, effectiveAnswers, quiz.type);
          }
        } catch (error) {
          console.error('Error fetching participant score from Firebase:', error);
          // Fallback to local calculation
          const effectiveAnswers = normalizeAnswersByQuestionId(quiz.questions, answers);
          scoringResult = calculateScore(quiz.questions, effectiveAnswers, quiz.type);
        }
      } else {
        // For regular quiz, use local calculation with questionId-keyed answers
        const effectiveAnswers = normalizeAnswersByQuestionId(quiz.questions, answers);
        scoringResult = calculateScore(quiz.questions, effectiveAnswers, quiz.type);
      }
      
      console.log('🎯 Final scoring result:', scoringResult);
      
      const { score: totalPoints, correctAnswers, totalQuestions, unansweredCount, percentage } = scoringResult;
      
      console.log('🎯 Score Summary:', {
        correctAnswers,
        totalQuestions,
        percentage,
        totalPoints,
        unansweredCount,
        grade: percentage >= 60 ? 'PASS' : 'FAIL'
      });

      // Ensure we always have a local submission record (Space Race join doesn't always set studentSession)
      const storedParticipant =
        loadSpaceRaceParticipant(spaceRaceId) || loadSpaceRaceParticipant(null);

      let quizSession = studentSession;
      if (!quizSession) {
        try {
          const raw = localStorage.getItem('studentSession');
          quizSession = raw ? JSON.parse(raw) : null;
        } catch {
          quizSession = null;
        }
      }

      const participantBackup = readQuizParticipantSession(quiz.id);
      const effectiveStudentName =
        quizSession?.studentName ||
        participantBackup?.studentName ||
        storedParticipant?.name ||
        'Student';
      const effectiveSessionCode =
        quizSession?.sessionCode ||
        participantBackup?.sessionCode ||
        sessionStorage.getItem('sessionCode') ||
        '';
      const effectiveParticipantId =
        quizSession?.participantId ||
        participantId ||
        participantBackup?.participantId ||
        storedParticipant?.id ||
        null;
      const loggedInStudent = getStoredStudentSession();
      const effectiveStudentUid =
        quizSession?.studentUid ||
        participantBackup?.studentUid ||
        storedParticipant?.studentUid ||
        loggedInStudent?.uid ||
        null;
      const effectiveStudentEmail =
        quizSession?.studentEmail ||
        participantBackup?.studentEmail ||
        storedParticipant?.studentEmail ||
        loggedInStudent?.email ||
        null;

      const timeTaken = (() => {
        if (quiz.launchSettings?.timeLimit != null && timeLeft != null) {
          return Math.max(1, Math.round(quiz.launchSettings.timeLimit * 60 - timeLeft));
        }
        if (quiz.launchSettings?.timePerStudentMinutes != null && timeLeft != null) {
          return Math.max(1, Math.round(quiz.launchSettings.timePerStudentMinutes * 60 - timeLeft));
        }
        if (quizStartedAtRef.current) {
          return Math.max(1, Math.round((Date.now() - quizStartedAtRef.current) / 1000));
        }
        return 1;
      })();

      // For Space Race, use team answers from Firebase for submission record
      const submissionAnswers = isSpaceRace && scoringResult
        ? (scoringResult.teamAnswers || answers)
        : normalizeAnswersByQuestionId(quiz.questions, answers);
      
      const baseLocalSubmission = {
        studentName: effectiveStudentName,
        sessionCode: effectiveSessionCode,
        quizId: quiz.id,
        participantId: effectiveParticipantId,
        quizTitle: quiz.title,
        quizType: quiz.type,
        questions: Array.isArray(quiz.questions)
          ? quiz.questions
          : quiz.questions && typeof quiz.questions === 'object'
          ? Object.keys(quiz.questions)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => quiz.questions[k])
          : [],
        answers: submissionAnswers,
        score: correctAnswers,
        correctAnswers,
        totalQuestions: quiz.questions.length,
        percentage: percentage,
        points: totalPoints,
        submittedAt: new Date().toISOString(),
        timeTaken: timeTaken,
        source: localStorage.getItem('spaceRaceData') ? 'spaceRace' : 'quiz',
        serverSynced: false,
        ...(effectiveStudentUid ? { studentUid: effectiveStudentUid } : {}),
        ...(effectiveStudentEmail ? { studentEmail: effectiveStudentEmail } : {}),
      };

      const submissionData = {
        participantId: effectiveParticipantId,
        studentName: effectiveStudentName,
        sessionCode: effectiveSessionCode,
        answers: submissionAnswers,
        timeTaken,
        raceId: isSpaceRace ? raceId : undefined,
        ...(effectiveStudentUid ? { studentUid: effectiveStudentUid } : {}),
        ...(effectiveStudentEmail ? { studentEmail: effectiveStudentEmail } : {}),
      };

      lastSubmissionPayloadRef.current = { quizId: quiz.id, submissionData, baseLocalSubmission };

      let serverSubmitSucceeded = false;

      if (!effectiveParticipantId) {
        const syncError = 'Missing participant session. Please rejoin the quiz code and submit again.';
        setSubmissionSyncFailed(true);
        setSubmissionSyncError(syncError);
        saveLocalQuizSubmission({ ...baseLocalSubmission, serverSynced: false, syncError });
        alert.toast.error(syncError);
      } else {
        console.log('🚀 Submitting quiz to server:', {
          quizId: quiz.id,
          participantId: effectiveParticipantId,
          studentName: effectiveStudentName,
          sessionCode: effectiveSessionCode,
          answerCount: Object.keys(submissionAnswers || {}).length,
        });

        const syncResult = await submitQuizWithRetry(quiz.id, submissionData);

        if (syncResult.success) {
          serverSubmitSucceeded = true;
          setSubmissionSyncFailed(false);
          setSubmissionSyncError('');

          const serverScore = syncResult.data.score;
          const serverCorrectAnswers = syncResult.data.correctAnswers;
          const serverPercentage = syncResult.data.percentage;

          saveLocalQuizSubmission({
            ...baseLocalSubmission,
            score: serverCorrectAnswers,
            correctAnswers: serverCorrectAnswers,
            totalQuestions: quiz.questions.length,
            percentage: serverPercentage,
            points: serverScore,
            submittedAt: syncResult.data.submittedAt || baseLocalSubmission.submittedAt,
            serverSynced: true,
            syncError: null,
          });

          score = serverCorrectAnswers;
          percentage = serverPercentage;

          if (isSpaceRace && raceId && teamId) {
            try {
              const teamScorePath = `space_race_team_scores/${raceId}/team_${teamId}`;
              const teamScoreData = {
                score: serverScore,
                percentage: serverPercentage,
                correctAnswers: serverCorrectAnswers,
                lastUpdatedBy: participantId,
                lastUpdatedAt: new Date().toISOString(),
              };

              await dbSet(dbRef(db, teamScorePath), teamScoreData);
            } catch (error) {
              console.error('❌ Failed to synchronize team score to Firebase:', error);
            }
          }
        } else {
          const syncError =
            syncResult.error ||
            'Submission failed to reach the server. Your answers are saved on this device.';
          setSubmissionSyncFailed(true);
          setSubmissionSyncError(syncError);
          saveLocalQuizSubmission({
            ...baseLocalSubmission,
            serverSynced: false,
            syncError,
            lastSyncAttempt: new Date().toISOString(),
          });
          alert.toast.error(`${syncError} Tap "Retry submission" on the results screen.`);
        }
      }

      // Check if this is a Space Race quiz and submit answers to Space Race API
      const spaceRaceQuiz = localStorage.getItem('spaceRaceQuiz');
      const spaceRaceData = localStorage.getItem('spaceRaceData');
      
      if (isSpaceRace && spaceRaceQuiz && spaceRaceData) {
        try {
          const raceData = JSON.parse(spaceRaceData);
          const participantData =
            loadSpaceRaceParticipant(raceData?.id) || loadSpaceRaceParticipant(null) || {};
          
          let answerSubmissionFailed = false;
          let score = 0; // Declare score variable for Space Race section
          let percentage = 0; // Declare percentage variable for Space Race section
          
          // Submit each answer to Space Race API using shared scoring utility
          for (let i = 0; i < quiz.questions.length; i++) {
            const question = quiz.questions[i];
            const studentAnswer = getAnswerForQuestion(question, i);
            
            // Use shared scoring utility for consistent answer comparison
            const { isCorrect, points } = compareAnswer(question, studentAnswer, quiz.type);
            
            // Submit answer to Space Race API
            try {
              const response = await spaceRacesAPI.submitAnswer(raceData.id, {
                participantId: participantData.id,
                questionId: question.id || `q${i}`,
                answer: studentAnswer,
                questionIndex: i
              });
              
              console.log(`📝 Space Race Answer ${i + 1} submitted:`, {
                questionId: question.id,
                studentAnswer,
                isCorrect,
                points,
                response: response.data
              });
            } catch (error) {
              console.error(`❌ Space Race answer submission failed for question ${i + 1}:`, error);
              answerSubmissionFailed = true;
            }
          }
          
          // Get final score from Space Race API for accurate percentage
          let finalScoreResponse = null;
          try {
            console.log('🏁 Getting final Space Race score...');
            finalScoreResponse = await spaceRacesAPI.getFinalScore(raceData.id, {
              participantId: participantData.id
            });
            
            if (finalScoreResponse.data && finalScoreResponse.data.success) {
              const finalScoreData = finalScoreResponse.data;
              console.log('✅ Final Space Race score received:', finalScoreData);
              
              // Use shared scoring utility to verify and ensure consistency
              const frontendScoring = calculateScore(
                quiz.questions,
                normalizeAnswersByQuestionId(quiz.questions, answers),
                quiz.type
              );
              
              console.log('🔍 Score consistency check:', {
                frontendCalculation: frontendScoring,
                backendResponse: finalScoreData,
                isConsistent: frontendScoring.score === finalScoreData.score && frontendScoring.percentage === finalScoreData.percentage
              });
              
              // Update score and percentage with accurate values (prefer backend if available)
              score = finalScoreData.score || frontendScoring.score;
              percentage = finalScoreData.percentage || frontendScoring.percentage;

              updateLatestSubmission({
                correctAnswers: finalScoreData.correctAnswers || frontendScoring.correctAnswers,
                totalQuestions: finalScoreData.totalQuestions || frontendScoring.totalQuestions,
                percentage: percentage,
                points: finalScoreData.points || frontendScoring.points,
                source: 'spaceRace'
              });

              console.log('🎯 Updated with Space Race final score:', {
                score,
                correctAnswers: finalScoreData.correctAnswers || frontendScoring.correctAnswers,
                totalQuestions: finalScoreData.totalQuestions || frontendScoring.totalQuestions,
                percentage,
                points: finalScoreData.points || frontendScoring.points
              });
            } else {
              console.log('⚠️ Failed to get final score, using frontend calculation');
              console.log('API Response:', finalScoreResponse);
              answerSubmissionFailed = true;
            }
          } catch (finalScoreError) {
            console.log('❌ Error getting final score:', finalScoreError);
            console.log('⚠️ Using frontend calculation as fallback');
            answerSubmissionFailed = true;
          }
          
          // FALLBACK: Use shared scoring utility if backend fails
          if (answerSubmissionFailed || !finalScoreResponse?.data?.success) {
            console.log('🔄 Using shared scoring utility fallback...');
            const fallbackScoring = calculateScore(
              quiz.questions,
              normalizeAnswersByQuestionId(quiz.questions, answers),
              quiz.type
            );

            console.log('📊 Fallback scoring result:', fallbackScoring);

            // Force update with correct calculation
            score = fallbackScoring.correctAnswers; // Use correctAnswers for display
            percentage = fallbackScoring.percentage;

            updateLatestSubmission({
              correctAnswers: fallbackScoring.correctAnswers,
              totalQuestions: fallbackScoring.totalQuestions,
              percentage: fallbackScoring.percentage,
              points: fallbackScoring.points,
              source: 'spaceRace'
            });

            console.log('✅ Applied fallback score:', { score, percentage, points: fallbackScoring.points });

            // Try to update backend with correct score
            try {
              await spaceRacesAPI.updateScore(raceData.id, {
                participantId: participantData.id,
                score: fallbackScoring.points // Send points to backend
              });
              console.log('📝 Updated backend with fallback score');
            } catch (updateError) {
              console.log('⚠️ Failed to update backend score:', updateError);
            }
          }
          
          // Keep Space Race session data so students can return to the lobby
          
        } catch (error) {
          // Silent error handling
        }
      }

      if (serverSubmitSucceeded) {
        localStorage.removeItem('studentSession');
        clearQuizParticipantSession(quiz.id);
      }
      
      setIsSubmitted(true);
    } catch (error) {
      console.error('General error in quiz submission:', error);
      // Don't show modal error - just ensure submission is marked as complete
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch team answers from Firebase for Space Race when quiz is submitted
  useEffect(() => {
    if (isSubmitted && isSpaceRace && raceId && participantId) {
      const fetchTeamAnswers = async () => {
        try {
          const participantPath = `space_race_participants/${raceId}/${participantId}`;
          const participantRef = dbRef(db, participantPath);
          const participantSnap = await get(participantRef);
          
          if (participantSnap.exists()) {
            const participantData = participantSnap.val();
            const teamAnswers = participantData.answers || [];
            
            // Convert team answers to the format expected by calculateScore
            // teamAnswers is an array of {questionId, answer, isCorrect, points, questionIndex}
            const teamAnswersMap = {};
            teamAnswers.forEach((ans) => {
              const id =
                ans.questionId != null
                  ? String(ans.questionId)
                  : `q-${ans.questionIndex ?? 0}`;
              teamAnswersMap[id] = ans.answer;
            });
            
            console.log('🎯 Fetched team answers from Firebase for score display:', {
              teamAnswersCount: teamAnswers.length,
              teamAnswersMap
            });
            
            setTeamAnswersForScore(teamAnswersMap);
          }
        } catch (error) {
          console.error('Error fetching team answers from Firebase:', error);
          // Fallback to local answers if Firebase fetch fails
          setTeamAnswersForScore(answers);
        }
      };
      
      fetchTeamAnswers();
    }
  }, [isSubmitted, isSpaceRace, raceId, participantId, answers]);

  // Auto redirect after quiz completion and remove navigation locks
  useEffect(() => {
    if (isSubmitted) {
      setRedirectCountdown(10);

      // Remove all navigation prevention listeners
      const preventNavigation = () => {};
      window.removeEventListener('beforeunload', preventNavigation);
      window.removeEventListener('popstate', preventNavigation);
      setNavigationBlocked(false);

      redirectTimerRef.current = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(redirectTimerRef.current);
            if (isSpaceRace && raceId) {
              navigate(`/student/space-race/${raceId}`, { replace: true });
            } else {
              navigate('/student/home', { replace: true });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (redirectTimerRef.current) {
          clearInterval(redirectTimerRef.current);
        }
      };
    }
  }, [isSubmitted, isSpaceRace, raceId, navigate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPerformanceComment = (percentage) => {
    if (percentage >= 90) return "Outstanding! You're a star performer! 🌟";
    if (percentage >= 80) return "Excellent work! You really know your stuff! 🎯";
    if (percentage >= 65) return "Great job! Keep up the good work! 👏";
    if (percentage >= 50) return "Good effort! Room for improvement! 💪";
    if (percentage >= 35) return "Nice try! Keep practicing! 📚";
    return "Keep learning! You'll do better next time! 🌱";
  };

  if (isLoading) {
    return (
      <div className={`${shellClass} flex items-center justify-center p-4`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-text-light">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${shellClass} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-error-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text mb-4">Quiz Error</h1>
          <p className="text-text-light mb-6">{error}</p>
          <button
            onClick={() =>
              navigate(
                isSpaceRace && raceId ? `/student/space-race/${raceId}` : '/student/home',
                { replace: true }
              )
            }
            className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            {isSpaceRace ? 'Back to Race' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    const submissions = JSON.parse(localStorage.getItem('quizSubmissions') || '[]');
    const currentSubmission =
      (quiz?.id
        ? [...submissions]
            .filter((s) => String(s.quizId) === String(quiz.id))
            .sort(
              (a, b) =>
                new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
            )[0]
        : null) || submissions[submissions.length - 1];

    const showFinalScore = isSpaceRace
      ? (quiz?.launchSettings?.spaceRaceSettings?.showFinalScore ||
         quiz?.spaceRaceSettings?.showFinalScore ||
         false)
      : quiz?.launchSettings?.showFinalScore !== false;

    const navigateHome = () => {
      if (isSpaceRace && raceId) {
        navigate(`/student/space-race/${raceId}`, { replace: true });
      } else {
        navigate('/student/home', { replace: true });
      }
    };

    // If showFinalScore is false, show a simple completion message without score
    if (!showFinalScore) {
      return (
        <div className="flex items-center justify-center min-h-screen pt-40" style={{ backgroundColor: 'rgb(244 241 236)' }}>
          <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8 max-w-md w-full text-center">
            <CheckCircle className="w-20 h-20 text-primary mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-text mb-4">
              {isSpaceRace ? 'Space Race Quiz Completed!' : 'Quiz Completed!'}
            </h1>
            <p className="text-lg text-text-light mb-6">
              Thank you for completing the quiz!
            </p>

            <div className="mb-6">
              <p className="text-sm text-text-light mb-2">
                Redirecting {isSpaceRace ? 'back to Space Race' : 'to homepage'} in{' '}
                <span className="font-semibold text-primary">{redirectCountdown}</span> seconds...
              </p>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(redirectCountdown / 10) * 100}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={navigateHome}
              className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
            >
              {isSpaceRace ? 'Back to Space Race' : 'Go to Home'}
            </button>
          </div>
        </div>
      );
    }

    console.log('📊 Show final score setting:', showFinalScore);

    // Use the score already saved at submit time (server-confirmed when synced) —
    // same source Progress / Quiz history reads. Do not recalculate here.
    const displayScore = currentSubmission?.correctAnswers ?? currentSubmission?.score ?? 0;
    const displayTotal =
      currentSubmission?.totalQuestions ?? quiz?.questions?.length ?? 0;
    const displayPercentage = Math.round(currentSubmission?.percentage ?? 0);
    const displayPoints = currentSubmission?.points ?? displayScore;

    // Calculate score bar color based on percentage - use theme color consistently
    const getScoreColor = (percentage) => {
      return 'bg-primary';
    };

    const getScoreBgColor = (percentage) => {
      return 'bg-primary/10';
    };

    const getScoreTextColor = (percentage) => {
      return 'text-primary';
    };

    return (
      <div className={`${shellClass} flex items-center justify-center p-4 min-h-screen`}>
        <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8 max-w-md w-full text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${getScoreBgColor(displayPercentage)}`}>
            <CheckCircle className={`w-10 h-10 ${getScoreTextColor(displayPercentage)}`} />
          </div>
          
          <h1 className="text-3xl font-bold text-text mb-4">
            {isSpaceRace ? 'Space Race Quiz Completed!' : 'Quiz Completed!'}
          </h1>
          
          <p className="text-lg text-text-light mb-6">
            {getPerformanceComment(displayPercentage)}
          </p>

          {submissionSyncFailed && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">Submission not synced</p>
                  <p className="text-sm text-amber-800 mt-1">
                    {submissionSyncError ||
                      'Your score is saved on this device only and was not sent to your teacher yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetrySubmission}
                    disabled={retryingSync}
                    className="mt-3 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {retryingSync ? 'Retrying...' : 'Retry submission'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Score Card with Visual Representation */}
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-2xl p-6 mb-6">
            <div className="text-5xl font-bold text-primary mb-2">
              {displayPercentage}%
            </div>
            <p className="text-text-light mb-4">
              You got {displayScore} out of {displayTotal} questions correct
            </p>
            
            {/* Visual Score Bar */}
            <div className="w-full bg-neutral-200 rounded-full h-4 overflow-hidden">
              <div 
                className={`${getScoreColor(displayPercentage)} h-4 rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${displayPercentage}%` }}
              ></div>
            </div>
            
            {/* Score Breakdown */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/50 rounded-lg p-2">
                <div className="text-2xl font-bold text-text">{displayScore}</div>
                <div className="text-xs text-text-light">Correct</div>
              </div>
              <div className="bg-white/50 rounded-lg p-2">
                <div className="text-2xl font-bold text-text">{displayTotal - displayScore}</div>
                <div className="text-xs text-text-light">Incorrect</div>
              </div>
              <div className="bg-white/50 rounded-lg p-2">
                <div className="text-2xl font-bold text-text">{displayTotal}</div>
                <div className="text-xs text-text-light">Total</div>
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <p className="text-sm text-text-light mb-2">
              Redirecting {isSpaceRace ? 'back to Space Race' : 'to homepage'} in <span className="font-semibold text-primary">{redirectCountdown}</span> seconds...
            </p>
            <div className="w-full bg-neutral-200 rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(redirectCountdown / 10) * 100}%` }}
              ></div>
            </div>
          </div>
          
          <button
            onClick={() => {
              if (isSpaceRace && raceId) {
                navigate(`/student/space-race/${raceId}`, { replace: true });
              } else {
                navigate('/student/home', { replace: true });
              }
            }}
            className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            {isSpaceRace ? 'Back to Space Race' : 'Go to Home'}
          </button>
        </div>
      </div>
    );
  }

  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    return (
      <div className={`${shellClass} flex items-center justify-center p-4`}>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text mb-4">Quiz Not Available</h1>
          <p className="text-text-light mb-6">This quiz is not currently available.</p>
          <button
            onClick={() =>
              navigate(
                isSpaceRace && raceId ? `/student/space-race/${raceId}` : '/student/home',
                { replace: true }
              )
            }
            className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            {isSpaceRace ? 'Back to Race' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];
  const effectiveQuestionType = getEffectiveQuestionType(quiz.type, question);
  
  // Calculate progress based on answered questions, not current question position
  const answeredQuestions = quiz.questions.filter((q, index) => {
    const answer = getAnswerForQuestion(q, index);
    return answer != null && String(answer).trim() !== '';
  }).length;
  const progress = (answeredQuestions / quiz.questions.length) * 100;

  return (
    <div className={shellClass}>
      {/* Quiz Info Header */}
      {!embedded && (
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-text">{quiz.title}</h1>
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {quiz.type}
              </span>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 text-text-light">
                <Users className="w-4 h-4" />
                <span className="text-sm">{studentSession?.studentName || 'Student'}</span>
              </div>
              {quiz.launchSettings?.timePerStudentMinutes && (
                <div className="flex items-center space-x-2 text-text-light">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Duration: {quiz.launchSettings.timePerStudentMinutes} min
                  </span>
                </div>
              )}
              {quiz.launchSettings?.timeLimit && (
                <div className="flex items-center space-x-2 text-text-light">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Duration: {quiz.launchSettings.timeLimit} min
                  </span>
                </div>
              )}
              {timeLeft !== null && (
                <div className={`flex items-center space-x-2 ${
                  isSpaceRace 
                    ? (timeLeft < 60 ? 'text-error-600' : 'text-success-600')
                    : (timeLeft < 60 ? 'text-error-600' : timeLeft < 300 ? 'text-warning-600' : 'text-text-light')
                }`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">{formatTime(timeLeft)}</span>
                  {timeLeft === 0 && !hasAnyAnswer() && (
                    <span className="ml-2 text-xs text-error-600">(No questions answered)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Quiz Duration Display */}
          {(isSpaceRace || (quiz.launchSettings && (quiz.launchSettings.timePerStudentMinutes || quiz.launchSettings.quizAvailabilityMinutes || quiz.launchSettings.timeLimit || quiz.launchSettings.countdown))) && (
            <div className="mt-3 p-3 rounded-lg border bg-primary/10 border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-primary">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {isSpaceRace
                      ? 'Quiz duration timer'
                      : quiz.launchSettings.countdown
                      ? `Quiz duration: ${Math.round(quiz.launchSettings.countdown / 60)} minutes`
                      : quiz.launchSettings.timePerStudentMinutes
                      ? `You have ${quiz.launchSettings.timePerStudentMinutes} minutes to complete this quiz`
                      : quiz.launchSettings.quizAvailabilityMinutes
                      ? `Quiz available for ${quiz.launchSettings.quizAvailabilityMinutes} minutes`
                      : quiz.launchSettings.timeLimit
                      ? `Quiz duration: ${quiz.launchSettings.timeLimit} minutes`
                      : 'Quiz timed'
                    }
                  </span>
                </div>
                {timeLeft !== null && (
                  <div className={`text-sm font-medium ${
                    isSpaceRace 
                      ? (timeLeft < 60 ? 'text-error-600' : 'text-success-600')
                      : 'text-primary'
                  }`}>
                    Time remaining: {formatTime(timeLeft)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Progress Bar */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-light">
              Question {currentQuestion + 1} of {quiz.questions.length}
            </span>
            <span className="text-sm font-medium text-primary">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <div className="w-full bg-neutral-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Quiz Duration Timer - Always show for Space Races, even when embedded */}
      {embedded && isSpaceRace && timeLeft !== null && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-center">
              <Clock className="w-6 h-6 mr-3 text-primary" />
              <div className="text-3xl font-bold text-primary">
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-soft border border-neutral-200 p-8">
          {/* Question */}
          <div className="mb-8">
            <div className="flex items-start space-x-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold">
                  {currentQuestion + 1}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-text flex-1">
                {question.questionText}
              </h3>
            </div>
          </div>

          {/* Answer Options */}
          {isSpaceRace && displaySelectedOption && (
            <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-text">
              Team selected: <strong className="text-primary">{displaySelectedOption}</strong>
              {teamSelection?.selectedByName ? (
                <span className="text-text/70"> ({teamSelection.selectedByName})</span>
              ) : null}
              {isCurrentQuestionSubmitted ? (
                <span className="text-primary font-medium"> — Submitted for your team</span>
              ) : null}
            </div>
          )}

          <div className="space-y-3">
            {effectiveQuestionType === 'Multiple Choice' && (question.options || []).map((option, index) => {
              const optionText = option.text ?? option;
              const isTeamSelected =
                isSpaceRace && displaySelectedOption === optionText;
              const isSelected = displaySelectedOption === optionText;
              return (
              <label
                key={index}
                className={`flex items-center p-4 rounded-xl border-2 transition-all ${
                  isCurrentQuestionSubmitted
                    ? 'cursor-not-allowed opacity-80'
                    : 'cursor-pointer'
                } ${
                  isTeamSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-neutral-300 hover:border-neutral-400'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion}`}
                  value={optionText}
                  checked={isSelected}
                  disabled={isSpaceRace && isCurrentQuestionSubmitted}
                  onChange={() => handleAnswerChange(currentQuestion, optionText)}
                  className="w-4 h-4 text-primary border-neutral-300 focus:ring-primary focus:ring-2"
                />
                <span className="ml-3 text-text">{optionText}</span>
              </label>
              );
            })}

            {effectiveQuestionType === 'True / False' && (
              <>
                {['True', 'False'].map((option) => {
                  const isTeamSelected =
                    isSpaceRace && displaySelectedOption === option;
                  const isSelected = displaySelectedOption === option;
                  return (
                  <label
                    key={option}
                    className={`flex items-center p-4 rounded-xl border-2 transition-all ${
                      isCurrentQuestionSubmitted
                        ? 'cursor-not-allowed opacity-80'
                        : 'cursor-pointer'
                    } ${
                      isTeamSelected
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                        : isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-neutral-300 hover:border-neutral-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion}`}
                      value={option}
                      checked={isSelected}
                      disabled={isSpaceRace && isCurrentQuestionSubmitted}
                      onChange={() => handleAnswerChange(currentQuestion, option)}
                      className="w-4 h-4 text-primary border-neutral-300 focus:ring-primary focus:ring-2"
                    />
                    <span className="ml-3 text-text">{option}</span>
                  </label>
                  );
                })}
              </>
            )}

            {(effectiveQuestionType === 'Short Answer' || effectiveQuestionType === 'Long Answer') && (
              <textarea
                value={getAnswerForQuestion(question, currentQuestion)}
                onChange={(e) => handleAnswerChange(currentQuestion, e.target.value)}
                disabled={isSpaceRace && isCurrentQuestionSubmitted}
                placeholder={effectiveQuestionType === 'Short Answer' ? 'Enter your answer...' : 'Provide a detailed answer...'}
                className="w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-text resize-none disabled:opacity-70"
                rows={effectiveQuestionType === 'Short Answer' ? 3 : 6}
              />
            )}
          </div>

          {isSpaceRace && !isCurrentQuestionSubmitted && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleSubmitTeamAnswer}
                disabled={
                  isSubmittingQuestion ||
                  !(displaySelectedOption && String(displaySelectedOption).trim())
                }
                className={`w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                  isSubmittingQuestion ||
                  !(displaySelectedOption && String(displaySelectedOption).trim())
                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {isSubmittingQuestion ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Answer for Team</span>
                  </>
                )}
              </button>
            </div>
          )}

          {isSpaceRace && isCurrentQuestionSubmitted && (
            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
              Answer locked in for your team. Use Next to continue.
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
              disabled={currentQuestion === 0}
              className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                currentQuestion === 0
                  ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  : 'bg-white border-2 border-neutral-300 text-text hover:border-neutral-400'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {isSpaceRace ? (
              currentQuestion === quiz.questions.length - 1 ? (
                isCurrentQuestionSubmitted ? (
                  <button
                    type="button"
                    onClick={() => setIsSubmitted(true)}
                    className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all"
                  >
                    <span>Finish</span>
                    <CheckCircle className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-sm text-text-light">Submit this answer to finish</span>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentQuestion(currentQuestion + 1)}
                  disabled={!isCurrentQuestionSubmitted}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                    !isCurrentQuestionSubmitted
                      ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )
            ) : currentQuestion === quiz.questions.length - 1 ? (
              <button
                onClick={handleSubmitQuiz}
                disabled={isSubmitting || !hasAnyAnswer()}
                className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                  isSubmitting || !hasAnyAnswer()
                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Quiz</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setCurrentQuestion(currentQuestion + 1)}
                disabled={!getAnswerForQuestion(question, currentQuestion)}
                className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                  !getAnswerForQuestion(question, currentQuestion)
                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentQuizAttempt;
