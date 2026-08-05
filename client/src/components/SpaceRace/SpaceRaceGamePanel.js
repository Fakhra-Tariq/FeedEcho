import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Trophy, Clock, Users, Star, Zap, Flame, Flag } from 'lucide-react';
import { useRtdbList, useRtdbValue } from '../../hooks/useRtdb';
import { spaceRacesAPI } from '../../services/api';

const TimerDisplay = ({ timerInfo, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!timerInfo?.endTime) return;

    const calculateTimeLeft = () => {
      const now = Date.now();
      const end = new Date(timerInfo.endTime).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setTimeLeft(0);
        if (!isExpired) {
          setIsExpired(true);
          onTimeUp?.();
        }
        return;
      }

      setTimeLeft(Math.floor(difference / 1000));
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
    if (isExpired) return 'text-error-600';
    if (timeLeft <= 30) return 'text-warning-600';
    if (timeLeft <= 60) return 'text-secondary';
    return 'text-success-600';
  };

  return (
    <div className={`text-2xl font-bold ${getTimeColor()} flex items-center justify-center`}>
      <Clock className="w-5 h-5 mr-2" />
      {isExpired ? "Time's Up!" : formatTime(timeLeft)}
    </div>
  );
};

// Join duration timer component
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

const getTeamColor = (teamId) => {
  const colors = [
    'bg-blue-500',
    'bg-red-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-teal-500',
    'bg-indigo-500'
  ];
  return colors[(Number(teamId) || 1) - 1] || 'bg-neutral-400';
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

const normalizeTeamScores = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const teamId = String(key).replace(/^team_/, '');
    const score = typeof value === 'number' ? value : Number(value?.score || 0);
    out[teamId] = Number.isFinite(score) ? score : 0;
  });
  return out;
};

export default function SpaceRaceGamePanel({
  raceId,
  participant,
  quizId,
  onTimeUp,
  compact = false,
}) {
  const navigate = useNavigate();
  const { value: raceData } = useRtdbValue(raceId ? `spaceRaces/${raceId}` : null, {
    enabled: Boolean(raceId),
  });

  // Listen to team-specific timer
  const { value: teamTimer } = useRtdbValue(
    raceId && participant?.teamId != null ? `space_race_team_timers/${raceId}/team_${participant.teamId}` : null,
    { enabled: Boolean(raceId && participant?.teamId != null) }
  );

  const { list: allParticipants, error: participantsRtdbError } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId), empty: [] }
  );

  const { value: teamScoresRaw, error: teamScoresRtdbError } = useRtdbValue(
    raceId ? `space_race_team_scores/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const [apiStandings, setApiStandings] = useState({ participants: [], teamScores: {} });

  const fetchStandingsFromApi = useCallback(async () => {
    if (!raceId) return;
    try {
      const response = await spaceRacesAPI.getStandings(raceId);
      if (response.data?.success) {
        setApiStandings({
          participants: response.data.data?.participants || [],
          teamScores: response.data.data?.teamScores || {},
        });
      }
    } catch (error) {
      console.warn('Standings API fetch failed:', error);
    }
  }, [raceId]);

  const useApiStandingsFallback = Boolean(participantsRtdbError || teamScoresRtdbError);

  useEffect(() => {
    if (!useApiStandingsFallback) {
      setApiStandings({ participants: [], teamScores: {} });
      return undefined;
    }
    fetchStandingsFromApi();
    const interval = setInterval(fetchStandingsFromApi, 3000);
    return () => clearInterval(interval);
  }, [fetchStandingsFromApi, useApiStandingsFallback]);

  const effectiveParticipants = useMemo(() => {
    if (allParticipants.length > 0) return allParticipants;
    return apiStandings.participants;
  }, [allParticipants, apiStandings.participants]);

  const teamScores = useMemo(() => normalizeTeamScores(teamScoresRaw), [teamScoresRaw]);

  const teamScoresFromParticipants = useMemo(() => {
    const scores = {};
    effectiveParticipants.forEach((p) => {
      const teamId = String(p.teamId ?? 1);
      const memberScore = Number(p.score ?? 0);
      scores[teamId] = Math.max(scores[teamId] ?? 0, memberScore);
    });
    return scores;
  }, [effectiveParticipants]);

  const mergedTeamScores = useMemo(() => {
    const merged = { ...teamScoresFromParticipants };
    Object.entries(teamScores).forEach(([teamId, score]) => {
      merged[teamId] = Math.max(Number(merged[teamId] ?? 0), Number(score ?? 0));
    });
    Object.entries(apiStandings.teamScores || {}).forEach(([teamId, score]) => {
      merged[teamId] = Math.max(Number(merged[teamId] ?? 0), Number(score ?? 0));
    });
    return merged;
  }, [teamScores, teamScoresFromParticipants, apiStandings.teamScores]);

  const sortedTeams = useMemo(() => {
    const teamIds = new Set([
      ...Object.keys(mergedTeamScores),
      ...effectiveParticipants.map((p) => String(p.teamId || 1)),
    ]);

    return Array.from(teamIds)
      .map((teamId) => ({
        teamId,
        score: mergedTeamScores[teamId] ?? 0,
        members: effectiveParticipants.filter((p) => String(p.teamId) === String(teamId)),
      }))
      .sort((a, b) => b.score - a.score);
  }, [mergedTeamScores, effectiveParticipants]);

  const maxTeamScore = useMemo(() => {
    const scores = sortedTeams.map((t) => t.score);
    return Math.max(...scores, 1);
  }, [sortedTeams]);

  const myTeamScore = useMemo(() => {
    if (participant?.teamId == null) return 0;
    return mergedTeamScores[String(participant.teamId)] ?? 0;
  }, [mergedTeamScores, participant?.teamId]);

  const myIndividualScore = useMemo(() => {
    const me = effectiveParticipants.find((p) => p.id === participant?.id);
    // Use the participant's actual score from the database, not the team score
    return Number(me?.score ?? participant?.score ?? 0);
  }, [effectiveParticipants, participant]);

  const leadingTeamId = sortedTeams[0]?.teamId;
  const hasQuiz = Boolean(quizId || raceData?.quizId);
  const isActive = raceData?.status === 'active';
  
  // Check if participant has already attempted the quiz
  const hasAttemptedQuiz = useMemo(() => {
    const me = effectiveParticipants.find((p) => p.id === participant?.id);
    // Check if participant has PERSONALLY submitted answers (not inherited from teammates)
    // or has completedAt timestamp (set when they finish the quiz)
    const hasPersonalAnswers = me?.answers && Array.isArray(me.answers) && 
      me.answers.some(a => a.awardedByTeammate !== true);
    return Boolean(hasPersonalAnswers) || Boolean(me?.completedAt);
  }, [effectiveParticipants, participant]);

  const handleStartQuiz = async () => {
    const qId = quizId || raceData?.quizId;
    if (qId && raceId && participant?.teamId != null) {
      // Always call startQuiz to ensure timer is set properly for this team
      // The backend handles the case where quiz is already started for this team
      try {
        // Quiz duration only (settings.countdown). Never use timerSeconds — that is join/waiting duration.
        const timerSeconds = raceData?.settings?.countdown || 600;
        console.log('🚀 Starting quiz with timer:', { raceId, quizId: qId, timerSeconds, teamId: participant.teamId });

        const response = await spaceRacesAPI.startQuiz(raceId, {
          quizId: qId,
          timerSeconds,
          teamId: participant.teamId
        });

        console.log('✅ Quiz timer started:', response.data);
        // If backend returned an endTime (quiz already started), store it for the quiz page
        if (response.data?.endTime) {
          localStorage.setItem('spaceRaceEndTime', response.data.endTime);
          localStorage.setItem('spaceRaceTeamId', String(participant.teamId));
          console.log('🕐 Stored synchronized endTime for team:', participant.teamId, response.data.endTime);
        }
      } catch (error) {
        console.error('Failed to start quiz timer:', error);
        // Continue anyway - the quiz can still be taken
      }

      navigate(`/audience/space-race/${raceId}/quiz/${qId}`);
    }
  };

  const renderTeamRow = (teamId, score, members, index, compactRow = false) => {
    const progress = Math.min((score / maxTeamScore) * 100, 100);
    const isLeading = String(teamId) === String(leadingTeamId);
    const isMyTeam =
      participant?.teamId != null && String(participant.teamId) === String(teamId);
    const roundedScore = Math.round(score);

    if (compactRow) {
      return (
        <div
          key={teamId}
          className="flex-shrink-0 w-40 bg-white rounded-lg p-2 border border-neutral-200 shadow-soft"
        >
          <div className="flex items-center justify-between text-xs text-text mb-1">
            <span className="font-medium">
              {index === 0 && '🏆 '}Team {teamId}
            </span>
            <span>{roundedScore}</span>
          </div>
          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${getTeamColor(teamId)} transition-all duration-700`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      );
    }

    return (
      <div key={teamId} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text/50 font-bold w-6">{index + 1}</span>
            <div
              className={`w-8 h-8 rounded-full ${getTeamColor(teamId)} flex items-center justify-center`}
            >
              {(() => {
                const IconComponent = getRaceIcon(raceData?.settings?.icon || 'rocket');
                return <IconComponent className="w-4 h-4 text-white" />;
              })()}
            </div>
            <span className="text-text font-medium">Team {teamId}</span>
            {isLeading && index === 0 && <span className="text-secondary">🏆</span>}
            {isMyTeam && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Your team
              </span>
            )}
          </div>
          <span className="text-text font-bold">{roundedScore} pts</span>
        </div>

        <div className="relative w-full bg-neutral-200 rounded-full h-4 overflow-hidden ml-9">
          <div
            className={`h-full ${getTeamColor(teamId)} transition-all duration-700 ease-out relative`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-2 ml-9">
          {members.slice(0, 6).map((member) => (
            <span
              key={member.id}
              className="text-xs bg-neutral-100 text-text/80 px-2 py-1 rounded-full border border-neutral-200"
            >
              {member.name} ({Math.round(member.score || 0)})
            </span>
          ))}
        </div>
      </div>
    );
  };

  if (compact) {
    // Hide live standings during quiz
    if (window.location.pathname.includes('/quiz/')) {
      return null;
    }
    return (
      <div className="bg-white border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <Trophy className="w-4 h-4 text-secondary" />
            Live standings
          </h3>
          {teamTimer?.endTime && (
            <TimerDisplay timerInfo={{ endTime: teamTimer.endTime }} onTimeUp={onTimeUp} />
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {sortedTeams.map(({ teamId, score, members }, index) =>
            renderTeamRow(teamId, score, members, index, true)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            {raceData?.title || 'Space Race'}
          </h2>
          <p className="text-text/70 text-sm mt-1">
            Welcome, {participant?.name || 'Student'}
            {participant?.teamId != null && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary font-medium">
                <Zap className="w-3 h-3" />
                Team {participant.teamId}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!window.location.pathname.includes('/quiz/') && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-soft px-4 py-2">
              <p className="text-text/60 text-xs text-center mb-1">Time left</p>
              <JoinDurationTimer raceData={raceData} className="text-lg font-semibold text-primary" />
            </div>
          )}
          {window.location.pathname.includes('/quiz/') && teamTimer?.endTime && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-soft px-4 py-2">
              <p className="text-text/60 text-xs text-center mb-1">Quiz time left</p>
              <TimerDisplay timerInfo={{ endTime: teamTimer.endTime }} onTimeUp={onTimeUp} />
            </div>
          )}
        </div>
      </div>

      {hasQuiz && !window.location.pathname.includes('/quiz/') && !hasAttemptedQuiz && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-text text-sm">The quiz is ready — coordinate with your team and compete!</p>
          <button
            type="button"
            onClick={handleStartQuiz}
            className="px-5 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Start Quiz
          </button>
        </div>
      )}
      
      {hasAttemptedQuiz && !window.location.pathname.includes('/quiz/') && (
        <div className="bg-neutral-100 border border-neutral-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-text text-sm">You have already attempted this quiz.</p>
          <div className="px-5 py-2 bg-neutral-300 text-neutral-600 rounded-lg font-semibold whitespace-nowrap">
            Quiz Completed
          </div>
        </div>
      )}

      {/* Communication encouragement message */}
      {!hasAttemptedQuiz && !window.location.pathname.includes('/quiz/') && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-text font-medium text-sm">Team Chat</p>
              <p className="text-text/70 text-sm mt-1">
                Communicate with your team members here. Share answers, discuss questions, and work together to win!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team score summary (simplified, no leaderboard) - Hidden for students */}
      {false && (
        <div className="bg-white rounded-xl shadow-soft border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-success-600" />
            <div>
              <p className="text-text/60 text-sm">Your team score</p>
              <p className="text-text font-semibold text-lg">{myTeamScore} pts</p>
              <p className="text-text/50 text-xs mt-1">
                You contributed: {myIndividualScore} pts
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-soft border border-neutral-200 p-4">
        <div className="flex items-center gap-3">
          <Star className="w-5 h-5 text-secondary" />
          <div>
            <p className="text-text/60 text-sm">Race status</p>
            <p className="text-text font-semibold capitalize">
              {isActive ? 'Active' : raceData?.status || 'Waiting'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
