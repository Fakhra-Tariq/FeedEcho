import { useEffect, useState } from 'react';
import { isJoinWindowExpired } from './spaceRaceJoinWindow';

/** Host End Race writes status "completed" (also accept ended/finished). */
export function isSpaceRaceEndedByTeacher(race) {
  const status = String(race?.status || '').toLowerCase();
  if (status === 'ended' || status === 'completed' || status === 'finished') return true;
  if (race?.isActive === false) return true;
  return false;
}

export function getQuizDeadlineMs(endIso) {
  if (!endIso) return null;
  const t = new Date(endIso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * completed → completed
 * teacher ended → inside ? race_ended : closed
 * inside and (join or quiz deadline passed) → times_up
 * outside and join/quiz deadline passed → closed
 * else open
 */
export function resolveSpaceRaceAudiencePhase({
  completed = false,
  insideQuiz = false,
  race = null,
  nowMs = Date.now(),
  quizEndMs = null,
  joinExpired: joinExpiredOverride,
} = {}) {
  if (completed) return 'completed';
  if (isSpaceRaceEndedByTeacher(race)) {
    return insideQuiz ? 'race_ended' : 'closed';
  }
  const joinExpired =
    joinExpiredOverride != null
      ? Boolean(joinExpiredOverride)
      : isJoinWindowExpired(race, nowMs);
  const quizExpired =
    quizEndMs != null && Number.isFinite(Number(quizEndMs)) && nowMs >= Number(quizEndMs);
  if (insideQuiz && (joinExpired || quizExpired)) return 'times_up';
  if (!insideQuiz && (joinExpired || quizExpired)) return 'closed';
  return 'open';
}

/** Wall clock + optional RTDB offset; ticks every second and on tab wake. */
export function useAlignedNowMs(serverTimeOffset = 0, enabled = true) {
  const [wallMs, setWallMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setWallMs(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    const onWake = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      tick();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [enabled]);

  return wallMs + (Number(serverTimeOffset) || 0);
}

export const SPACE_RACE_ENDED_BY_TEACHER_MESSAGE = 'This Space Race has already ended.';
