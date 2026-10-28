/** Shared helpers for the Space Race question-card quiz-duration timer only. */

export function formatSpaceRaceQuizCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function remainingSecondsUntil(endIso, nowMs) {
  if (!endIso) return null;
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

/** Host "No limit" / missing duration — do not show a quiz timer. */
export function isQuizDurationLimited(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0;
}
