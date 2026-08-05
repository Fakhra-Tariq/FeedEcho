import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Square, Settings, Users, Clock, Trophy, Star, Filter, Monitor, Check, Copy, Loader2 } from 'lucide-react';
import { useHostData } from '../contexts/HostDataContext';
import { useAuth } from '../contexts/AuthContext';
import SpaceRaceSettings from '../components/SpaceRaceSettings';
import { quizzesAPI, spaceRacesAPI, exitTicketsAPI } from '../services/api';
import { useRtdbList } from '../hooks/useRtdb';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  resolveActiveTeacherSession,
} from '../utils/requireActiveHostSession';
import { useHybridAlert } from '../contexts/HybridAlertContext';

// Timer display component for active races
const RaceTimer = ({ raceData, className = '' }) => {
  const [timeLeft, setTimeLeft] = useState('--:--');

  useEffect(() => {
    if (!raceData) {
      setTimeLeft('--:--');
      return;
    }

    const calculateTimeLeft = () => {
      try {
        // Prioritize join duration timer
        if (raceData.startedAt && raceData.settings?.joinDuration) {
          const now = new Date().getTime();
          const start = new Date(raceData.startedAt).getTime();
          const joinDurationMinutes = raceData.settings.joinDuration;
          const joinDurationMs = joinDurationMinutes * 60 * 1000;
          const endTime = start + joinDurationMs;
          
          const difference = endTime - now;

          if (difference <= 0) {
            setTimeLeft('00:00');
            return;
          }

          const minutes = Math.floor((difference / 1000) / 60);
          const seconds = Math.floor((difference / 1000) % 60);
          setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else if (raceData.endTime) {
          // Show quiz duration timer only if join duration is not available
          const now = new Date().getTime();
          const end = new Date(raceData.endTime).getTime();
          
          // Check if endTime is a valid date
          if (isNaN(end)) {
            setTimeLeft('--:--');
            return;
          }

          const difference = end - now;

          if (difference <= 0) {
            setTimeLeft('00:00');
            return;
          }

          const minutes = Math.floor((difference / 1000) / 60);
          const seconds = Math.floor((difference / 1000) % 60);
          setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else {
          // Show static timer minutes if no timer is running
          setTimeLeft(raceData.timerMinutes ? `${raceData.timerMinutes}:00` : '--:--');
        }
      } catch (error) {
        console.error('Error calculating time left:', error);
        setTimeLeft('--:--');
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [raceData]);

  return (
    <span className={className}>
      {timeLeft}
    </span>
  );
};

export default function HostSpaceRace() {
  const { alert: hybridAlert } = useHybridAlert();
  const { data: teacherData, updateSpaceRace, logActivity } = useHostData();
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [currentJoinCode, setCurrentJoinCode] = useState('');
  const [filter, setFilter] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [fetchingQuizzes, setFetchingQuizzes] = useState(false);
  const [races, setRaces] = useState([]);
  const [settingsRace, setSettingsRace] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [showActiveRaceAlert, setShowActiveRaceAlert] = useState(false);
  const [skipRtdbUpdate, setSkipRtdbUpdate] = useState(false);
  
    
  // Fetch only when modal opens — only teacher's quizzes
  const fetchQuizzesForModal = async () => {
    setFetchingQuizzes(true);
    try {
      const res = await quizzesAPI.getAll({ _: Date.now() });
      if (res.data.success) {
        const all = res.data.data || [];
        const teacherId = user?.uid || userProfile?.uid;
        const teacherQuizzes = all.filter(
          (q) => !q.deletedAt &&
            (q.status || '').toLowerCase() !== 'ended' &&
            teacherId &&
            q.createdBy === teacherId
        );
        setQuizzes(teacherQuizzes);
      } else {
        setQuizzes([]);
      }
    } catch (err) {
      console.error("Error fetching quizzes:", err);
      setQuizzes([]);
    } finally {
      setFetchingQuizzes(false);
    }
  };

  const uid = userProfile?.uid || user?.uid;
  const uidFallback = sessionStorage.getItem('feedecho-user-id');
  const { list: liveRaces, loading: liveRacesLoading, error: liveRacesError } = useRtdbList(uid ? 'spaceRaces' : null, {
    enabled: Boolean(uid),
    filter: (r) => r.createdBy === uid || (uidFallback && r.createdBy === uidFallback),
    sort: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  });

  // Legacy calls in this component still invoke fetchRaces() after mutations.
  // With RTDB listeners, the state updates automatically; keep a harmless noop to avoid runtime errors.
  const fetchRaces = async () => {};

  const apiFallbackAppliedRef = useRef(false);
  const [teamScoresMap, setTeamScoresMap] = useState({});

  // Fetch team scores for all races
  useEffect(() => {
    if (!uid || liveRacesLoading) return;

    const fetchTeamScores = async () => {
      const scores = {};
      for (const race of (liveRaces || [])) {
        const raceId = race.id || race.raceId;
        if (raceId && getRaceStatus(race) !== 'draft') {
          try {
            const response = await spaceRacesAPI.getParticipants(raceId);
            if (response.data?.success && response.data?.data?.teamScores) {
              scores[raceId] = response.data.data.teamScores;
            }
          } catch (error) {
            console.error(`Failed to fetch team scores for race ${raceId}:`, error);
          }
        }
      }
      setTeamScoresMap(scores);
    };

    fetchTeamScores();
  }, [uid, liveRacesLoading, liveRaces]);

  useEffect(() => {
    if (liveRacesLoading) return;
    if (skipRtdbUpdate) {
      console.log('⏭️ Skipping RTDB update to preserve local settings changes');
      return;
    }
    // Always update races when liveRaces changes - remove signature check to ensure real-time updates
    // Merge liveRaces with local state to preserve local changes
    setRaces(prevRaces => {
      if (!liveRaces || liveRaces.length === 0) return prevRaces;

      // Merge liveRaces with prevRaces, preserving local settings updates
      return liveRaces.map(liveRace => {
        const localRace = prevRaces.find(r => r.id === liveRace.id);
        if (localRace) {
          // Compare timestamps to determine which data is newer
          const liveTime = new Date(liveRace.updatedAt || 0).getTime();
          const localTime = new Date(localRace.updatedAt || 0).getTime();
          
          // If local data is newer, keep local settings
          if (localTime > liveTime && localRace.settings) {
            console.log(`🔄 Keeping local settings for race ${liveRace.id} (local: ${localTime} > live: ${liveTime})`);
            return {
              ...liveRace,
              settings: { ...liveRace.settings, ...localRace.settings },
              updatedAt: localRace.updatedAt
            };
          }
          // Otherwise use live data
          return liveRace;
        }
        return liveRace;
      });
    });
  }, [liveRacesLoading, liveRaces, skipRtdbUpdate]);

  useEffect(() => {
    if (!liveRacesError) return;
    // Suppress permission_denied errors as they're expected when Firebase rules aren't deployed
    if (liveRacesError.message && liveRacesError.message.includes('permission_denied')) {
      console.log('ℹ️ Firebase permission error (rules not deployed) - using API fallback');
      return;
    }
    console.error('Live space races listener error:', liveRacesError);
  }, [liveRacesError]);

  // API fallback (no polling): if RTDB returns empty due to createdBy mismatch, fetch from backend
  const fallbackRequestedRef = useRef(false);
  useEffect(() => {
    if (!uid) return;
    if (liveRacesLoading) return;
    if ((liveRaces || []).length > 0) return;
    if (fallbackRequestedRef.current) return;
    fallbackRequestedRef.current = true;
    (async () => {
      try {
        const res = await spaceRacesAPI.getAll({ _: Date.now() });
        if (res.data?.success) {
          apiFallbackAppliedRef.current = true;
          setRaces(res.data.data || []);
        }
      } catch (e) {
        console.error('Space race fallback load failed:', e);
      }
    })();
  }, [uid, liveRacesLoading, liveRaces]);

  // Helper functions
  const resolveRaceId = (race) => race?.id || race?.raceId;

  const getRaceStatus = (race) => {
    if (!race) return 'draft';
    
    const raw = race.status || 'draft';
    const normalized = typeof raw === 'string' ? raw.toLowerCase() : raw;
    
    // Map backend statuses to frontend states
    switch (normalized) {
      case 'active':
        return 'active';
      case 'paused':
      case 'inactive':
        return 'active'; // Map paused/inactive to active so they appear in active tab
      case 'completed':
        return 'completed';
      case 'ended':
        return 'completed'; // Map ended to completed
      default:
        return 'draft';
    }
  };

  // Calculate filtered races
  const filteredRaces = (races || []).filter((race) => {
    const status = getRaceStatus(race);
    const normalizedFilter = filter.toLowerCase();

    if (normalizedFilter === 'all') {
      return true;
    }

    return status === normalizedFilter;
  });

  const activeRace = (races || []).find((r) => getRaceStatus(r) === 'active');

  // 2-step modal state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [launchSettings, setLaunchSettings] = useState({
    numberOfTeams: 2,
    teamAssignment: 'auto-assign',
    icon: 'rocket',
    countdown: 300, // Default 5 minutes (300 seconds)
    joinDuration: 30,
    shuffleQuestions: false,
    shuffleAnswers: false,
    showQuestionFeedback: true,
    showFinalScore: true,
    studentsPerTeam: 3 // Default 3 participants per team for student choice
  });

  const handleOpenCreateModal = () => {
    setCurrentStep(1);
    setSelectedQuizId('');
    setLaunchSettings({
      numberOfTeams: 2,
      teamAssignment: 'auto-assign',
      icon: 'rocket',
      countdown: 300, // Default 5 minutes (300 seconds)
      joinDuration: 30, // Reset join duration
      shuffleQuestions: false,
      shuffleAnswers: false,
      showQuestionFeedback: false,
      showFinalScore: true,
      studentsPerTeam: 3 // Reset participants per team
    });
    setShowCreate(true);
    // Clear old list and fetch current library only (no deleted quizzes)
    setQuizzes([]);
    fetchQuizzesForModal();
  };

  const handleQuizSelect = (quizId) => {
    setSelectedQuizId(quizId);
  };

  const handleNextStep = () => {
    if (selectedQuizId) {
      setCurrentStep(2);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    }
  };

  // Save a new Space Race as draft (without launching)
  const handleSaveRace = async () => {
    let raceData = null; // Declare outside try block to make it accessible in catch
    
    try {
      setIsCreating(true);
      
      // Validate required fields
      if (!selectedQuizId) {
        console.error('Please select a quiz first.');
        hybridAlert.toast.error('Please select a quiz first');
        return;
      }

      const selectedQuiz = quizzes.find(
        (q) => q.id === selectedQuizId || q._id === selectedQuizId
      );
      if (!selectedQuiz) {
        console.error('Selected quiz not found');
        hybridAlert.toast.error('Selected quiz not found');
        return;
      }

      const quizId = selectedQuiz.id || selectedQuiz._id;

      // Build payload for draft race
      raceData = {
        quizId,
        title: selectedQuiz.title || 'Space Race',
        numberOfTeams: Number(launchSettings.numberOfTeams),
        teamAssignment: launchSettings.teamAssignment,
        icon: launchSettings.icon,
        countdown: Number(launchSettings.countdown),
        joinDuration: Number(launchSettings.joinDuration),
        studentsPerTeam: Number(launchSettings.studentsPerTeam),
        shuffleQuestions: Boolean(launchSettings.shuffleQuestions),
        shuffleAnswers: Boolean(launchSettings.shuffleAnswers),
        showQuestionFeedback: Boolean(launchSettings.showQuestionFeedback),
        showFinalScore: Boolean(launchSettings.showFinalScore),
        settings: {
          numberOfTeams: Number(launchSettings.numberOfTeams),
          teamAssignment: launchSettings.teamAssignment,
          icon: launchSettings.icon,
          countdown: Number(launchSettings.countdown),
          timerSeconds: Number(launchSettings.countdown),
          joinDuration: Number(launchSettings.joinDuration),
          studentsPerTeam: Number(launchSettings.studentsPerTeam),
          shuffleQuestions: Boolean(launchSettings.shuffleQuestions),
          shuffleAnswers: Boolean(launchSettings.shuffleAnswers),
          showQuestionFeedback: Boolean(launchSettings.showQuestionFeedback),
          showFinalScore: Boolean(launchSettings.showFinalScore),
        },
      };
      
      console.log('Saving Space Race as draft:', raceData);

      // Call backend save endpoint (create without launching)
      const res = await spaceRacesAPI.create(raceData);

      if (res.data?.raceId) {
        const { raceId } = res.data;

        console.log('Space race saved successfully as draft:', { raceId });

        // Optimistically add new race to local state
        const newRace = {
          id: raceId,
          title: selectedQuiz.title || 'Space Race',
          status: 'draft',
          quizId: quizId,
          participantsCount: 0,
          teamsCount: launchSettings.numberOfTeams,
          questionsCount: selectedQuiz.questions?.length || 0,
          timerMinutes: launchSettings.joinDuration,
          settings: {
            numberOfTeams: launchSettings.numberOfTeams,
            teamAssignment: launchSettings.teamAssignment,
            icon: launchSettings.icon,
            countdown: launchSettings.countdown,
            timerSeconds: launchSettings.countdown,
            joinDuration: launchSettings.joinDuration,
            shuffleQuestions: launchSettings.shuffleQuestions,
            shuffleAnswers: launchSettings.shuffleAnswers,
            showQuestionFeedback: launchSettings.showQuestionFeedback,
            showFinalScore: launchSettings.showFinalScore,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user?.uid || userProfile?.uid || 'user-sundus-nadeem'
        };

        // Add new race to existing races
        setRaces(prevRaces => [newRace, ...prevRaces]);

        // Close modal and reset
        setShowCreate(false);
        setCurrentStep(1);
        setSelectedQuizId('');

        // Switch filter to "Draft" so new draft race is visible
        setFilter('draft');

        // Fetch fresh data in background (non-blocking)
        fetchRaces().catch(err => console.log('Background fetch failed:', err));
      } else {
        throw new Error(res.data?.message || 'No raceId returned from server');
      }

    } catch (error) {
      console.error('❌ Error saving space race:', error);
      console.error('❌ Error response:', error.response);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error data:', error.response?.data);
      console.error('❌ Request payload:', raceData);

      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to save Space Race. Please try again.';

      console.error('❌ Failed to save Space Race:', errorMessage);
      hybridAlert.toast.error('Error: ' + errorMessage + '\n\nCheck browser console for more details.');
    } finally {
      setIsCreating(false);
    }
  };

  // Start a new Space Race from the launch modal
  const handleStartRace = async () => {
    let raceData = null; // Declare outside try block to make it accessible in catch

    const teacherId = user?.uid || userProfile?.uid;
    let sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherId);

    if (!sessionCheck.ok) {
      hybridAlert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    try {
      try {
        const exitTicketsResponse = await exitTicketsAPI.getAll({ status: 'active' });
        const activeExitTickets = exitTicketsResponse.data?.data || [];
        if (activeExitTickets.length > 0) {
          hybridAlert.toast.error('An Exit Ticket is already active. Please end it first before launching a Space Race.');
          return;
        }
      } catch (error) {
        console.log('Could not check exit tickets, proceeding with space race launch');
      }

      try {
        const quizzesResponse = await quizzesAPI.getAll();
        const allQ = quizzesResponse.data?.data || [];
        const now = Date.now();
        const activeLibraryQuizzes = allQ.filter((q) => {
          if (teacherId && q.createdBy !== teacherId) return false;
          if (!q.launched) return false;
          const status = String(q.status || '').toLowerCase();
          if (!['active', 'launched'].includes(status)) return false;
          const endTime = q.launchSettings?.endTime ? new Date(q.launchSettings.endTime).getTime() : null;
          // If the quiz launch window already expired, don't block Space Race.
          if (endTime && !Number.isNaN(endTime) && endTime <= now) return false;
          return true;
        });
        if (activeLibraryQuizzes.length > 0) {
          hybridAlert.toast.error('A Library Quiz is already active. Please end it first before launching a Space Race.');
          return;
        }
      } catch (error) {
        console.log('Could not check library quizzes, proceeding with space race launch');
      }

      // Check if any space race is already active
      const existingActiveRace = races.find(race => getRaceStatus(race) === 'active');
      if (existingActiveRace) {
        setShowActiveRaceAlert(true);
        return;
      }

      setIsCreating(true);
      
      // Validate required fields
      if (!selectedQuizId) {
        console.error('Please select a quiz first.');
        hybridAlert.toast.error('Please select a quiz first');
        return;
      }

      const selectedQuiz = quizzes.find(
        (q) => q.id === selectedQuizId || q._id === selectedQuizId
      );
      if (!selectedQuiz) {
        console.error('Selected quiz not found');
        hybridAlert.toast.error('Selected quiz not found');
        return;
      }

      const quizId = selectedQuiz.id || selectedQuiz._id;

      // Build payload matching backend schema with manual timer
      raceData = {
        quizId,
        title: selectedQuiz.title || 'Space Race',
        accessCode: null, // Backend will generate unique code
        numberOfTeams: Number(launchSettings.numberOfTeams),
        teamAssignment: launchSettings.teamAssignment,
        icon: launchSettings.icon,
        countdown: Number(launchSettings.countdown), // Manual timer in seconds
        joinDuration: Number(launchSettings.joinDuration), // Join duration in minutes
        studentsPerTeam: Number(launchSettings.studentsPerTeam),
        shuffleQuestions: Boolean(launchSettings.shuffleQuestions),
        shuffleAnswers: Boolean(launchSettings.shuffleAnswers),
        showQuestionFeedback: Boolean(launchSettings.showQuestionFeedback),
        showFinalScore: Boolean(launchSettings.showFinalScore),
        settings: {
          numberOfTeams: Number(launchSettings.numberOfTeams),
          teamAssignment: launchSettings.teamAssignment,
          icon: launchSettings.icon,
          countdown: Number(launchSettings.countdown), // Manual timer
          timerSeconds: Number(launchSettings.countdown), // Store in seconds
          joinDuration: Number(launchSettings.joinDuration), // Add join duration to settings
          studentsPerTeam: Number(launchSettings.studentsPerTeam),
          shuffleQuestions: Boolean(launchSettings.shuffleQuestions),
          shuffleAnswers: Boolean(launchSettings.shuffleAnswers),
          showQuestionFeedback: Boolean(launchSettings.showQuestionFeedback),
          showFinalScore: Boolean(launchSettings.showFinalScore),
        },
      };
      
      console.log('Starting Space Race for quiz:', selectedQuiz);
      console.log('Starting race with payload:', raceData);

      // Call backend start endpoint
      const res = await spaceRacesAPI.startRace(raceData);

      if (res.data?.raceId && res.data?.joinCode) {
        const { raceId, joinCode } = res.data;
        const sessionJoinCode = (sessionCheck.joinCode || joinCode || '').toUpperCase();
        
        console.log('Space race launched successfully:', { raceId, joinCode: sessionJoinCode });

        // Create new race object for immediate UI update
        const newRace = {
          id: raceId,
          raceId: raceId,
          joinCode: sessionJoinCode,
          title: selectedQuiz.title,
          description: selectedQuiz.description || 'Live Space Race session',
          status: 'active',
          startedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user?.uid || userProfile?.uid,
          settings: {
            numberOfTeams: launchSettings.numberOfTeams,
            teamAssignment: launchSettings.teamAssignment,
            countdown: launchSettings.countdown,
            joinDuration: launchSettings.joinDuration,
            studentsPerTeam: launchSettings.studentsPerTeam,
            shuffleQuestions: launchSettings.shuffleQuestions,
            shuffleAnswers: launchSettings.shuffleAnswers,
            showQuestionFeedback: launchSettings.showQuestionFeedback,
            showFinalScore: launchSettings.showFinalScore,
          },
          timerMinutes: launchSettings.joinDuration,
          participants: 0,
        };

        // Add new race to existing races immediately
        setRaces(prevRaces => [newRace, ...prevRaces]);

        // Show join code modal instead of navigating
        setCurrentJoinCode(sessionJoinCode);
        setShowJoinCodeModal(true);

        // Refresh races list in background to sync with server
        fetchRaces();

        // Close the create modal
        setShowCreate(false);
        
        // Reset form
        setSelectedQuizId('');
        setCurrentStep(1);
        setLaunchSettings({
          numberOfTeams: 2,
          teamAssignment: 'auto-assign',
          icon: 'rocket',
          countdown: 30,
          joinDuration: 5,
          studentsPerTeam: 3
        });

        // Switch filter to "Active" so new race is visible immediately
        setFilter('active');
      } else {
        throw new Error(res.data?.message || 'No raceId or joinCode returned from server');
      }

    } catch (error) {
      console.error('❌ Error launching space race:', error);
      console.error('❌ Error response:', error.response);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error data:', error.response?.data);
      console.error('❌ Request payload:', raceData);

      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to launch Space Race. Please try again.';

      console.error('❌ Failed to launch Space Race:', errorMessage);
      hybridAlert.toast.error('Error: ' + errorMessage + '\n\nCheck browser console for more details.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStart = async (raceId) => {
    const teacherId = user?.uid || userProfile?.uid;
    let sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherId);

    if (!sessionCheck.ok) {
      hybridAlert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    try {
      console.log('Starting space race:', raceId);
      
      const race = races.find(r => r.id === raceId);
      if (!race) {
        console.error('Race not found:', raceId);
        return;
      }
      
      console.log('Found race to start:', race);
      
      // For draft races, update status to active using the existing race
      if (race.status === 'draft') {
        // Update the existing draft race to active status
        const response = await spaceRacesAPI.updateStatus(raceId, 'active');

        if (response.data.success) {
          const updatedRace = response.data.data;

          if (typeof logActivity === 'function') {
            logActivity('spaceRace', `Started Space Race: ${race.title}`);
          } else {
            console.error('logActivity is not available');
          }
          console.log('Space race started successfully:', updatedRace);

          // Update local state with the complete race data from backend
          setRaces((prev) =>
            (prev || []).map((r) =>
              r.id === raceId
                ? {
                    ...r,
                    ...updatedRace, // Merge all updated data including settings and startedAt
                    status: 'active',
                    joinCode: updatedRace.joinCode || r.joinCode
                  }
                : r
            )
          );
          setFilter('active');

          // Show join code modal
          if (updatedRace.joinCode || sessionCheck.joinCode) {
            setCurrentJoinCode((sessionCheck.joinCode || updatedRace.joinCode || '').toUpperCase());
            setShowJoinCodeModal(true);
          }
        } else {
          console.error('Failed to start race:', response.data.error);
          hybridAlert.toast.error('Failed to start race: ' + response.data.error);
          return;
        }
      } else {
        // For inactive races, update status to active and navigate to live view
        const response = await spaceRacesAPI.updateStatus(raceId, 'active');

        if (response.data.success) {
          if (typeof logActivity === 'function') {
            logActivity('spaceRace', `Resumed Space Race: ${race.title}`);
          } else {
            console.error('logActivity is not available');
          }

          console.log('Space race resumed successfully');

          // Optimistically mark race as active in local state
          setRaces((prev) =>
            (prev || []).map((r) =>
              r.id === raceId
                ? {
                    ...r,
                    status: 'active',
                    isPaused: false
                  }
                : r
            )
          );
          setFilter('active');

          // Stay on the Space Race page (this app doesn't have a /host/space-race/:id route)
          navigate(`/host/space-race`);
        } else {
          console.error('Failed to resume race:', response.data.error);
          hybridAlert.toast.error('Failed to resume race: ' + (response.data.error || 'Unknown error'));
          return;
        }
      }
      
      // Refresh race list to show updated status
      fetchRaces();
      
    } catch (error) {
      console.error('Error starting space race:', error);
      hybridAlert.toast.error('Failed to start race: ' + error.message);
    }
  };

  const handleEnd = async (raceId) => {
    try {
      const race = races.find((r) => resolveRaceId(r) === raceId || r.id === raceId);
      const resolvedId = resolveRaceId(race) || raceId;
      if (!resolvedId) {
        hybridAlert.toast.error('Race not found');
        return;
      }

      let response;
      try {
        response = await spaceRacesAPI.end(resolvedId);
      } catch (primaryError) {
        if (primaryError.response?.status === 404) {
          response = await spaceRacesAPI.updateStatus(resolvedId, 'completed');
        } else {
          throw primaryError;
        }
      }

      if (response.data.success) {
        if (typeof logActivity === 'function') {
          logActivity('spaceRace', `Stopped Space Race: ${race?.title || 'Unknown'} - Status: completed`);
        }
        setRaces((prev) =>
          (prev || []).map((r) =>
            resolveRaceId(r) === resolvedId
              ? { ...r, status: 'completed', isPaused: false }
              : r
          )
        );
        setFilter('completed');
        hybridAlert.toast.success('Space Race ended');
      } else {
        hybridAlert.toast.error('Failed to stop race: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error stopping race:', error);
      const msg = error.response?.data?.error || error.message || 'Failed to stop race';
      hybridAlert.toast.error('Failed to stop race: ' + msg);
    }
  };

  const handleDelete = async (raceId) => {
    try {
      const race = races.find((r) => resolveRaceId(r) === raceId || r.id === raceId);
      const resolvedId = resolveRaceId(race) || raceId;
      if (!resolvedId) {
        hybridAlert.toast.error('Race not found');
        return;
      }

      const response = await spaceRacesAPI.delete(resolvedId);
      if (response.data.success) {
        if (typeof logActivity === 'function') {
          logActivity('spaceRace', `Deleted Space Race: ${race?.title || 'Unknown'}`);
        }
        setRaces((prev) => (prev || []).filter((r) => resolveRaceId(r) !== resolvedId));
        hybridAlert.toast.success('Space Race deleted');
      } else {
        hybridAlert.toast.error('Failed to delete race: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Delete race error:', error);
      const msg = error.response?.data?.error || error.message || 'Failed to delete race';
      hybridAlert.toast.error('Failed to delete race: ' + msg);
    }
  };

  const handleUpdateSettings = async (raceId, newSettings) => {
    try {
      console.log('🔧 Updating settings for race:', raceId, 'New settings:', newSettings);
      
      // Skip RTDB updates temporarily to prevent overwriting
      setSkipRtdbUpdate(true);
      
      // Extract the actual settings object if it's nested
      const settingsToUpdate = newSettings.settings || newSettings;
      console.log('📤 Settings to send to backend:', settingsToUpdate);
      
      // First update the backend via API
      await spaceRacesAPI.update(raceId, { settings: settingsToUpdate });
      
      // Then update local state to reflect the changes
      setRaces(prevRaces => {
        const updated = prevRaces.map(r =>
          r.id === raceId
            ? { ...r, settings: { ...r.settings, ...settingsToUpdate }, updatedAt: new Date().toISOString() }
            : r
        );
        console.log('🔄 Updated races state:', updated.find(r => r.id === raceId)?.settings);
        return updated;
      });

      // Also update settingsRace if it's currently open
      setSettingsRace(prev => {
        if (prev && prev.id === raceId) {
          return { ...prev, settings: { ...prev.settings, ...settingsToUpdate }, updatedAt: new Date().toISOString() };
        }
        return prev;
      });

      // Refresh races from backend to ensure sync
      setTimeout(async () => {
        try {
          const res = await spaceRacesAPI.getAll({ _: Date.now() });
          if (res.data?.success) {
            setRaces(res.data.data || []);
            console.log('🔄 Refreshed races from backend after settings update');
          }
        } catch (error) {
          console.error('Failed to refresh races after settings update:', error);
        }
        // Re-enable RTDB updates after refresh
        setSkipRtdbUpdate(false);
      }, 1000);

      const race = races.find(r => r.id === raceId);
      if (typeof logActivity === 'function') {
        logActivity('spaceRace', `Updated Space Race settings: ${race?.title || 'Unknown'}`);
      } else {
        console.error('logActivity is not available');
      }
      console.log('✅ Space Race settings updated:', { raceId, settings: settingsToUpdate });
      hybridAlert.toast.success('Settings updated successfully');
    } catch (error) {
      console.error('Error updating settings:', error);
      setSkipRtdbUpdate(false);
      hybridAlert.toast.error('Failed to update settings: ' + error.message);
    }
  };

return (
  <div className="p-6 space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-text">Space Race</h1>
        <p className="text-text-light mt-1">Gamified quiz competitions with team leaderboards</p>
      </div>
      <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-[#6D415F] text-white rounded-lg hover:bg-[#6D415F]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Race
            </button>
    </div>

    <div className="bg-[#6D415F] rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Race in Progress</h3>
            <p className="text-white/80">{activeRace?.title || 'No active race'}</p>
          </div>
        </div>
        {activeRace && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleEnd(resolveRaceId(activeRace))}
              className="inline-flex items-center px-3 py-1.5 bg-[#6D415F] text-white text-sm rounded-lg hover:bg-[#5a364d] transition-colors"
              title="End Race"
            >
              <Square className="w-4 h-4 mr-1" />
              End Race
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-white/80 text-sm">Teams</p>
          <p className="text-2xl font-bold">{activeRace?.teamsCount || activeRace?.settings?.numberOfTeams || 0}</p>
        </div>
        <div>
          <p className="text-white/80 text-sm">Participants</p>
          <p className="text-2xl font-bold">{activeRace?.participantsCount || 0}</p>
        </div>
        <div>
          <p className="text-white/80 text-sm">Questions</p>
          <p className="text-2xl font-bold">{activeRace?.questionsCount || 0}</p>
        </div>
        <div>
          <p className="text-white/80 text-sm">Time Left</p>
          <p className="text-2xl font-bold text-green-400">
            {activeRace ? <RaceTimer raceData={activeRace} /> : '--:--'}
          </p>
          {activeRace?.settings?.joinDuration && (
            <p className="text-xs text-white/60 mt-1">Join Timer</p>
          )}
          {!activeRace?.settings?.joinDuration && activeRace?.endTime && (
            <p className="text-xs text-white/60 mt-1">Quiz Timer</p>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center space-x-4 border-b border-gray-200">
        {['all', 'draft', 'active', 'completed'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`pb-3 px-1 capitalize transition-colors border-b-2 ${
              filter === status
                ? 'border-[#6D415F] text-[#6D415F]'
                : 'border-transparent text-text-light hover:text-text'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredRaces.map(race => (
          <div key={race.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-text">{race.title}</h3>
                  {(() => {
                    const status = getRaceStatus(race);
                    const badgeClasses =
                      status === 'active'
                        ? 'bg-[#6D415F]/20 text-[#6D415F]'
                        : status === 'completed'
                        ? 'bg-[#6D415F]/10 text-[#6D415F]'
                        : 'bg-gray-100 text-gray-800';

                    const label =
                      status === 'active'
                        ? 'Active'
                        : status === 'completed'
                        ? 'Completed'
                        : 'Draft';

                    return (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeClasses}`}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-text-light mb-4">{race.description || 'Live Space Race session'}</p>
                <div className="flex items-center space-x-6 text-sm text-text-light">
                  <div className="flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>{race.participantsCount || race.participants || 0} participants</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Trophy className="w-4 h-4" />
                    <span>
                      {race.settings?.numberOfTeams || 2} teams
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>
                      {race.status === 'active' ? (
                        <RaceTimer raceData={race} />
                      ) : (
                        race.timerMinutes ? `${race.timerMinutes} min` : 'No limit'
                      )}
                    </span>
                  </div>
                  {getRaceStatus(race) !== 'draft' && (() => {
                    const raceId = race.id || race.raceId;
                    const scores = teamScoresMap[raceId] || race.teamScores;
                    if (scores && Object.keys(scores).length > 0) {
                      const total = Object.values(scores).reduce((sum, team) => sum + (typeof team === 'number' ? team : (team.score || 0)), 0);
                      return total > 0 ? (
                        <div className="flex items-center space-x-1">
                          <Star className="w-4 h-4" />
                          <span>{total} pts correct</span>
                        </div>
                      ) : null;
                    }
                    return null;
                  })()}
                </div>

                {/* Show join code for active races */}
                {getRaceStatus(race) === 'active' && race.joinCode && (
                  <div className={`mt-3 inline-flex items-center px-3 py-1 rounded-full bg-[#6D415F]/5 text-[#6D415F] text-xs font-medium`}>
                    Join Code: <span className="ml-1 font-mono tracking-widest">{race.joinCode}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 ml-4">
                {/* Start button for draft races */}
                {getRaceStatus(race) === 'draft' && (
                  <button
                    onClick={() => handleStart(race.id)}
                    className="inline-flex items-center px-3 py-1.5 bg-[#6D415F] text-white text-sm rounded-lg hover:bg-[#5a364d] transition-colors"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Launch
                  </button>
                )}
                
                {/* End button for active races */}
                {getRaceStatus(race) === 'active' && (
                  <button
                    onClick={() => handleEnd(resolveRaceId(race))}
                    className="inline-flex items-center px-3 py-1.5 bg-[#6D415F] text-white text-sm rounded-lg hover:bg-[#5a364d] transition-colors"
                    title="End Race"
                  >
                    <Square className="w-4 h-4 mr-1" />
                    End Race
                  </button>
                )}
                
                {/* Settings button for all races */}
                <button 
                  onClick={() => setSettingsRace(race)}
                  className="p-2 text-[#6D415F] hover:bg-[#6D415F]/10 rounded-lg transition-colors"
                  title="Race Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                
                {/* View Display button - show for completed/ended races so teachers can see who won */}
                {(race.status === 'completed' || race.status === 'ended' || race.status === 'active') && (
                  <button 
                    onClick={() => navigate(`/host/space-race/${race.id}/display`)}
                    className="p-2 text-[#6D415F] hover:bg-[#6D415F]/10 rounded-lg transition-colors"
                    title="View Race Display - See who won and final results"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {liveRacesLoading && races.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-light">
            <Loader2 className="w-8 h-8 animate-spin mr-3" />
            <span>Loading space races…</span>
          </div>
        ) : null}
        {filteredRaces.length === 0 && races.length === 0 && !liveRacesLoading && (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">No space races</h3>
            <p className="text-text-light">Create your first gamified quiz competition</p>
          </div>
        )}
        
        {filteredRaces.length === 0 && races.length > 0 && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">No races in this category</h3>
            <p className="text-text-light">Try selecting a different filter or create a new race</p>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header with step indicators */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-text mb-4">Launch Space Race</h2>
              <div className="flex items-center justify-between">
                <div className={`flex items-center space-x-2 ${currentStep === 1 ? 'text-[#6D415F]' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === 1 ? 'bg-[#6D415F] text-white' : 'bg-gray-200'}`}>
                    1
                  </div>
                  <span className="font-medium">Choose Quiz</span>
                </div>
                <div className={`flex-1 h-0.5 ${currentStep === 2 ? 'bg-[#6D415F]' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center space-x-2 ${currentStep === 2 ? 'text-[#6D415F]' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === 2 ? 'bg-[#6D415F] text-white' : 'bg-gray-200'}`}>
                    2
                  </div>
                  <span className="font-medium">Settings</span>
                </div>
              </div>
            </div>

            {/* Step 1: Choose Quiz */}
            {currentStep === 1 && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-text mb-4">Select a Quiz</h3>
                {fetchingQuizzes ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mb-3" />
                    <p className="text-text-light">Loading library quizzes…</p>
                  </div>
                ) : quizzes && quizzes.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {quizzes.map(quiz => (
                      <div
                        key={quiz.id}
                        onClick={() => handleQuizSelect(quiz.id)}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedQuizId === quiz.id
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-text">{quiz.title}</h4>
                            <p className="text-sm text-text-light">
                              {quiz.questionCount || quiz.questions?.length || 0} questions • {quiz.status}
                            </p>
                          </div>
                          {selectedQuizId === quiz.id && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-text-light">No quizzes available</p>
                    <p className="text-sm text-text-light mt-2">Create some quizzes in Library first</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Settings */}
            {currentStep === 2 && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-text mb-4">Space Race Settings</h3>
                <div className="grid grid-cols-2 gap-8">
                  {/* Left Side */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-light mb-1">Number of Teams</label>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={launchSettings.numberOfTeams}
                        onChange={(e) => setLaunchSettings({...launchSettings, numberOfTeams: parseInt(e.target.value) || 2})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-light mb-1">Team Assignment</label>
                      <div className="space-y-2">
                        <label className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="teamAssignment"
                            value="auto-assign"
                            checked={launchSettings.teamAssignment === 'auto-assign'}
                            onChange={(e) => setLaunchSettings({...launchSettings, teamAssignment: e.target.value})}
                            className="w-4 h-4 text-[#6D415F] focus:ring-[#6D415F]"
                          />
                          <span className="text-sm text-text">Auto-assign</span>
                        </label>
                        <label className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="teamAssignment"
                            value="student-choice"
                            checked={launchSettings.teamAssignment === 'student-choice'}
                            onChange={(e) => setLaunchSettings({...launchSettings, teamAssignment: e.target.value})}
                            className="w-4 h-4 text-[#6D415F] focus:ring-[#6D415F]"
                          />
                          <span className="text-sm text-text">Audience Choice</span>
                        </label>
                      </div>
                    </div>

                    {/* Show participants per team field only when student choice is selected */}
                    {launchSettings.teamAssignment === 'student-choice' && (
                      <div>
                        <label className="block text-sm font-medium text-text-light mb-1">Number of participants per team</label>
                        <select
                          value={launchSettings.studentsPerTeam}
                          onChange={(e) => setLaunchSettings({...launchSettings, studentsPerTeam: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6D415F] focus:border-[#6D415F] bg-white text-text"
                        >
                          {[1, 2, 3, 4, 5, 6].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Maximum students allowed per team</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-text-light mb-1">Race Icon</label>
                      <select
                        value={launchSettings.icon}
                        onChange={(e) => setLaunchSettings({...launchSettings, icon: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                      >
                        <option value="rocket">🚀 Rocket</option>
                        <option value="trophy">🏆 Trophy</option>
                        <option value="star">⭐ Star</option>
                        <option value="flag">🚩 Flag</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-light mb-1">Quiz Duration</label>
                        <select
                          value={launchSettings.countdown}
                          onChange={(e) => setLaunchSettings({...launchSettings, countdown: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                        >
                          <option value="30">30 seconds</option>
                          <option value="60">1 minute</option>
                          <option value="120">2 minutes</option>
                          <option value="300">5 minutes</option>
                          <option value="600">10 minutes</option>
                          <option value="900">15 minutes</option>
                          <option value="1200">20 minutes</option>
                          <option value="1800">30 minutes</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Audience will see this timer when they attempt quiz</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-light mb-1">Join Duration</label>
                        <select
                          value={launchSettings.joinDuration}
                          onChange={(e) => setLaunchSettings({...launchSettings, joinDuration: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                        >
                          <option value="5">5 minutes</option>
                          <option value="10">10 minutes</option>
                          <option value="15">15 minutes</option>
                          <option value="20">20 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="45">45 minutes</option>
                          <option value="60">1 hour</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Audience can join for this duration</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Side - Toggles */}
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={launchSettings.shuffleQuestions}
                        onChange={(e) => setLaunchSettings({...launchSettings, shuffleQuestions: e.target.checked})}
                        className="w-4 h-4 text-[#6D415F] border-gray-300 rounded focus:ring-[#6D415F]"
                      />
                      <span className="text-sm text-text">Shuffle Questions</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={launchSettings.shuffleAnswers}
                        onChange={(e) => setLaunchSettings({...launchSettings, shuffleAnswers: e.target.checked})}
                        className="w-4 h-4 text-[#6D415F] border-gray-300 rounded focus:ring-[#6D415F]"
                      />
                      <span className="text-sm text-text">Shuffle Answers</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={launchSettings.showQuestionFeedback}
                        onChange={(e) => setLaunchSettings({...launchSettings, showQuestionFeedback: e.target.checked})}
                        className="w-4 h-4 text-[#6D415F] border-gray-300 rounded focus:ring-[#6D415F]"
                      />
                      <span className="text-sm text-text">Show Question Feedback</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={launchSettings.showFinalScore}
                        onChange={(e) => setLaunchSettings({...launchSettings, showFinalScore: e.target.checked})}
                        className="w-4 h-4 text-[#6D415F] border-gray-300 rounded focus:ring-[#6D415F]"
                      />
                      <span className="text-sm text-text">Show Final Score</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="p-6 border-t border-gray-200 flex justify-between">
              <div>
                {currentStep === 2 && (
                  <button
                    type="button"
                    onClick={handlePreviousStep}
                    className="px-4 py-2 text-text-light bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Previous
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-text-light bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                {currentStep === 1 && (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!selectedQuizId}
                    className="px-4 py-2 bg-[#6D415F] text-white rounded-lg hover:bg-[#6D415F]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                )}
                {currentStep === 2 && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveRace}
                      disabled={isCreating}
                      className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCreating ? 'Saving...' : 'Save as Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartRace}
                      disabled={isCreating}
                      className="px-4 py-2 bg-[#6D415F] text-white rounded-lg hover:bg-[#6D415F]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCreating ? 'Launching...' : 'Launch'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Settings Modal */}
      {settingsRace && (
        <SpaceRaceSettings
          key={`${settingsRace.id}-${settingsRace.updatedAt}`}
          race={settingsRace}
          onClose={() => setSettingsRace(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdateSettings}
        />
      )}

      {/* Join Code Modal - matching QuizLaunchedModal design */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Dark overlay background */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Popup modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-8 text-center">
              {/* Theme colored circular success icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-[#6D415F] rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Title and subtitle */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Space Race Launched</h2>
              <p className="text-sm text-gray-600 mb-8">Share this code with students</p>

              {/* Audience Access Code box */}
              <div className="mb-8">
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Audience Access Code
                  </label>
                  <div className="text-3xl font-bold text-gray-900 tracking-widest uppercase">
                    {currentJoinCode}
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                {/* Primary Copy Code button */}
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(currentJoinCode);
                      setCopied(true);
                      setShowCopyNotification(true);
                      setTimeout(() => setCopied(false), 2000);
                      setTimeout(() => setShowCopyNotification(false), 3000);
                    } catch (err) {
                      console.error('Failed to copy code:', err);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#6D415F] text-white rounded-lg hover:bg-[#5A344D] transition-colors font-medium"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>

                {/* Secondary Close button */}
                <button
                  onClick={() => setShowJoinCodeModal(false)}
                  className="w-full px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy Success Notification */}
      {showCopyNotification && (
        <div className="fixed top-4 right-4 z-[60] animate-pulse">
          <div className="bg-[#6D415F] text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Code copied successfully</span>
          </div>
        </div>
      )}

      {/* Active Race Alert */}
      {showActiveRaceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Dark overlay background */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Alert modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-8 text-center">
              {/* Warning icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-orange-600" />
                </div>
              </div>

              {/* Title and message */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Active Space Race in Progress</h2>
              <p className="text-sm text-gray-600 mb-8">
                Please end the current race before launching a new one.
              </p>

              {/* Buttons */}
              <div className="space-y-3">
                {/* Go to Active Race button */}
                <button
                  onClick={() => {
                    setShowActiveRaceAlert(false);
                    navigate(`/host/space-race`);
                  }}
                  className="w-full px-6 py-3 bg-[#6D415F] text-white rounded-lg hover:bg-[#5A344D] transition-colors font-medium"
                >
                  Go to Active Space Race
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
