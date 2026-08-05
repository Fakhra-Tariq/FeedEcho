import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRtdbList, useRtdbValue } from '../hooks/useRtdb';
import { Rocket, ArrowLeft, ExternalLink, Users, ChevronDown, ChevronUp, Clock, Flame, Zap, Star, Trophy, Flag } from 'lucide-react';

// Full Tailwind class strings only — dynamic `bg-${color}-500` is purged by JIT.
const TEAM_COLORS = [
  {
    bg: 'bg-blue-500',
    border: 'border-blue-500',
    text: 'text-blue-700',
    softBg: 'bg-blue-50',
    softBorder: 'border-blue-200',
    softText: 'text-blue-700',
    track: 'bg-blue-100',
    label: 'Blue',
  },
  {
    bg: 'bg-red-500',
    border: 'border-red-500',
    text: 'text-red-700',
    softBg: 'bg-red-50',
    softBorder: 'border-red-200',
    softText: 'text-red-700',
    track: 'bg-red-100',
    label: 'Red',
  },
  {
    bg: 'bg-green-500',
    border: 'border-green-500',
    text: 'text-green-700',
    softBg: 'bg-green-50',
    softBorder: 'border-green-200',
    softText: 'text-green-700',
    track: 'bg-green-100',
    label: 'Green',
  },
  {
    bg: 'bg-amber-500',
    border: 'border-amber-500',
    text: 'text-amber-700',
    softBg: 'bg-amber-50',
    softBorder: 'border-amber-200',
    softText: 'text-amber-700',
    track: 'bg-amber-100',
    label: 'Yellow',
  },
  {
    bg: 'bg-purple-500',
    border: 'border-purple-500',
    text: 'text-purple-700',
    softBg: 'bg-purple-50',
    softBorder: 'border-purple-200',
    softText: 'text-purple-700',
    track: 'bg-purple-100',
    label: 'Purple',
  },
  {
    bg: 'bg-pink-500',
    border: 'border-pink-500',
    text: 'text-pink-700',
    softBg: 'bg-pink-50',
    softBorder: 'border-pink-200',
    softText: 'text-pink-700',
    track: 'bg-pink-100',
    label: 'Pink',
  },
  {
    bg: 'bg-cyan-500',
    border: 'border-cyan-500',
    text: 'text-cyan-700',
    softBg: 'bg-cyan-50',
    softBorder: 'border-cyan-200',
    softText: 'text-cyan-700',
    track: 'bg-cyan-100',
    label: 'Cyan',
  },
  {
    bg: 'bg-orange-500',
    border: 'border-orange-500',
    text: 'text-orange-700',
    softBg: 'bg-orange-50',
    softBorder: 'border-orange-200',
    softText: 'text-orange-700',
    track: 'bg-orange-100',
    label: 'Orange',
  },
  {
    bg: 'bg-teal-500',
    border: 'border-teal-500',
    text: 'text-teal-700',
    softBg: 'bg-teal-50',
    softBorder: 'border-teal-200',
    softText: 'text-teal-700',
    track: 'bg-teal-100',
    label: 'Teal',
  },
  {
    bg: 'bg-indigo-500',
    border: 'border-indigo-500',
    text: 'text-indigo-700',
    softBg: 'bg-indigo-50',
    softBorder: 'border-indigo-200',
    softText: 'text-indigo-700',
    track: 'bg-indigo-100',
    label: 'Indigo',
  },
];

const getTeamStyle = (teamId) => {
  const idx = Math.max(0, (Number(teamId) || 1) - 1);
  return TEAM_COLORS[idx % TEAM_COLORS.length];
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

const readScoreValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof value === 'object') {
    const score = Number(value.score ?? value.teamScore ?? value.points ?? 0);
    return Number.isFinite(score) ? score : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTeamScores = (raw) => {
  // Accept {1: 20}, {team_1: {score}}, or array entries — RTDB uses team_N keys.
  const out = {};
  if (!raw) return out;

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      const teamId = Number(entry?.teamId);
      if (!Number.isFinite(teamId)) return;
      out[teamId] = readScoreValue(entry);
    });
    return out;
  }

  if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => {
      const teamId = Number(String(k).replace(/^team_/, ''));
      if (!Number.isFinite(teamId)) return;
      out[teamId] = readScoreValue(v);
    });
  }
  return out;
};

/** Resolve score from RTDB map using number/string/team_N keys. */
const getTeamScoreFromMap = (scoresMap, teamScoresRaw, teamId) => {
  const fromMap = scoresMap?.[teamId] ?? scoresMap?.[String(teamId)];
  if (typeof fromMap === 'number' && Number.isFinite(fromMap)) return fromMap;

  if (teamScoresRaw && typeof teamScoresRaw === 'object') {
    const direct =
      teamScoresRaw[teamId] ??
      teamScoresRaw[String(teamId)] ??
      teamScoresRaw[`team_${teamId}`] ??
      teamScoresRaw[`team_${String(teamId)}`];
    const parsed = readScoreValue(direct);
    if (parsed > 0) return parsed;
  }

  return typeof fromMap === 'number' ? fromMap : 0;
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

export default function HostSpaceRaceDisplay() {
  const { raceId } = useParams();
  const [expandedTeams, setExpandedTeams] = useState(new Set());

  const { value: raceRtdb, loading: raceLoading } = useRtdbValue(
    raceId ? `spaceRaces/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const { value: teamScoresRaw } = useRtdbValue(
    raceId ? `space_race_team_scores/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const { list: participantList } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const raceData = useMemo(() => {
    if (!raceRtdb || !raceId) return null;
    return { id: raceId, ...raceRtdb };
  }, [raceRtdb, raceId]);

  // Authoritative team scores from space_race_team_scores/{raceId}
  const teamScores = useMemo(() => normalizeTeamScores(teamScoresRaw), [teamScoresRaw]);

  const participants = useMemo(() => participantList || [], [participantList]);

  const isLoading = raceLoading && !raceData;

  // Team scores are stored out of 100 (each correct answer = 100/N points)
  const totalQuestions =
    raceData?.quiz?.questions?.length ||
    raceData?.quizQuestions?.length ||
    0;
  const maxPossibleScore = 100;

  const getTeamParticipants = (teamId) => {
    return participants
      .filter((p) => String(p.teamId) === String(teamId))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  };

  /** Prefer RTDB team score; fall back to shared member score if node lagging. */
  const resolveTeamScore = (teamId) => {
    const fromRtdb = getTeamScoreFromMap(teamScores, teamScoresRaw, teamId);
    if (fromRtdb > 0) return fromRtdb;

    const members = getTeamParticipants(teamId);
    if (members.length === 0) return fromRtdb;
    // All teammates share the same team score on participants
    return members.reduce((max, m) => Math.max(max, Number(m.score) || 0), 0);
  };

  const toggleTeamMembers = (teamId) => {
    setExpandedTeams((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

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
            to="/host/space-race"
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

  const teamPositions = Array.from({ length: teamCount }, (_, i) => {
    const teamId = i + 1;
    return { teamId, score: resolveTeamScore(teamId) };
  }).sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-gray-50 text-text">
      {/* Header - match teacher layout theme */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                to="/host/space-race"
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
              {totalQuestions > 0 ? ` · ${totalQuestions} questions` : ''}
            </p>
          </div>

          <div className="space-y-8">
            {Array.from({ length: teamCount }).map((_, index) => {
              const teamId = index + 1;
              const teamScore = Math.round(resolveTeamScore(teamId));
              const percentage =
                maxPossibleScore > 0
                  ? Math.min((teamScore / maxPossibleScore) * 100, 100)
                  : 0;
              const style = getTeamStyle(teamId);
              const teamParticipants = getTeamParticipants(teamId);

              const teamRank = teamPositions.findIndex(
                (pos) => String(pos.teamId) === String(teamId)
              );
              const isLeading = teamRank === 0 && teamScore > 0;

              return (
                <div key={teamId} className="space-y-4">
                  {/* Team Header with Score */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span
                        className={`inline-flex h-3 w-3 rounded-full ${style.bg}`}
                        aria-hidden="true"
                      />
                      <span className={`text-lg font-semibold ${style.text}`}>
                        {style.label} Team
                      </span>
                      {isLeading && (
                        <span className="text-xs font-medium text-amber-600">Leading</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`text-xl font-bold tabular-nums ${style.text}`}>
                        {teamScore}
                      </span>
                      {teamParticipants.length > 0 && (
                        <button
                          onClick={() => toggleTeamMembers(teamId)}
                          className={[
                            'flex items-center space-x-1 px-3 py-1 rounded-lg border transition-colors',
                            expandedTeams.has(teamId)
                              ? `${style.softBg} ${style.softBorder} ${style.softText}`
                              : 'bg-gray-50 border-gray-200 text-text-light hover:bg-gray-100',
                          ].join(' ')}
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

                  {/* Rocket Progress Bar — width + icon follow live team score */}
                  <div
                    className={`relative h-14 rounded-full border-2 overflow-hidden ${style.track} ${style.border}`}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-700 ease-in-out ${style.bg}`}
                      style={{
                        width: `${percentage}%`,
                        minWidth: percentage > 0 ? '2.5rem' : '0',
                      }}
                    />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 z-20 transition-all duration-700 ease-in-out flex items-center justify-center ${
                        isLeading ? 'scale-110' : 'scale-100'
                      }`}
                      style={{
                        left: `clamp(0.25rem, calc(${percentage}% - 1.25rem), calc(100% - 2.75rem))`,
                      }}
                    >
                      <div
                        className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center shadow-md ${
                          isLeading ? 'animate-pulse' : ''
                        }`}
                      >
                        {(() => {
                          const IconComponent = getRaceIcon(raceData?.settings?.icon || 'rocket');
                          return (
                            <IconComponent className="w-6 h-6 text-white drop-shadow" strokeWidth={2} />
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Team Stats */}
                  <div className={`flex items-center justify-between text-sm ${style.softText}`}>
                    <span>
                      {teamParticipants.length} participant
                      {teamParticipants.length !== 1 ? 's' : ''}
                    </span>
                    <span className={`font-semibold ${style.text}`}>Score: {teamScore}</span>
                  </div>

                  {/* Team Members List — individual scores unchanged */}
                  {expandedTeams.has(teamId) && teamParticipants.length > 0 && (
                    <div
                      className={`rounded-lg border p-4 space-y-2 ${style.softBg} ${style.softBorder}`}
                    >
                      <h4 className={`text-sm font-semibold mb-3 ${style.text}`}>Team Members</h4>
                      {teamParticipants.map((participant, memberIndex) => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between py-2 px-3 bg-white rounded-md border border-gray-100"
                        >
                          <div className="flex items-center space-x-3">
                            <span className={`text-sm font-medium w-6 ${style.softText}`}>
                              {memberIndex + 1}.
                            </span>
                            <span className="font-medium text-text">{participant.name}</span>
                          </div>
                          <span className={`font-bold ${style.text}`}>
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
