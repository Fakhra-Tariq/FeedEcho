import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { spaceRacesAPI, sessionsAPI, handleAPIError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { normalizeTeamId, saveSpaceRaceParticipant } from '../utils/spaceRaceSession';
import {
  persistQuizParticipantSession,
} from '../utils/quizParticipantSession';
import { onValue, ref as dbRef, off } from 'firebase/database';
import { db } from '../firebase';

function normalizeTeamAssignment(value) {
  const normalized = String(value || 'auto-assign').toLowerCase().replace(/_/g, '-');
  return normalized === 'student-choice' ? 'student-choice' : 'auto-assign';
}

const AudienceJoin = () => {
  const navigate = useNavigate();
  const { audienceSignIn, audienceSignInWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [raceData, setRaceData] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Participant account login (below join form — does not affect join flow)
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [authErrors, setAuthErrors] = useState({});
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);

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

      const { type, data, raceId, quizId, participantId, teamId: assignedTeamId } =
        joinResponse.data;
      // API returns teamId at the top level — must persist for team sync/locking
      const resolvedTeamId = normalizeTeamId(
        assignedTeamId ?? teamId ?? data?.participant?.teamId ?? null
      );

      console.log('Join response:', {
        type,
        raceId,
        quizId,
        participantId,
        resolvedTeamId,
      });

      if (type === 'spaceRace') {
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
          JSON.stringify({
            id: raceId,
            quizId,
            teamId: resolvedTeamId,
            ...data,
          })
        );

        if (data?.quiz?.questions && Array.isArray(data.quiz.questions)) {
          const teamCacheKey = `spaceRaceQuiz_team_${resolvedTeamId ?? 'default'}`;
          localStorage.setItem(
            teamCacheKey,
            JSON.stringify({
              ...data.quiz,
              id: quizId || data.quiz.id,
              launched: true,
            })
          );
        }

        // Same landing as dashboard join — enables RTDB team sync, chat, and timers
        navigate(`/audience/space-race/${raceId}`);
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
        navigate(`/audience/quiz/${quizId}`);
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

  const validateLogin = () => {
    const newErrors = {};
    if (!loginData.email.trim()) {
      newErrors.email = 'Email is required';
    }
    if (!loginData.password) {
      newErrors.password = 'Password is required';
    }
    setAuthErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!validateLogin() || authLoading || authSubmitting) return;

    setAuthLoading(true);
    setAuthSubmitting(true);
    setAuthErrors({});

    try {
      const result = await audienceSignIn(loginData.email.trim(), loginData.password);
      if (result?.success) {
        navigate('/audience/home');
      } else {
        setAuthErrors({ general: result?.error || 'Invalid email or password' });
      }
    } catch (err) {
      const apiError = handleAPIError(err);
      setAuthErrors({ general: apiError.message || 'Login failed. Please try again.' });
    } finally {
      setAuthLoading(false);
      setAuthSubmitting(false);
    }
  };

  const onGoogleLogin = async () => {
    if (authSubmitting) return;

    setAuthSubmitting(true);
    setGoogleLoading(true);
    setAuthErrors({});

    try {
      const result = await audienceSignInWithGoogle();
      if (result?.success) {
        navigate('/audience/home');
      } else {
        setAuthErrors({ general: result?.error || 'Google sign-in failed. Please try again.' });
      }
    } catch (err) {
      const apiError = handleAPIError(err);
      setAuthErrors({ general: apiError.message || 'Google sign-in failed. Please try again.' });
    } finally {
      setGoogleLoading(false);
      setAuthSubmitting(false);
    }
  };

  if (showTeamSelection) {
    const maxStudentsPerTeam = raceData?.settings?.studentsPerTeam || 5;
    console.log('🎨 Rendering team selection UI with', teamOptions.length, 'teams');

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-soft border border-neutral-200 p-8">
          <h2 className="text-xl font-bold text-text mb-2 text-center">Choose your team</h2>
          <p className="text-text/70 text-sm mb-6 text-center">
            Select a team to join (max {maxStudentsPerTeam} participants per team)
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
        <p className="text-text-light mb-6">Enter your name and the session code shared by your host.</p>

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
            {isLoading ? 'Joining...' : 'Join Session'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-text-light whitespace-nowrap">
            — already have an account? —
          </span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        {authErrors.general && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{authErrors.general}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={googleLoading || authSubmitting}
          className="w-full border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-text font-medium py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center"
        >
          {googleLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {!showEmailLogin ? (
          <button
            type="button"
            onClick={() => setShowEmailLogin(true)}
            className="w-full mt-4 text-sm text-primary hover:text-primary-dark font-medium"
          >
            Sign in with email instead
          </button>
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-text-light mb-2">Email</label>
              <input
                type="email"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {authErrors.email && (
                <p className="mt-1 text-sm text-red-600">{authErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light mb-2">Password</label>
              <input
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {authErrors.password && (
                <p className="mt-1 text-sm text-red-600">{authErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={authLoading || authSubmitting}
              className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {authLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="flex justify-end text-sm">
              <Link to="/audience/forgot" className="text-primary hover:text-primary-dark font-medium">
                Forgot password?
              </Link>
            </div>
          </form>
        )}

        <div className="mt-4 text-center text-sm">
          <Link to="/audience/signup" className="text-primary hover:text-primary-dark font-medium">
            No account? Sign up
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AudienceJoin;
