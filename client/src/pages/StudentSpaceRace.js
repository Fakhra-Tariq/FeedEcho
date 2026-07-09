import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { spaceRacesAPI } from '../services/api';
import { Trophy, Users, Clock, Star, ArrowLeft, Rocket, Zap, MessageSquare, X, Flame, Flag } from 'lucide-react';
import SpaceRaceTeamChat from '../components/SpaceRace/SpaceRaceTeamChat';
import { useRtdbValue } from '../hooks/useRtdb';

// Timer display component
const TimerDisplay = ({ timerInfo, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!timerInfo || !timerInfo.endTime) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(timerInfo.endTime).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        if (onTimeUp && !isExpired) {
          onTimeUp();
        }
        return;
      }

      const totalSeconds = Math.floor(difference / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      // Return total seconds for display
      setTimeLeft(totalSeconds);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [timerInfo, isExpired, onTimeUp]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeColor = () => {
    if (isExpired) return 'text-red-600';
    if (timeLeft <= 30) return 'text-orange-600';
    if (timeLeft <= 60) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className={`text-center p-4 bg-white rounded-lg shadow-md border-2 ${isExpired ? 'border-red-300' : 'border-gray-200'}`}>
      <div className={`text-2xl font-bold ${getTimeColor()} flex items-center justify-center`}>
        <Clock className="w-5 h-5 mr-2" />
        {isExpired ? (
          <span>Time's Up!</span>
        ) : (
          formatTime(timeLeft)
        )}
      </div>
      <div className="text-sm text-gray-600 mt-2">
        {isExpired ? 'Quiz has ended' : 'Time Remaining'}
      </div>
    </div>
  );
};

export default function StudentSpaceRace() {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const [raceData, setRaceData] = useState(null);
  const [participantData, setParticipantData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [teams, setTeams] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isRaceStarted, setIsRaceStarted] = useState(false);
  const [showTeamMembers, setShowTeamMembers] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [teamScore, setTeamScore] = useState(0);

  const loadRaceData = async () => {
    try {
      setIsLoading(true);
      
      // Get student data from session storage
      const studentName = sessionStorage.getItem('studentName');
      const sessionCode = sessionStorage.getItem('sessionCode');
      const storedRaceData = sessionStorage.getItem('raceData');
      
      if (!studentName || !storedRaceData) {
        setError('Missing session data. Please join again.');
        return;
      }
      
      const raceDataFromStorage = JSON.parse(storedRaceData);
      
      // Check if we have quiz data and redirect to quiz instead of showing leaderboard
      if (raceDataFromStorage.quiz && raceDataFromStorage.quiz.questions && raceDataFromStorage.quiz.questions.length > 0) {
        // Use the quizId from the race data or fall back to quiz.id
        const quizId = raceDataFromStorage.quizId || raceDataFromStorage.quiz.id;
        console.log('Space Race has quiz data, redirecting to quiz:', { quizId, quiz: raceDataFromStorage.quiz.title });
        
        // Store quiz data for the quiz attempt page
        localStorage.setItem('spaceRaceQuiz', JSON.stringify(raceDataFromStorage.quiz));
        navigate(`/student/quiz/${quizId}`, { replace: true });
        return;
      }
      
      // Use the race data that was already fetched during join
      setRaceData(raceDataFromStorage);
      setParticipantData(raceDataFromStorage.participant);
      
      // Load latest participant data to get current score
      try {
        const participantResponse = await spaceRacesAPI.getRaceParticipants(raceId);
        if (participantResponse.data && participantResponse.data.success) {
          const participants = participantResponse.data.data.participants || [];
          const updatedParticipant = participants.find(p => p.id === raceDataFromStorage.participant.id);
          
          if (updatedParticipant) {
            setParticipantData(updatedParticipant);
            console.log('📊 Updated participant score:', updatedParticipant.score);
            
            // Update mock participants with latest score
            const mockParticipants = [
              { id: updatedParticipant.id, name: updatedParticipant.name, score: updatedParticipant.score || 0, teamId: updatedParticipant.teamId || 1 },
            ];
            
            setParticipants(mockParticipants);
            
            // Calculate team scores
            const teamScores = {};
            mockParticipants.forEach(p => {
              if (!teamScores[p.teamId]) {
                teamScores[p.teamId] = { score: 0, members: [] };
              }
              teamScores[p.teamId].score += p.score;
              teamScores[p.teamId].members.push(p);
            });
            
            setTeams(teamScores);
          }
        }
      } catch (scoreError) {
        console.log('⚠️ Could not fetch latest score, using cached data');
      }
      
      setIsRaceStarted(raceDataFromStorage.status === 'active');
    } catch (error) {
      console.error('Error loading race data:', error);
      setError('Failed to load race data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRaceData();
    
    // Set up periodic score updates
    const scoreUpdateInterval = setInterval(async () => {
      if (raceData && raceData.status === 'active') {
        try {
          const participantResponse = await spaceRacesAPI.getRaceParticipants(raceId);
          if (participantResponse.data && participantResponse.data.success) {
            const participants = participantResponse.data.data.participants || [];
            const participantId = participantData?.id || JSON.parse(sessionStorage.getItem('raceData') || '{}').participant?.id;
            const updatedParticipant = participants.find(p => p.id === participantId);
            
            if (updatedParticipant && updatedParticipant.score !== participantData?.score) {
              setParticipantData(updatedParticipant);
              console.log('📊 Live score update:', updatedParticipant.score);
              
              // Update display
              const mockParticipants = [
                { id: updatedParticipant.id, name: updatedParticipant.name, score: updatedParticipant.score || 0, teamId: updatedParticipant.teamId || 1 },
              ];
              
              setParticipants(mockParticipants);
              
              const teamScores = {};
              mockParticipants.forEach(p => {
                if (!teamScores[p.teamId]) {
                  teamScores[p.teamId] = { score: 0, members: [] };
                }
                teamScores[p.teamId].score += p.score;
                teamScores[p.teamId].members.push(p);
              });
              
              setTeams(teamScores);
              
              // Update team score for current user's team
              if (updatedParticipant.teamId) {
                setTeamScore(teamScores[updatedParticipant.teamId]?.score || 0);
              }
            }
          }
        } catch (error) {
          console.log('⚠️ Live score update failed');
        }
      }
    }, 3000); // Update every 3 seconds
    
    return () => clearInterval(scoreUpdateInterval);
  }, [raceId, navigate, raceData, participantData]);

  // Listen to synchronized team scores from Firebase
  const teamScorePath = raceId && participantData?.teamId
    ? `space_race_team_scores/${raceId}/team_${participantData.teamId}`
    : null;

  const { value: firebaseTeamScore } = useRtdbValue(teamScorePath, {
    enabled: Boolean(teamScorePath),
  });

  useEffect(() => {
    if (firebaseTeamScore !== null && firebaseTeamScore !== undefined) {
      console.log('🔄 Received team score from Firebase:', firebaseTeamScore);
      setTeamScore(firebaseTeamScore);
      
      // Update the teams object to reflect the synchronized team score
      setTeams(prev => {
        const updated = { ...prev };
        if (participantData?.teamId) {
          updated[participantData.teamId] = {
            ...updated[participantData.teamId],
            score: firebaseTeamScore
          };
        }
        return updated;
      });
    }
  }, [firebaseTeamScore, participantData]);

  const handleTimeUp = () => {
    console.log('Timer expired - race ended');
    setIsRaceStarted(false);
    // Show a message that the race has ended
    setTimeout(() => {
      navigate('/join', { replace: true });
    }, 5000);
  };

  const loadParticipants = async (participant) => {
    try {
      // For now, we'll show just the current participant
      // In a real implementation, this would use a real-time listener
      
      if (participant) {
        const mockParticipants = [
          { id: participant.id, name: participant.name, score: participant.score || 0, teamId: participant.teamId || 1 },
        ];
        
        setParticipants(mockParticipants);
        
        // Calculate team scores
        const teamScores = {};
        mockParticipants.forEach(p => {
          if (!teamScores[p.teamId]) {
            teamScores[p.teamId] = { score: 0, members: [] };
          }
          teamScores[p.teamId].score += p.score;
          teamScores[p.teamId].members.push(p);
        });
        
        setTeams(teamScores);
        
        // Set initial team score for current user's team
        if (participant.teamId) {
          setTeamScore(teamScores[participant.teamId]?.score || 0);
        }
      }
    } catch (error) {
      console.error('Error loading participants:', error);
    }
  };

  const handleLeaveRace = () => {
    localStorage.removeItem('spaceRaceData');
    localStorage.removeItem('spaceRaceParticipant');
    navigate('/join');
  };

  const getTeamColor = (teamId) => {
    const colors = [
      'bg-blue-500',
      'bg-red-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-cyan-500',
      'bg-orange-500',
      'bg-teal-500',
      'bg-indigo-500'
    ];
    return colors[teamId - 1] || 'bg-gray-500';
  };

  const getRaceIcon = (icon) => {
    const iconMap = {
      rocket: Rocket,
      flame: Flame,
      zap: Zap,
      star: Star,
      trophy: Trophy,
      flag: Flag,
    };
    return iconMap[icon] || Rocket;
  };

  const getTeamProgress = (teamId) => {
    const maxScore = 500; // Maximum possible score
    const teamScore = teams[teamId]?.score || 0;
    return Math.min((teamScore / maxScore) * 100, 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <Rocket className="w-16 h-16 text-white animate-pulse mx-auto mb-4" />
          <div className="text-white text-xl">Launching Space Race...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-white/80 mb-6">{error}</p>
          <button
            onClick={handleLeaveRace}
            className="px-6 py-2 bg-white text-purple-900 rounded-lg hover:bg-white/90 transition-colors"
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  if (!raceData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Race Not Found</h2>
          <p className="text-white/80 mb-6">The Space Race you're looking for doesn't exist.</p>
          <button
            onClick={handleLeaveRace}
            className="px-6 py-2 bg-white text-purple-900 rounded-lg hover:bg-white/90 transition-colors"
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900">
      {/* Stars background effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: Math.random() * 0.8 + 0.2
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLeaveRace}
                className="flex items-center space-x-2 text-white/80 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Leave Race</span>
              </button>
              <div className="h-8 w-px bg-white/20"></div>
              <div className="flex items-center space-x-2">
                <Rocket className="h-6 w-6 text-yellow-400" />
                <h1 className="text-xl font-semibold text-white">Space Race</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-sm text-white/80">
                Welcome, <span className="font-medium text-white">{participantData?.name}</span>
              </div>
              {participantData?.teamId && (
                <>
                  <div className={`px-3 py-1 ${getTeamColor(participantData.teamId)} text-white rounded-full text-sm font-medium flex items-center space-x-1`}>
                    <Zap className="w-3 h-3" />
                    Team {participantData.teamId}
                  </div>
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className={`p-2 rounded-lg transition-colors ${showChat ? 'bg-primary text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    title="Team Chat"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Leaderboard */}
          <div className={`transition-all duration-300 ${showChat ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
              {/* Team Rankings with Static Rockets */}
              <div className="space-y-4 mb-8">
                {Object.entries(teams)
                  .sort(([,a], [,b]) => b.score - a.score) // Sort by score (highest first)
                  .map(([teamId, teamData], index) => (
                  <div key={teamId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {/* Team Position Indicator */}
                        <div className="text-2xl font-bold text-white/60 w-8">
                          {index + 1}
                        </div>
                        
                        {/* Static Team Symbol */}
                        <div className={`w-8 h-8 rounded-full ${getTeamColor(parseInt(teamId))} flex items-center justify-center`}>
                          {(() => {
                            const IconComponent = getRaceIcon(raceData?.settings?.icon || 'rocket');
                            return <IconComponent className="w-4 h-4 text-white" />;
                          })()}
                        </div>
                        
                        <span className="text-white font-medium">Team {teamId}</span>
                        
                        {/* Winner Crown for top team */}
                        {index === 0 && (
                          <div className="text-yellow-400">
                            🏆
                          </div>
                        )}
                      </div>
                      <div className="text-white font-bold">{teamData.score} pts</div>
                    </div>
                    
                    {/* Static Progress Bar */}
                    <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden ml-12">
                      <div 
                        className={`h-full ${getTeamColor(parseInt(teamId))} transition-all duration-1000 ease-out`}
                        style={{ width: `${getTeamProgress(parseInt(teamId))}%` }}
                      >
                        <div className="h-full bg-white/30 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              </div>
          </div>

          {/* Team Chat Panel */}
          {showChat && participantData?.teamId && (
            <div className="lg:col-span-1 h-[600px]">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 h-full overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 bg-primary text-white border-b border-primary/20">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5" />
                    <h3 className="font-semibold">Team Chat</h3>
                  </div>
                  <button
                    onClick={() => setShowChat(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SpaceRaceTeamChat
                  raceId={raceId}
                  teamId={participantData.teamId}
                  participant={participantData}
                />
              </div>
            </div>
          )}

          {/* Race Info */}
          <div className={`lg:col-span-1 ${showChat ? 'hidden lg:block' : ''}`}>
            {/* Timer Display */}
            {raceData && (raceData.endTime || raceData.timerSeconds) && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Quiz Timer */}
                  <div className="text-center">
                    <h4 className="text-white/80 text-sm mb-2">Quiz Time Left</h4>
                    <TimerDisplay 
                      timerInfo={{
                        endTime: raceData.endTime,
                        timerSeconds: raceData.timerSeconds
                      }} 
                      onTimeUp={handleTimeUp}
                    />
                  </div>
                  
                  {/* Join Duration Display */}
                  {raceData.settings?.joinDuration && (
                    <div className="text-center">
                      <h4 className="text-white/80 text-sm mb-2">Join Duration</h4>
                      <div className="text-3xl font-bold text-white">
                        {raceData.settings.joinDuration} min
                      </div>
                      <p className="text-xs text-white/60 mt-1">
                        Total time for quiz
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Race Status</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Clock className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="text-sm text-white/60">Status</p>
                    <p className="font-medium text-white capitalize">
                      {isRaceStarted ? 'Race Active' : 'Waiting to Start'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-sm text-white/60">Your Score</p>
                    <p className="font-medium text-white">{participantData?.score || 0}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <div>
                    <p className="text-sm text-white/60">Team</p>
                    <p className="font-medium text-white">
                      {participantData?.teamId ? `Team ${participantData.teamId}` : 'Not assigned'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Race Code Display */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
              <p className="text-sm text-white/60 mb-2">Race Code:</p>
              <div className="text-3xl font-bold text-yellow-400 font-mono text-center mb-4">
                {sessionStorage.getItem('sessionCode')}
              </div>
              <div className="text-center">
                <p className="text-xs text-white/60">Share with friends to join!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
