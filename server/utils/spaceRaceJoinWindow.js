/** Join window = race.startedAt + settings.joinDuration (minutes). Server Date.now() is host time. */

function getJoinDurationMinutes(settings) {
  const minutes = Number(settings?.joinDuration);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

function getJoinWindowEndMs(race) {
  const minutes = getJoinDurationMinutes(race?.settings);
  if (minutes == null) return null;
  const start = race?.startedAt ? new Date(race.startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  return start + minutes * 60 * 1000;
}

function isJoinWindowExpired(race, nowMs = Date.now()) {
  const endMs = getJoinWindowEndMs(race);
  if (endMs == null) return false;
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return false;
  return now >= endMs;
}

const JOIN_WINDOW_EXPIRED_PAYLOAD = {
  success: false,
  expired: true,
  joinWindowExpired: true,
  error: "Time's up — this quiz is closed.",
};

module.exports = {
  getJoinDurationMinutes,
  getJoinWindowEndMs,
  isJoinWindowExpired,
  JOIN_WINDOW_EXPIRED_PAYLOAD,
};
