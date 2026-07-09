import { quizzesAPI } from '../services/api';

export const QUIZ_TIME_MIN_MINUTES = 1;
export const QUIZ_TIME_MAX_MINUTES = 180;
export const QUIZ_TIME_STEP_MINUTES = 5;
export const QUIZ_TIME_PRESETS = [10, 15, 30, 45, 60];

/** Parse optional minute value; null/empty means no limit. Clamps valid numbers to [min, max]. */
export function parseOptionalMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < QUIZ_TIME_MIN_MINUTES) return null;
  return Math.min(QUIZ_TIME_MAX_MINUTES, parsed);
}

/** Map Launch Quiz modal settings to the API launch payload. */
export function buildQuizLaunchApiPayload(settings = {}) {
  return {
    accessCode: settings.accessCode,
    endTime: settings.endTime ?? null,
    quizAvailabilityMinutes: settings.quizAvailabilityMinutes ?? null,
    timePerStudentMinutes: settings.timePerStudentMinutes ?? null,
    shuffleQuestions: Boolean(settings.shuffleQuestions),
    shuffleAnswers: Boolean(settings.shuffleAnswers),
    showFinalScore:
      settings.showFinalScore !== undefined
        ? Boolean(settings.showFinalScore)
        : settings.showScore !== undefined
        ? Boolean(settings.showScore)
        : true,
    oneAttempt: Boolean(settings.oneAttempt),
    launchedAt: settings.launchedAt,
  };
}

export async function launchQuizWithSettings(quizId, settings = {}) {
  const response = await quizzesAPI.launch(quizId, buildQuizLaunchApiPayload(settings));
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Launch failed');
  }
  return response.data.data;
}

/** Update savedQuizzes local cache after a successful launch. */
export function persistLaunchedQuizInLocalStorage(quizId, launchedData) {
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  savedQuizzes.forEach((q) => {
    if (q.launched) {
      q.launched = false;
      q.status = 'Ready';
      delete q.launchSettings;
    }
  });
  const idx = savedQuizzes.findIndex((q) => q.id === quizId);
  if (idx !== -1) {
    savedQuizzes[idx] = { ...savedQuizzes[idx], ...launchedData };
  }
  localStorage.setItem('savedQuizzes', JSON.stringify(savedQuizzes));
}
