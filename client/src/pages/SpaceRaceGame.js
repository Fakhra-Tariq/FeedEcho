import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { Rocket, Users, Trophy, ArrowLeft, Play, Square } from 'lucide-react';
import { spaceRacesAPI, anonymousApi } from '../services/api';

export default function SpaceRaceGame() {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const { alert } = useHybridAlert();
  const [raceData, setRaceData] = useState(null);
  const [participantData, setParticipantData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadGameData = async () => {
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
        console.log('Race data from storage:', raceDataFromStorage);
        setParticipantData(raceDataFromStorage);
        
        // Use the race data that was already fetched during join
        // No need to make another API call since we already have the data
        setRaceData(raceDataFromStorage);
        
        // Initialize teams with mock data (replace with real Firebase listeners)
        const mockTeams = [
          { id: 1, name: 'Team Alpha', score: 0, progress: 0, color: 'bg-blue-500', members: [] },
          { id: 2, name: 'Team Beta', score: 0, progress: 0, color: 'bg-red-500', members: [] },
        ];
        
        // Add current participant to their team
        if (raceDataFromStorage.participantId) {
          const teamIndex = (raceDataFromStorage.teamId || 1) - 1;
          if (mockTeams[teamIndex]) {
            mockTeams[teamIndex].members.push({
              name: studentName,
              participantId: raceDataFromStorage.participantId
            });
          }
        }
        
        setTeams(mockTeams);
      } catch (error) {
        console.error('Error loading game data:', error);
        setError('Failed to load game data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadGameData();
  }, [raceId]);

  const handleLeaveRace = () => {
    sessionStorage.removeItem('studentName');
    sessionStorage.removeItem('sessionCode');
    sessionStorage.removeItem('raceData');
    navigate('/join');
  };

  const handleInviteStudents = () => {
    if (raceData?.joinCode) {
      const message = `Join my Space Race! Code: ${raceData.joinCode}`;
      // Copy to clipboard functionality would go here
      navigator.clipboard.writeText(message);
      alert.toast.success('Join code copied to clipboard!');
    }
  };

  const handleFinishRace = async () => {
    try {
      await spaceRacesAPI.updateStatus(raceId, 'completed');
      navigate('/teacher/space-race');
    } catch (error) {
      console.error('Error finishing race:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <Rocket className="w-16 h-16 text-white animate-pulse mx-auto mb-4" />
          <div className="text-white text-xl">Loading Space Race...</div>
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
                <div className={`px-3 py-1 ${teams[participantData.teamId - 1]?.color || 'bg-gray-500'} text-white rounded-full text-sm font-medium`}>
                  Team {participantData.teamId}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Teams Progress (3 columns) */}
          <div className="lg:col-span-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center space-x-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                <span>Team Progress</span>
              </h2>

              <div className="space-y-6">
                {teams.map((team) => (
                  <div key={team.id} className="space-y-3">
                    {/* Team Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full ${team.color}`}></div>
                        <span className="text-white font-semibold text-lg">{team.name}</span>
                      </div>
                      <div className="text-white font-bold text-xl">{team.score} pts</div>
                    </div>

                    {/* Progress Track */}
                    <div className="relative">
                      {/* Background track */}
                      <div className="w-full bg-white/20 rounded-full h-8 relative overflow-hidden">
                        {/* Progress fill */}
                        <div
                          className={`h-full ${team.color} transition-all duration-1000 ease-out relative`}
                          style={{ width: `${team.progress}%` }}
                        >
                          {/* Rocket indicator */}
                          <div 
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 transition-all duration-1000 ease-out"
                            style={{ left: `${team.progress}%` }}
                          >
                            <Rocket className="w-6 h-6 text-white drop-shadow-lg" />
                          </div>
                        </div>
                        
                        {/* Animated track lines */}
                        <div className="absolute inset-0 flex items-center">
                          {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex-1 border-r border-white/20 h-full"></div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Start/Finish markers */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-400"></div>
                      <div className="absolute right-0 top-0 bottom-0 w-1 bg-yellow-400"></div>
                    </div>

                    {/* Team Members */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {team.members.map((member, index) => (
                        <div key={index} className="bg-white/20 px-3 py-1 rounded-full text-white text-sm">
                          {member.name} ({member.score})
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Control Panel (1 column) */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Race Info */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Race Info</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-white/60">Status</p>
                    <p className="font-medium text-white capitalize">
                      {raceData?.status === 'active' ? 'Race Active' : 'Waiting to Start'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-white/60">Your Team</p>
                    <p className="font-medium text-white">
                      {participantData?.teamId ? `Team ${participantData.teamId}` : 'Not assigned'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-white/60">Your Score</p>
                    <p className="font-medium text-white">{participantData?.score || 0}</p>
                  </div>
                </div>
              </div>

              {/* Join Code */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
                <p className="text-sm text-white/60 mb-2">Race Code:</p>
                <div className="text-3xl font-bold text-yellow-400 font-mono text-center mb-4">
                  {raceData?.joinCode || '------'}
                </div>
                <button
                  onClick={handleInviteStudents}
                  className="w-full py-2 bg-yellow-400 text-purple-900 font-semibold rounded-lg hover:bg-yellow-300 transition-colors flex items-center justify-center space-x-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Invite Students</span>
                </button>
              </div>

              {/* Teacher Controls */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Controls</h3>
                <div className="space-y-3">
                  <button
                    className="w-full py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Race</span>
                  </button>
                  <button
                    onClick={handleFinishRace}
                    className="w-full py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Square className="w-4 h-4" />
                    <span>Finish Race</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
