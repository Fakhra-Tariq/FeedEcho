import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Key, BookOpen, Clock, Award, FileText } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { getStoredStudentSession } from '../utils/studentSession';
import {
  joinSessionByCode,
  proceedWithSessionJoin,
} from '../utils/joinSessionFlow';
import { onValue, ref as dbRef, off } from 'firebase/database';
import { db } from '../firebase';

const StudentJoinSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { alert } = useHybridAlert();
  const [studentName, setStudentName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [raceData, setRaceData] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [participants, setParticipants] = useState([]);

  const loggedInStudent = getStoredStudentSession();

  useEffect(() => {
    const state = location.state || {};
    if (state.studentName) {
      setStudentName(state.studentName);
    } else if (loggedInStudent?.name) {
      setStudentName(loggedInStudent.name);
    }
    if (state.sessionCode) {
      setSessionCode(String(state.sessionCode).toUpperCase().slice(0, 6));
    }
    if (state.teamSelectionOnly && state.raceData) {
      setRaceData(state.raceData);
      setPendingJoin({
        trimmedName: state.studentName || loggedInStudent?.name || 'Student',
        trimmedCode: String(state.sessionCode || '').toUpperCase(),
        studentUid: loggedInStudent?.uid || null,
        studentEmail: loggedInStudent?.email || null,
      });
      setShowTeamSelection(true);
    }
  }, [location.state, loggedInStudent?.name, loggedInStudent?.uid, loggedInStudent?.email]);

  useEffect(() => {
    if (!showTeamSelection || !raceData?.id) return;

    const participantsPath = `space_race_participants/${raceData.id}`;
    const participantsRef = dbRef(db, participantsPath);

    const handleParticipantsUpdate = (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setParticipants(Object.values(data));
      } else {
        setParticipants([]);
      }
    };

    onValue(participantsRef, handleParticipantsUpdate);
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
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [raceData]);

  const handleTeamSelect = async () => {
    if (!selectedTeam || !pendingJoin) {
      alert.toast.error('Please select a team');
      return;
    }

    const teamId = parseInt(selectedTeam, 10);
    setShowTeamSelection(false);
    setIsJoining(true);
    try {
      await proceedWithSessionJoin({
        trimmedName: pendingJoin.trimmedName,
        trimmedCode: pendingJoin.trimmedCode,
        teamId,
        navigate,
        studentUid: pendingJoin.studentUid || loggedInStudent?.uid || null,
        studentEmail: pendingJoin.studentEmail || loggedInStudent?.email || null,
        loggedInStudent,
      });
    } catch (err) {
      alert.toast.error(err.response?.data?.message || err.message || 'Failed to join session');
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinSession = async () => {
    if (!sessionCode.trim()) {
      alert.toast.error('Please enter session code');
      return;
    }

    const trimmedCode = sessionCode.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      alert.toast.error('Session code must be exactly 6 characters');
      return;
    }

    const name = studentName.trim() || loggedInStudent?.name || 'Student';
    if (!name.trim()) {
      alert.toast.error('Please enter your name');
      return;
    }

    setIsJoining(true);
    try {
      await joinSessionByCode({
        code: trimmedCode,
        studentName: name,
        loggedInStudent,
        navigate,
        onError: (message) => alert.toast.error(message),
        onTeamSelectionRequired: (payload) => {
          setRaceData(payload.raceData);
          setPendingJoin({
            trimmedName: payload.studentName,
            trimmedCode: payload.sessionCode,
            studentUid: payload.studentUid,
            studentEmail: payload.studentEmail,
          });
          setShowTeamSelection(true);
        },
      });
    } finally {
      setIsJoining(false);
    }
  };

  if (showTeamSelection) {
    const maxStudentsPerTeam = raceData?.settings?.studentsPerTeam || 5;

    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 flex items-center justify-center p-4">
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
          <button
            type="button"
            onClick={() => {
              setShowTeamSelection(false);
              setRaceData(null);
              setSelectedTeam('');
              if (loggedInStudent) {
                navigate('/student/home');
              }
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <button
            onClick={() => navigate(loggedInStudent ? '/student/home' : '/')}
            className="inline-flex items-center space-x-3 text-text-light hover:text-text mb-6 transition-colors px-3 py-2 rounded-lg hover:bg-primary/5"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Home</span>
          </button>

          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-3xl mb-6 shadow-soft">
            <Users className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-text mb-4">
            Join Session
          </h1>
          <p className="text-lg text-text-light max-w-2xl mx-auto">
            Enter your name and session code provided by your teacher to join quiz, space race, or exit ticket
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8">
            <div className="mb-6">
              <label className="block text-sm font-semibold text-text mb-3">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Your Name</span>
                </div>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter your full name"
                readOnly={!!loggedInStudent?.name}
                className={`w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-text placeholder-neutral-400 ${
                  loggedInStudent?.name ? 'bg-gray-50' : ''
                }`}
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleJoinSession();
                  }
                }}
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-semibold text-text mb-3">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-primary" />
                  <span>Session Code</span>
                </div>
              </label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                className="w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-center text-xl font-bold tracking-widest text-text placeholder-neutral-400 uppercase"
                maxLength={6}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleJoinSession();
                  }
                }}
              />
              <p className="text-xs text-text-light mt-2">
                Enter the 6-character code provided by your teacher
              </p>
            </div>

            <button
              onClick={handleJoinSession}
              disabled={isJoining || !studentName.trim() || !sessionCode.trim()}
              className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl hover:from-primary/90 hover:to-primary/70 transition-all duration-300 font-semibold shadow-soft hover:shadow-soft-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isJoining ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-5 h-5" />
                  <span>Join Session</span>
                </>
              )}
            </button>

            <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10">
              <div className="flex items-start space-x-3">
                <Award className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text">Need help?</p>
                  <p className="text-xs text-text-light mt-1">
                    Make sure you have the correct session code from your teacher. The code is case-insensitive and should be exactly 6 characters long.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-primary/10">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">Timed Sessions</h3>
            <p className="text-sm text-text-light">
              Complete your quiz within time limit set by your teacher
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-primary/10">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">Interactive Questions</h3>
            <p className="text-sm text-text-light">
              Engage with various question types designed for effective learning
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-primary/10">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">Instant Feedback</h3>
            <p className="text-sm text-text-light">
              Get immediate results and feedback on your performance
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-primary/10">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">Exit Tickets</h3>
            <p className="text-sm text-text-light">
              Quick reflections to share your understanding before leaving class
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentJoinSession;
