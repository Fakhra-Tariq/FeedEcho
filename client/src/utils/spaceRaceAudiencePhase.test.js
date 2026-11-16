import {
  isSpaceRaceEndedByTeacher,
  isSpaceRaceQuizPath,
  resolveSpaceRaceAudiencePhase,
} from './spaceRaceAudiencePhase';

const startedAt = '2026-01-01T00:00:00.000Z';
const startMs = Date.parse(startedAt);
const race = { startedAt, settings: { joinDuration: 10 }, status: 'active' };
const joinEnd = startMs + 10 * 60 * 1000;
const quizEnd = startMs + 20 * 60 * 1000;

describe('resolveSpaceRaceAudiencePhase', () => {
  test('completed wins', () => {
    expect(
      resolveSpaceRaceAudiencePhase({
        completed: true,
        insideQuiz: true,
        race: { ...race, status: 'completed' },
        nowMs: joinEnd + 1,
        quizEndMs: quizEnd,
      })
    ).toBe('completed');
  });

  test('teacher ended: outside closed, inside race_ended', () => {
    const ended = { ...race, status: 'completed' };
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: false,
        race: ended,
        nowMs: startMs + 1000,
      })
    ).toBe('closed');
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: true,
        race: ended,
        nowMs: startMs + 1000,
        quizEndMs: quizEnd,
      })
    ).toBe('race_ended');
  });

  test('teacher ended beats expired timers', () => {
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: true,
        race: { ...race, status: 'ended' },
        nowMs: quizEnd + 1,
        quizEndMs: quizEnd,
      })
    ).toBe('race_ended');
  });

  test('inside join or quiz deadline → times_up', () => {
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: true,
        race,
        nowMs: joinEnd,
        quizEndMs: quizEnd,
      })
    ).toBe('times_up');
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: true,
        race,
        nowMs: quizEnd,
        quizEndMs: quizEnd,
      })
    ).toBe('times_up');
  });

  test('outside join deadline → closed, not times_up', () => {
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: false,
        race,
        nowMs: joinEnd,
        quizEndMs: quizEnd,
      })
    ).toBe('closed');
  });

  test('open while both windows remain', () => {
    expect(
      resolveSpaceRaceAudiencePhase({
        insideQuiz: false,
        race,
        nowMs: startMs + 1000,
        quizEndMs: quizEnd,
      })
    ).toBe('open');
  });
});

describe('isSpaceRaceQuizPath', () => {
  test('welcome vs quiz routes', () => {
    expect(isSpaceRaceQuizPath('/audience/space-race/abc')).toBe(false);
    expect(isSpaceRaceQuizPath('/audience/space-race/abc/quiz/xyz')).toBe(true);
    expect(isSpaceRaceQuizPath('/space-race/abc/quiz/xyz')).toBe(true);
  });
});

describe('isSpaceRaceEndedByTeacher', () => {
  test('treats completed/ended/finished as ended', () => {
    expect(isSpaceRaceEndedByTeacher({ status: 'completed' })).toBe(true);
    expect(isSpaceRaceEndedByTeacher({ status: 'ended' })).toBe(true);
    expect(isSpaceRaceEndedByTeacher({ status: 'active' })).toBe(false);
  });
});
