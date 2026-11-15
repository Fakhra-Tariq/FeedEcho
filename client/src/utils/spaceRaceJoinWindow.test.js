import { getJoinDurationMinutes, getJoinWindowEndMs, isJoinWindowExpired } from './spaceRaceJoinWindow';

describe('spaceRaceJoinWindow', () => {
  const startedAt = '2026-01-01T00:00:00.000Z';
  const startMs = Date.parse(startedAt);

  test('missing or non-positive join duration is unlimited', () => {
    expect(getJoinDurationMinutes(undefined)).toBeNull();
    expect(getJoinDurationMinutes({ joinDuration: 0 })).toBeNull();
    expect(getJoinDurationMinutes({ joinDuration: -1 })).toBeNull();
    expect(isJoinWindowExpired({ startedAt, settings: {} }, startMs + 1e12)).toBe(false);
  });

  test('end is startedAt + joinDuration minutes', () => {
    const race = { startedAt, settings: { joinDuration: 30 } };
    expect(getJoinWindowEndMs(race)).toBe(startMs + 30 * 60 * 1000);
    expect(isJoinWindowExpired(race, startMs + 29 * 60 * 1000)).toBe(false);
    expect(isJoinWindowExpired(race, startMs + 30 * 60 * 1000)).toBe(true);
  });

  test('not expired when startedAt is missing', () => {
    expect(isJoinWindowExpired({ settings: { joinDuration: 5 } }, Date.now())).toBe(false);
  });
});
