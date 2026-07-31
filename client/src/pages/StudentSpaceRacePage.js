import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Rocket, AlertCircle } from 'lucide-react';
import { onValue, ref as dbRef, off } from 'firebase/database';
import { db } from '../firebase';
import { sessionsAPI, spaceRacesAPI } from '../services/api';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import StudentQuizAttempt from './StudentQuizAttempt';
import SpaceRaceGamePanel from '../components/SpaceRace/SpaceRaceGamePanel';
import SpaceRaceTeamChat from '../components/SpaceRace/SpaceRaceTeamChat';
import {
  saveSpaceRaceParticipant,
  loadSpaceRaceParticipant,
  clearSpaceRaceParticipant,
  normalizeTeamId,
} from '../utils/spaceRaceSession';

function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
}

const persistJoinSession = (trimmedName, trimmedCode, joinPayload) => {
  const { data, raceId, quizId, participantId, teamId } = joinPayload;
  const resolvedQuizId = quizId || data?.quizId || data?.quiz?.id;
  const resolvedTeamId = normalizeTeamId(teamId ?? data?.participant?.teamId ?? null);

  sessionStorage.setItem('studentName', trimmedName);
  sessionStorage.setItem('sessionCode', trimmedCode);
  sessionStorage.setItem(
    'raceData',
    JSON.stringify({ raceId, participantId, teamId: resolvedTeamId, ...data })
  );

  saveSpaceRaceParticipant({
    id: participantId,
    name: trimmedName,
    raceId,
    teamId: resolvedTeamId,
  });
  localStorage.setItem(
    'spaceRaceData',
    JSON.stringify({ id: raceId, quizId: resolvedQuizId, teamId: resolvedTeamId, ...data })
  );

  // Only save quiz data if it actually exists
  if (data?.quiz && data.quiz.questions && Array.isArray(data.quiz.questions)) {
    const quizPayload = {
      ...data.quiz,
      id: resolvedQuizId || data.quiz.id,
      launched: true,
      questions: data.quiz.questions,
    };
    // Use team-specific cache key to ensure different teams get different question shuffles
    const teamIdForCache = resolvedTeamId ?? 'default';
    const teamCacheKey = `spaceRaceQuiz_team_${teamIdForCache}`;
    localStorage.setItem(teamCacheKey, JSON.stringify(quizPayload));
    console.log('💾 Saved quiz with team-specific cache key:', teamCacheKey, 'teamId:', teamIdForCache);
  }

  return { raceId, quizId: resolvedQuizId, teamId: resolvedTeamId };
};

export default function StudentSpaceRacePage() {
  const navigate = useNavigate();
  const { raceId: routeRaceId, quizId: routeQuizId } = useParams();
  const { alert } = useHybridAlert();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [raceData, setRaceData] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [participants, setParticipants] = useState([]);

  const activeRaceId = routeRaceId || raceData?.id || raceData?.raceId;
  const activeQuizId =
    routeQuizId || raceData?.quizId || JSON.parse(localStorage.getItem('spaceRaceQuiz') || 'null')?.id;
  const isQuizView = Boolean(routeQuizId);

  const loadStoredSession = useCallback(() => {
    try {
      const expectedRaceId = routeRaceId || null;
      const p =
        loadSpaceRaceParticipant(expectedRaceId) ||
        loadSpaceRaceParticipant(null);
      const storedRace = localStorage.getItem('spaceRaceData') || sessionStorage.getItem('raceData');
      if (!p || !storedRace) return null;

      const r = JSON.parse(storedRace);
      const raceKey = r?.id || r?.raceId;
      if (expectedRaceId && raceKey && String(raceKey) !== String(expectedRaceId)) {
        return null;
      }

      // Heal missing teamId from raceData (older join clients omitted it)
      const healedTeamId = normalizeTeamId(p.teamId ?? r?.teamId ?? null);
      const participant = healedTeamId !== p.teamId ? { ...p, teamId: healedTeamId } : p;
      if (healedTeamId !== p.teamId) {
        saveSpaceRaceParticipant(participant);
      }

      return { participant, race: { ...r, id: raceKey || r?.id, teamId: healedTeamId } };
    } catch {
      return null;
    }
  }, [routeRaceId]);

  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;

    setParticipant(stored.participant);
    setRaceData(stored.race);

    if (!routeRaceId && stored.race?.id) {
      // Don't auto-navigate to quiz - let user navigate from game panel
      navigate(`/student/space-race/${stored.race.id}`, { replace: true });
    }
  }, [loadStoredSession, navigate, routeRaceId, routeQuizId]);

  useEffect(() => {
    if (routeRaceId && !participant) {
      const stored = loadStoredSession();
      if (stored) {
        setParticipant(stored.participant);
        setRaceData(stored.race);
      }
    }
  }, [routeRaceId, participant, loadStoredSession]);

  // Keep participant teamId/score in sync with RTDB (works for dashboard + public join)
  useEffect(() => {
    if (!activeRaceId || !participant?.id) return undefined;

    const participantRef = dbRef(
      db,
      `space_race_participants/${activeRaceId}/${participant.id}`
    );
    const unsub = onValue(participantRef, (snap) => {
      if (!snap.exists()) return;
      const live = snap.val() || {};
      setParticipant((prev) => {
        if (!prev) return prev;
        const nextTeamId = normalizeTeamId(live.teamId ?? prev.teamId);
        const nextScore = live.score ?? prev.score;
        if (
          String(prev.teamId ?? '') === String(nextTeamId ?? '') &&
          Number(prev.score ?? 0) === Number(nextScore ?? 0)
        ) {
          return prev;
        }
        const updated = { ...prev, teamId: nextTeamId, score: nextScore };
        saveSpaceRaceParticipant(updated);
        // Keep raceData teamId aligned for quiz bootstrap on both join paths
        try {
          const raw = localStorage.getItem('spaceRaceData');
          if (raw) {
            const race = JSON.parse(raw);
            localStorage.setItem(
              'spaceRaceData',
              JSON.stringify({ ...race, teamId: nextTeamId })
            );
          }
          const raceSession = sessionStorage.getItem('raceData');
          if (raceSession) {
            const race = JSON.parse(raceSession);
            sessionStorage.setItem(
              'raceData',
              JSON.stringify({ ...race, teamId: nextTeamId })
            );
          }
        } catch {
          // ignore storage sync errors
        }
        return updated;
      });
    });

    return () => {
      try {
        unsub();
      } catch {
        off(participantRef);
      }
    };
  }, [activeRaceId, participant?.id]);

  const proceedWithJoin = async (trimmedName, trimmedCode, teamId = null) => {
    setIsJoining(true);
    setJoinError('');

    try {
      const joinResponse = await sessionsAPI.join(trimmedName, trimmedCode, teamId);

      if (!joinResponse.data?.success) {
        setJoinError(joinResponse.data?.message || joinResponse.data?.error || 'Failed to join session');
        return;
      }

      const { type, data, raceId, quizId, participantId, teamId: assignedTeamId } = joinResponse.data;

      console.log('🎯 Join response data:', { type, raceId, quizId, hasQuiz: !!data?.quiz, quizQuestionCount: data?.quiz?.questions?.length });

      if (type !== 'spaceRace') {
        setJoinError('No active Space Race found for this code.');
        return;
      }

      const resolvedTeamId = normalizeTeamId(
        assignedTeamId ?? teamId ?? data?.participant?.teamId ?? null
      );
      const resolvedQuizId = (data?.quiz && data.quiz.questions && Array.isArray(data.quiz.questions))
        ? (quizId ?? data?.quizId ?? data?.quiz?.id)
        : null;

      console.log('🔍 Resolved quiz data:', { resolvedQuizId, resolvedTeamId });

      persistJoinSession(trimmedName, trimmedCode, {
        data,
        raceId,
        quizId: resolvedQuizId,
        participantId,
        teamId: resolvedTeamId,
      });

      setParticipant({
        id: participantId,
        name: trimmedName,
        raceId,
        teamId: resolvedTeamId,
      });
      setRaceData({ id: raceId, quizId: resolvedQuizId, teamId: resolvedTeamId, ...data });

      // Navigate to game panel (same as auto-assign flow)
      navigate(`/student/space-race/${raceId}`, { replace: true });

      alert.toast.success('Joined Space Race!');
    } catch (err) {
      console.error('Join error:', err);
      setJoinError(err.response?.data?.message || err.message || 'Failed to join');
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedName || trimmedCode.length !== 6) {
      setJoinError('Enter your name and a valid 6-character code.');
      return;
    }

    setIsJoining(true);
    setJoinError('');

    try {
      const raceResponse = await spaceRacesAPI.getRaceByCode(trimmedCode);
      if (!raceResponse.data?.success) {
        setJoinError('Invalid session code');
        return;
      }

      const race = raceResponse.data.data;
      console.log('🎯 Race data loaded:', { teamAssignment: race.settings?.teamAssignment, numberOfTeams: race.settings?.numberOfTeams, studentsPerTeam: race.settings?.studentsPerTeam });
      console.log('🔍 Normalized team assignment:', normalizeTeamAssignment(race.settings?.teamAssignment));

      if (normalizeTeamAssignment(race.settings?.teamAssignment) === 'student-choice') {
        // For student-choice, show team selection screen first
        setRaceData(race);
        setPendingJoin({ trimmedName, trimmedCode });
        setShowTeamSelection(true);
        console.log('✅ Showing team selection screen');
        setIsJoining(false);
        return;
      }

      // For auto-assign, proceed directly with join
      console.log('🚀 Proceeding with auto-assign join');
      await proceedWithJoin(trimmedName, trimmedCode);
    } catch (err) {
      console.error('❌ Join error:', err);
      setJoinError(err.response?.data?.message || 'Failed to join session');
    } finally {
      setIsJoining(false);
    }
  };

  // Listen to participants for real-time team count updates
  useEffect(() => {
    if (!showTeamSelection || !raceData?.id) return;

    const participantsPath = `space_race_participants/${raceData.id}`;
    const participantsRef = dbRef(db, participantsPath);

    const handleParticipantsUpdate = (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const participantsList = Object.values(data);
        console.log('👥 Participants updated:', participantsList);
        setParticipants(participantsList);
      } else {
        setParticipants([]);
      }
    };

    const unsubscribe = onValue(participantsRef, handleParticipantsUpdate);
    return () => {
      unsubscribe();
    };
  }, [showTeamSelection, raceData?.id]);

  const handleTeamSelect = async () => {
    if (!selectedTeam || !pendingJoin) {
      setJoinError('Please select a team');
      return;
    }

    const teamId = parseInt(selectedTeam, 10);
    const maxStudentsPerTeam = raceData?.settings?.studentsPerTeam || 5;
    
    // Check team capacity before allowing join
    const currentTeamMembers = participants?.filter((p) => String(p.teamId) === String(teamId)) || [];
    if (currentTeamMembers.length >= maxStudentsPerTeam) {
      setJoinError(`Team ${teamId} is already full (max ${maxStudentsPerTeam} students). Please select another team.`);
      return;
    }

    setShowTeamSelection(false);
    await proceedWithJoin(pendingJoin.trimmedName, pendingJoin.trimmedCode, teamId);
  };

  const handleLeave = () => {
    sessionStorage.removeItem('studentName');
    sessionStorage.removeItem('sessionCode');
    sessionStorage.removeItem('raceData');
    localStorage.removeItem('spaceRaceData');
    clearSpaceRaceParticipant();
    localStorage.removeItem('spaceRaceQuiz');
    navigate('/student/home');
  };

  const teamOptions = useMemo(() => {
    const count = raceData?.settings?.numberOfTeams || 2;
    const options = Array.from({ length: count }, (_, i) => i + 1);
    console.log('🏁 Team options generated:', { count, options });
    return options;
  }, [raceData]);

  const resolvedTeamId = participant?.teamId;

  if (showTeamSelection) {
    const maxStudentsPerTeam = raceData?.settings?.studentsPerTeam || 5;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-soft border border-neutral-200 p-8">
          <h2 className="text-xl font-bold text-text mb-2 text-center">Choose your team</h2>
          <p className="text-text/70 text-sm mb-6 text-center">
            Select a team to join (max {maxStudentsPerTeam} students per team)
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {teamOptions.map((teamNum) => {
              const currentTeamMembers =
                participants?.filter((p) => String(p.teamId) === String(teamNum)) || [];
              const isFull = currentTeamMembers.length >= maxStudentsPerTeam;

              return (
                <button
                  key={teamNum}
                  type="button"
                  onClick={() => !isFull && setSelectedTeam(String(teamNum))}
                  disabled={isFull}
                  className={`py-4 rounded-xl border-2 font-semibold transition-colors ${
                    selectedTeam === String(teamNum)
                      ? 'border-primary bg-primary/10 text-primary'
                      : isFull
                      ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                      : 'border-neutral-200 text-text/80 hover:border-primary/40'
                  }`}
                >
                  <div className="text-lg">Team {teamNum}</div>
                  <div className="text-xs mt-1">
                    {currentTeamMembers.length}/{maxStudentsPerTeam} students
                  </div>
                  {isFull && (
                    <div className="text-xs text-error-600 mt-1">Full</div>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleTeamSelect}
            disabled={!selectedTeam || isJoining}
            className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isJoining ? 'Joining...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (!activeRaceId) {
    navigate('/space-race', { replace: true });
    return null;
  }

  return (
    <>
      <style>{`.quiz-embed-root > div { min-height: 0 !important; height: auto !important; }`}</style>
      <div className="flex flex-col md:flex-row h-screen min-h-screen overflow-hidden bg-background">
        <div className="w-full md:w-[60%] flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-neutral-200">
          <div className="flex-shrink-0 bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
            <button
              type="button"
              onClick={handleLeave}
              className="flex items-center gap-2 text-text/70 hover:text-text text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Leave
            </button>
            <div className="flex items-center gap-2 text-text">
              <Rocket className="w-5 h-5 text-primary" />
              <span className="font-semibold">Space Race</span>
            </div>
            <div className="w-16" />
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isQuizView && (
              <SpaceRaceGamePanel
                raceId={activeRaceId}
                participant={participant}
                quizId={activeQuizId}
                compact
                onTimeUp={() => alert.toast.info('Race time is up!')}
              />
            )}
            <div className="flex-1 min-h-0 overflow-y-auto bg-background">
              {isQuizView ? (
                <div className="space-race-quiz-embed min-h-full quiz-embed-root">
                  <StudentQuizAttempt
                    embedded
                    spaceRaceId={activeRaceId}
                    spaceRaceQuizId={activeQuizId}
                    spaceRaceParticipant={participant}
                  />
                </div>
              ) : (
                <SpaceRaceGamePanel
                  raceId={activeRaceId}
                  participant={participant}
                  quizId={activeQuizId}
                  onTimeUp={() => alert.toast.info('Race time is up!')}
                />
              )}
            </div>
          </div>
        </div>

        <div className="w-full md:w-[40%] flex-shrink-0 h-[45vh] md:h-screen min-h-0 overflow-hidden">
          {resolvedTeamId != null && resolvedTeamId !== '' ? (
            <SpaceRaceTeamChat
              raceId={activeRaceId}
              teamId={resolvedTeamId}
              participant={participant}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-white border-l border-neutral-200 text-text/60 text-sm p-4 text-center">
              Join a team to unlock team chat
            </div>
          )}
        </div>
      </div>
    </>
  );
}
