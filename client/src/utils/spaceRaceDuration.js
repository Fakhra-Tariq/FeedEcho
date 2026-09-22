/** Join Duration (minutes) must be ≥ Quiz Duration (countdown is stored in seconds). */

export const DURATION_MISMATCH_MSG =
  'Join Duration must be equal to or greater than Quiz Duration';

export const quizDurationMinutes = (countdownSeconds) => Number(countdownSeconds) / 60;

export const isJoinShorterThanQuiz = (joinMinutes, countdownSeconds) =>
  Number(joinMinutes) < quizDurationMinutes(countdownSeconds);
