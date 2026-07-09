import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { spaceRacesAPI } from '../services/api';
import { Rocket, ArrowLeft, ExternalLink, Users, ChevronDown, ChevronUp, Clock, Flame, Zap, Star, Trophy, Flag } from 'lucide-react';

const TEAM_COLORS = [
  { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-700', label: 'Blue' },
  { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-700', label: 'Red' },
  { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-700', label: 'Green' },
  { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-700', label: 'Yellow' },
  { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-700', label: 'Purple' },
  { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-700', label: 'Pink' },
  { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-700', label: 'Cyan' },
  { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-700', label: 'Orange' },
  { bg: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-700', label: 'Teal' },
  { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-700', label: 'Indigo' },
];

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

const normalizeTeamScores = (raw) => {
  // Accept {1: 20, 2: 10} OR {1: {teamId, score, members}} OR array of those.
  const out = {};
  if (!raw) return out;

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      const teamId = entry?.teamId;
      if (teamId === undefined || teamId === null) return;
      const score = typeof entry?.score === 'number' ? entry.score : Number(entry?.score || 0);
      out[teamId] = Number.isFinite(score) ? score : 0;
    });
    return out;
  }

  if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => {
      const teamId = Number(k);
      if (!Number.isFinite(teamId)) return;
      if (typeof v === 'number') {
        out[teamId] = v;
      } else if (v && typeof v === 'object') {
        const score = typeof v.score === 'number' ? v.score : Number(v.score || 0);
        out[teamId] = Number.isFinite(score) ? score : 0;
      } else {
        out[teamId] = 0;
      }
    });
  }
  return out;
};

// Join duration timer component - shows time students have to join
const JoinDurationTimer = ({ raceData, className = '' }) => {
  const [timeLeft, setTimeLeft] = useState('--:--');

  useEffect(() => {
    if (!raceData) {
      setTimeLeft('--:--');
      return;
    }

    const calculateTimeLeft = () => {
      try {
        // Calculate join duration time based on race start time and joinDuration setting
        if (!raceData.startedAt) {
          const joinDurationMinutes = raceData.settings?.joinDuration || 30;
          setTimeLeft(`${joinDurationMinutes}:00`);
          return;
        }

        const now = new Date().getTime();
        const start = new Date(raceData.startedAt).getTime();
        const joinDurationMinutes = raceData.settings?.joinDuration || 30;
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
      } catch (error) {
        console.error('Error calculating join duration time left:', error);
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

// Quiz duration timer component - shows quiz time after it starts
const QuizDurationTimer = ({ raceData, className = '' }) => {
  const [timeLeft, setTimeLeft] = useState('--:--');

  useEffect(() => {
    if (!raceData) {
      setTimeLeft('--:--');
      return;
    }

    const calculateTimeLeft = () => {
      try {
        // Only show quiz timer if quiz has started (endTime is set and race is active)
        if (!raceData.endTime || raceData.status !== 'active') {
          setTimeLeft('--:--');
          return;
        }

        const now = new Date().getTime();
        const end = new Date(raceData.endTime).getTime();
        
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
      } catch (error) {
        console.error('Error calculating quiz duration time left:', error);
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

export default function TeacherSpaceRaceDisplay() {
  const { raceId } = useParams();
  const [raceData, setRaceData] = useState(null);
  const [teamScores, setTeamScores] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTeams, setExpandedTeams] = useState(new Set());

  const loadRaceData = useCallback(async () => {
    if (!raceId) return;
    try {
      const response = await spaceRacesAPI.getById(raceId);
      if (response.data.success) {
        const raceData = response.data.data;
        setRaceData(raceData);
        console.log('📊 Updated race data with stats:', {
          questionsCount: raceData.questionsCount,
          participantsCount: raceData.participantsCount,
          teamsCount: raceData.teamsCount,
          timeLeft: raceData.timeLeft
        });
      }
    } catch (error) {
      console.error('Error loading race data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [raceId]);

  const loadTeamScores = useCallback(async () => {
    if (!raceId) return;
    try {
      console.log('Loading team scores for race:', raceId);
      const res = await spaceRacesAPI.getParticipants(raceId, { recalculate: true });
      console.log('Team scores response:', res.data);
      
      if (res.data?.success && res.data?.data) {
        const { teamScores, participants } = res.data.data;
        console.log('Setting team scores:', teamScores);
        console.log('Setting participants:', participants);
        setTeamScores(normalizeTeamScores(teamScores));
        setParticipants(participants || []);
      } else {
        console.error('Failed to load team scores:', res.data);
      }
    } catch (e) {
      console.error('Error loading team scores:', e);
      // Try debug endpoint as fallback
      try {
        console.log('Trying debug endpoint...');
        const debugRes = await spaceRacesAPI.getDebugInfo(raceId);
        console.log('Debug response:', debugRes.data);
        
        if (debugRes.data?.success && debugRes.data?.data) {
          const { teamScores, participants } = debugRes.data.data;
          console.log('Debug - Setting team scores:', teamScores);
          console.log('Debug - Setting participants:', participants);
          setTeamScores(normalizeTeamScores(teamScores));
          setParticipants(participants || []);
        }
      } catch (debugError) {
        console.error('Debug endpoint also failed:', debugError);
      }
    }
  }, [raceId]);

  useEffect(() => {
    loadRaceData();
    loadTeamScores();
    
    // Set up real-time updates for both race data and team scores
    const raceDataInterval = setInterval(loadRaceData, 2000); // Update race stats every 2 seconds
    const teamScoresInterval = setInterval(loadTeamScores, 3000); // Update team scores every 3 seconds
    
    return () => {
      clearInterval(raceDataInterval);
      clearInterval(teamScoresInterval);
    };
  }, [raceId, loadRaceData, loadTeamScores]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!raceData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text mb-4">Race not found</h2>
          <Link
            to="/teacher/space-race"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/90"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Space Races
          </Link>
        </div>
      </div>
    );
  }

  const teamCount = raceData.settings?.numberOfTeams || 2;
  const allScores = Object.values(teamScores).map((v) => (typeof v === 'number' ? v : 0));
  const maxScore = 100; // Total possible score is always 100
  
  // Calculate relative positions for all teams
  const getTeamPositions = () => {
    const positions = [];
    for (let i = 1; i <= teamCount; i++) {
      const score = teamScores[i] ?? 0;
      positions.push({ teamId: i, score });
    }
    // Sort by score to get ranking
    positions.sort((a, b) => b.score - a.score);
    return positions;
  };
  
  const teamPositions = getTeamPositions();

  // Helper function to get participants for a specific team
  const getTeamParticipants = (teamId) => {
    return participants
      .filter(p => p.teamId === teamId)
      .sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by score descending
  };

  // Helper to get the leading student
  const getLeadingStudent = (teamId) => {
    const teamParticipants = getTeamParticipants(teamId);
    return teamParticipants.length > 0 ? teamParticipants[0] : null;
  };

  // Toggle team members visibility
  const toggleTeamMembers = (teamId) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-text">
      {/* Header - match teacher layout theme */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                to="/teacher/space-race"
                className="flex items-center gap-2 text-text-light hover:text-text transition-colors text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Race control</span>
              </Link>
              <span className="h-6 w-px bg-gray-200" />
              <h1 className="text-lg font-semibold text-text">{raceData.title}</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-text-light" />
                <span className="text-text-light">Join Time:</span>
                <span className="font-medium text-text">
                  <JoinDurationTimer raceData={raceData} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rockets board inside a card, same card style as rest of app */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-text mb-1">Space Race</h2>
            <p className="text-text-light">
              Watch your teams compete in real-time
            </p>
          </div>

          <div className="space-y-8">
            {Array.from({ length: teamCount }).map((_, index) => {
              const teamId = index + 1;
              const rawScore = typeof teamScores[teamId] === 'number' ? teamScores[teamId] : 0;
              const score = Math.round(Math.min(100, rawScore)); // Round to whole number, cap at 100
              const progress = Math.min(100, score); // Score is the percentage
              const style = TEAM_COLORS[index] || TEAM_COLORS[0];
              const teamParticipants = getTeamParticipants(teamId);
              const leadingStudent = getLeadingStudent(teamId);
              
              // Find this team's rank (0 = first place, 1 = second place, etc.)
              const teamRank = teamPositions.findIndex(pos => pos.teamId === teamId);
              const isLeading = teamRank === 0;
              
              // Calculate rocket position based on percentage (same formula for all teams)
              // Teams with same score will show at same position
              const rocketPosition = Math.min(90, Math.max(10, (score / 100) * 80));

              return (
                <div key={teamId} className="space-y-4">
                  {/* Team Header with Score */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`text-lg font-semibold ${style.text}`}>
                        {style.label} Team
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xl font-bold tabular-nums text-text">{score}</span>
                      {teamParticipants.length > 0 && (
                        <button
                          onClick={() => toggleTeamMembers(teamId)}
                          className={`flex items-center space-x-1 px-3 py-1 rounded-lg border transition-colors ${
                            expandedTeams.has(teamId)
                              ? `bg-${style.label.toLowerCase()}-50 border-${style.label.toLowerCase()}-200 text-${style.label.toLowerCase()}-700`
                              : 'bg-gray-50 border-gray-200 text-text-light hover:bg-gray-100'
                          }`}
                        >
                          <Users className="h-4 w-4" />
                          <span className="text-sm font-medium">Show Members</span>
                          {expandedTeams.has(teamId) ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rocket Progress Bar */}
                  <div className="relative h-16 bg-gray-100 rounded-xl border-2 border-gray-200 overflow-visible">
                    <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-lg z-10 bg-gray-300" />
                    <div
                      className={`absolute left-0 top-0 bottom-0 rounded-l-lg transition-all duration-500 ease-out ${style.bg} opacity-90`}
                      style={{ width: `${progress}%`, left: 0 }}
                    />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 z-20 transition-all duration-500 ease-out flex items-center justify-center ${
                        isLeading && score > 0 ? 'scale-110' : 'scale-100'
                      }`}
                      style={{
                        left: progress <= 0 ? '16px' : `calc(${progress}% - 22px)`,
                      }}
                    >
                      <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center ${isLeading && score > 0 ? 'animate-pulse' : ''}`}>
                        {(() => {
                          const IconComponent = getRaceIcon(raceData?.settings?.icon || 'rocket');
                          return <IconComponent className="w-6 h-6 text-white drop-shadow" strokeWidth={2} />;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Team Stats */}
                  {teamParticipants.length > 0 && (
                    <div className="flex items-center justify-between text-sm text-text-light">
                      <span>{teamParticipants.length} participant{teamParticipants.length !== 1 ? 's' : ''}</span>
                      <span>Score: {score}</span>
                    </div>
                  )}

                  {/* Team Members List */}
                  {expandedTeams.has(teamId) && teamParticipants.length > 0 && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
                      <h4 className="text-sm font-semibold text-text mb-3">Team Members</h4>
                      {teamParticipants.map((participant, index) => (
                        <div key={participant.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-md border border-gray-100">
                          <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-text-light w-6">
                              {index + 1}.
                            </span>
                            <span className="font-medium text-text">
                              {participant.name}
                            </span>
                          </div>
                          <span className="font-bold text-text">
                            {Math.round(participant.score || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
