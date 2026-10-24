/**
 * Quiz availability window — same fields as Library "Time left"
 * (launchSettings.endTime vs the device clock, ISO from launch).
 * No endTime means no time limit and the quiz never expires.
 */

export function getQuizTimeRemaining(quiz, now = Date.now()) {
  if (!quiz?.launched || !quiz.launchSettings?.endTime) {
    return null;
  }

  const endTime = new Date(quiz.launchSettings.endTime).getTime();
  if (Number.isNaN(endTime)) return null;

  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const remaining = endTime - nowMs;
  if (remaining <= 0) return 0;
  return Math.floor(remaining / 1000);
}

export function isQuizExpired(quiz, now = Date.now()) {
  const remaining = getQuizTimeRemaining(quiz, now);
  return remaining === 0;
}

export function isQuizCurrentlyActive(quiz, now = Date.now()) {
  if (!quiz) return false;
  const status = String(quiz.status || '').toLowerCase();
  if (status === 'ready' || status === 'ended' || status === 'finished' || status === 'completed' || status === 'archived') {
    return false;
  }
  const launched = quiz.launched === true || status === 'launched' || status === 'active';
  if (!launched) return false;
  if (isQuizExpired(quiz, now)) return false;
  return true;
}
