import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { spaceRacesAPI, sessionsAPI } from '../services/api';
import { saveSpaceRaceParticipant } from '../utils/spaceRaceSession';
import {
  persistQuizParticipantSession,
} from '../utils/quizParticipantSession';
import { onValue, ref as dbRef, off } from 'firebase/database';
import { db } from '../firebase';

function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
}

const StudentJoin = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [raceData, setRaceData] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [participants, setParticipants] = useState([]);

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
      try {
        off(participantsRef);
      } catch (e) {
        console.log('Error unsubscribing from participants listener:', e);
      }
    };
  }, [showTeamSelection, raceData?.id]);

  const teamOptions = useMemo(() => {
    const count = raceData?.settings?.numberOfTeams || 2;
    const options = Array.from({ length: count }, (_, i) => i + 1);
    console.log('🏁 Team options generated:', { count, options });
    return options;
  }, [raceData]);

  const proceedWithJoin = async (trimmedName, trimmedCode, teamId = null) => {
    setIsLoading(true);
    setError('');

    try {
      const joinResponse = await sessionsAPI.join(trimmedName, trimmedCode, teamId);

      if (!joinResponse.data.success) {
        setError(joinResponse.data.message || joinResponse.data.error || 'Failed to join session');
        return;
      }

      const { type, data, raceId, quizId, participantId } = joinResponse.data;

      console.log('Join response:', { type, data, raceId, quizId, participantId });

      if (type === 'spaceRace') {
        sessionStorage.setItem('studentName', trimmedName);
        sessionStorage.setItem('sessionCode', trimmedCode);
        sessionStorage.setItem('raceData', JSON.stringify({ raceId, participantId, ...data }));
        saveSpaceRaceParticipant({
          id: participantId,
          name: trimmedName,
          raceId,
          teamId: teamId ?? data?.participant?.teamId ?? null,
        });
        localStorage.setItem('spaceRaceData', JSON.stringify({
          id: raceId,
          ...data
        }));

        if (data.quiz && data.quiz.questions && data.quiz.questions.length > 0) {
          navigate(`/student/quiz/${quizId}`);
        } else if (quizId) {
          navigate(`/student/quiz/${quizId}`);
        } else {
          setError('Quiz data not found. Please try again.');
        }
      } else if (type === 'quiz') {
        if (!data || !data.title) {
          console.error('Quiz data is incomplete:', data);
          setError('Quiz data is incomplete. Please try again.');
          return;
        }

        const sessionData = {
          studentName: trimmedName,
          sessionCode: trimmedCode,
          quizId: quizId,
          participantId: participantId,
          quizTitle: data.title || 'Untitled Quiz',
          quizType: data.type || 'Multiple Choice',
          quiz: data,
          joinedAt: new Date().toISOString(),
          isLocked: true,
          lockTimestamp: new Date().toISOString()
        };

        localStorage.setItem('studentSession', JSON.stringify(sessionData));
        persistQuizParticipantSession(quizId, {
          participantId,
          sessionCode: trimmedCode,
          studentName: trimmedName,
          joinedAt: sessionData.joinedAt,
        });
        navigate(`/student/quiz/${quizId}`);
      }
    } catch (err) {
      console.error('Join error:', err);
      setError(err.response?.data?.message || 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeamSelect = async () => {
    if (!selectedTeam || !pendingJoin) {
      setError('Please select a team');
      return;
    }

    const teamId = parseInt(selectedTeam, 10);
    // Remove team capacity check - allow students to always join and proceed
    setShowTeamSelection(false);
    await proceedWithJoin(pendingJoin.trimmedName, pendingJoin.trimmedCode, teamId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) return;

    if (trimmedCode.length !== 6) {
      setError('Session code must be exactly 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('🚀 Starting join process for code:', trimmedCode);
      console.log('🔗 API Base URL:', process.env.REACT_APP_API_URL || 'http://localhost:5001/api');
      // First check if it's a Space Race with student-choice team assignment
      const raceResponse = await spaceRacesAPI.getRaceByCode(trimmedCode);
      console.log('📡 Race API response:', raceResponse.data);
      console.log('📡 Full response:', raceResponse);

      if (raceResponse.data?.success) {
        const race = raceResponse.data.data;
        console.log('🎯 Race data loaded:', race);
        console.log('🎯 Race settings:', race.settings);
        console.log('🎯 Team assignment value:', race.settings?.teamAssignment);
        console.log('🔍 Normalized team assignment:', normalizeTeamAssignment(race.settings?.teamAssignment));

        if (normalizeTeamAssignment(race.settings?.teamAssignment) === 'student-choice') {
          console.log('✅ Student-choice mode detected, showing team selection');
          console.log('📝 Setting raceData:', race);
          console.log('📝 Setting pendingJoin:', { trimmedName, trimmedCode });
          console.log('📝 Setting showTeamSelection to true');
          setRaceData(race);
          setPendingJoin({ trimmedName, trimmedCode });
          setShowTeamSelection(true);
          setIsLoading(false);
          console.log('✅ State updated, showTeamSelection should now be true');
          return;
        } else {
          console.log('ℹ️ Not student-choice mode, proceeding with normal join');
          console.log('ℹ️ Normalized value:', normalizeTeamAssignment(race.settings?.teamAssignment));
        }
      } else {
        console.log('⚠️ Race lookup failed or not a Space Race:', raceResponse.data?.message);
        console.log('⚠️ Success flag:', raceResponse.data?.success);
      }

      // If not student-choice or race lookup failed, proceed with normal join
      console.log('🔄 Proceeding with normal join flow');
      await proceedWithJoin(trimmedName, trimmedCode);
    } catch (err) {
      console.error('❌ Join error:', err);
      console.error('❌ Error message:', err.message);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error status:', err.response?.status);
      // If race lookup fails, try normal join anyway
      console.log('🔄 Falling back to normal join due to error');
      await proceedWithJoin(trimmedName, trimmedCode);
    } finally {
      setIsLoading(false);
    }
  };

  // Show team selection UI
  console.log('🔍 Rendering check - showTeamSelection:', showTeamSelection, 'raceData:', raceData, 'selectedTeam:', selectedTeam);
  if (showTeamSelection) {
    const maxStudentsPerTeam = raceData?.settings?.studentsPerTeam || 5;
    console.log('🎨 Rendering team selection UI with', teamOptions.length, 'teams');

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
            disabled={!selectedTeam || isLoading}
            className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Joining...' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTeamSelection(false);
              setRaceData(null);
              setSelectedTeam('');
            }}
            className="w-full py-2 text-text/70 hover:text-text text-sm mt-2"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Join Session</h1>
        <p className="text-text-light mb-6">Enter your name and the code your teacher gives you.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-light mb-2">Your Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Ali"
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-light mb-2">Session Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} // Auto-uppercase
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. AB12CD"
              maxLength={6} // Exactly 6 characters
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Joining...' : 'Join Race'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentJoin;
