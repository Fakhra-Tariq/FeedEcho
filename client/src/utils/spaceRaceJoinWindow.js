/** Join window = race.startedAt + settings.joinDuration (minutes). Same fields as host Join Time. */

export function getJoinDurationMinutes(settings) {
  const minutes = Number(settings?.joinDuration);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

export function getJoinWindowEndMs(race) {
  const minutes = getJoinDurationMinutes(race?.settings);
  if (minutes == null) return null;
  const start = race?.startedAt ? new Date(race.startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  return start + minutes * 60 * 1000;
}

/** True when join duration has ended. Unlimited / missing duration → false. */
export function isJoinWindowExpired(race, nowMs = Date.now()) {
  const endMs = getJoinWindowEndMs(race);
  if (endMs == null) return false;
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return false;
  return now >= endMs;
}
