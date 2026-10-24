/** Join Duration (minutes) must be ≥ Quiz Duration (countdown is stored in seconds). */

export const DURATION_MISMATCH_MSG =
  'Join Duration must be equal to or greater than Quiz Duration';

/** Same option values as the Launch Space Race wizard (countdown stored in seconds). */
export const SPACE_RACE_QUIZ_COUNTDOWNS = [30, 60, 120, 300, 600, 900, 1200, 1800];

/** Same option values as the Launch Space Race wizard (join duration stored in minutes). */
export const SPACE_RACE_JOIN_MINUTES = [5, 10, 15, 20, 30, 45, 60];

export const quizDurationMinutes = (countdownSeconds) => Number(countdownSeconds) / 60;

export const isJoinShorterThanQuiz = (joinMinutes, countdownSeconds) =>
  Number(joinMinutes) < quizDurationMinutes(countdownSeconds);

/** Labels match the Launch Space Race wizard dropdowns. */
export const formatQuizDurationLabel = (countdownSeconds) => {
  const seconds = Number(countdownSeconds);
  if (!Number.isFinite(seconds)) return String(countdownSeconds);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  if (minutes === 1) return '1 minute';
  if (Number.isInteger(minutes)) return `${minutes} minutes`;
  return `${minutes} minutes`;
};

export const formatJoinDurationLabel = (joinMinutes) => {
  const minutes = Number(joinMinutes);
  if (!Number.isFinite(minutes)) return String(joinMinutes);
  if (minutes === 60) return '1 hour';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
};
