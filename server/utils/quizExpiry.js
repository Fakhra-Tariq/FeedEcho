/**
 * Same availability-window rule as the host Library countdown:
 * launched + launchSettings.endTime vs now. No endTime = never expires.
 */

function getQuizEndTimeMs(quiz) {
  const endTime = quiz?.launchSettings?.endTime;
  if (!endTime) return null;
  const ms = new Date(endTime).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isQuizExpired(quiz, now = Date.now()) {
  if (!quiz) return false;
  const status = String(quiz.status || '').toLowerCase();
  const launched = quiz.launched === true || status === 'launched' || status === 'active';
  if (!launched) return false;
  const endMs = getQuizEndTimeMs(quiz);
  if (endMs == null) return false;
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  return endMs <= nowMs;
}

function isQuizCurrentlyActive(quiz, now = Date.now()) {
  if (!quiz) return false;
  const status = String(quiz.status || '').toLowerCase();
  if (['ready', 'ended', 'finished', 'completed', 'archived'].includes(status)) {
    return false;
  }
  const launched = quiz.launched === true || status === 'launched' || status === 'active';
  if (!launched) return false;
  if (isQuizExpired(quiz, now)) return false;
  return true;
}

module.exports = {
  getQuizEndTimeMs,
  isQuizExpired,
  isQuizCurrentlyActive,
};
