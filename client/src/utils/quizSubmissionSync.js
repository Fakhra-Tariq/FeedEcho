import { quizSubmissionsAPI } from '../services/api';
import {
  readDedupedLocalQuizSubmissions,
  saveLocalQuizSubmission,
} from './audienceQuizAttempts';

const SUBMIT_MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1500, 3000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logSubmitFailure = (quizId, submissionData, error, attempt) => {
  const response = error?.response;
  const payload = {
    quizId,
    participantId: submissionData?.participantId ?? null,
    attempt,
    message: error?.message ?? null,
    status: response?.status ?? null,
    statusText: response?.statusText ?? null,
    responseData: response?.data ?? null,
    code: error?.code ?? null,
    isNetworkError: !response && Boolean(error?.request),
  };
  console.error('[quiz-submit] client request failed', payload);
  if (error?.stack) {
    console.error('[quiz-submit] client stack', error.stack);
  }
};

const isRetryableError = (error) => {
  if (!error?.response) return true;
  const status = error.response.status;
  return status >= 500 || status === 408 || status === 429;
};

const normalizeAnswersForSubmit = (answers) => {
  if (answers == null) return {};
  if (Array.isArray(answers)) {
    const mapped = {};
    answers.forEach((value, index) => {
      mapped[index] = value;
    });
    return mapped;
  }
  if (typeof answers === 'object') return answers;
  return {};
};

/**
 * Submit quiz answers to the backend with automatic retries on transient failures.
 */
export const submitQuizWithRetry = async (quizId, submissionData, { maxRetries = SUBMIT_MAX_RETRIES } = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await quizSubmissionsAPI.submit(quizId, {
        ...submissionData,
        answers: normalizeAnswersForSubmit(submissionData.answers),
      });

      if (response.data?.success) {
        return { success: true, data: response.data.data, attempt: attempt + 1 };
      }

      lastError = new Error(response.data?.error || 'Server rejected submission');
      lastError.response = { status: response.status || 400, statusText: response.statusText, data: response.data };
      logSubmitFailure(quizId, submissionData, lastError, attempt + 1);

      if (attempt < maxRetries - 1 && isRetryableError(lastError)) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      logSubmitFailure(quizId, submissionData, error, attempt + 1);
      if (attempt < maxRetries - 1 && isRetryableError(error)) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
        continue;
      }
      break;
    }
  }

  const serverMsg =
    lastError?.response?.data?.error ||
    lastError?.response?.data?.message ||
    lastError?.message ||
    'Submission failed';

  return {
    success: false,
    error: serverMsg,
    status: lastError?.response?.status ?? null,
    responseData: lastError?.response?.data ?? null,
    isNetworkError: !lastError?.response && Boolean(lastError?.request),
  };
};

export const isPendingSyncSubmission = (row) =>
  row &&
  row.serverSynced !== true &&
  row.quizId &&
  row.participantId &&
  row.answers &&
  (Array.isArray(row.answers) ? row.answers.length > 0 : Object.keys(row.answers).length > 0);

export const getPendingSyncSubmissions = () =>
  readDedupedLocalQuizSubmissions().filter(isPendingSyncSubmission);

/** One-time / on-login recovery for attempts saved locally but never confirmed on the server. */
export const syncPendingQuizSubmissions = async ({ limit = 20 } = {}) => {
  const pending = getPendingSyncSubmissions().slice(0, limit);
  if (!pending.length) {
    return { synced: 0, failed: 0, results: [] };
  }

  let synced = 0;
  let failed = 0;
  const results = [];

  for (const row of pending) {
    const payload = {
      participantId: row.participantId,
      studentName: row.studentName || row.name || 'Student',
      sessionCode: row.sessionCode || '',
      answers: normalizeAnswersForSubmit(row.answers),
      timeTaken: row.timeTaken ?? 1,
      ...(row.studentUid ? { studentUid: row.studentUid } : {}),
      ...(row.studentEmail ? { studentEmail: row.studentEmail } : {}),
    };

    const outcome = await submitQuizWithRetry(row.quizId, payload);

    if (outcome.success) {
      synced += 1;
      saveLocalQuizSubmission({
        ...row,
        score: outcome.data.correctAnswers ?? row.score,
        correctAnswers: outcome.data.correctAnswers ?? row.correctAnswers,
        totalQuestions: outcome.data.totalQuestions ?? row.totalQuestions,
        percentage: outcome.data.percentage ?? row.percentage,
        points: outcome.data.score ?? row.points,
        submittedAt: outcome.data.submittedAt || row.submittedAt,
        serverSynced: true,
        syncError: null,
        syncedAt: new Date().toISOString(),
      });
      results.push({ quizId: row.quizId, participantId: row.participantId, success: true });
    } else {
      failed += 1;
      saveLocalQuizSubmission({
        ...row,
        serverSynced: false,
        syncError: outcome.error,
        lastSyncAttempt: new Date().toISOString(),
      });
      results.push({
        quizId: row.quizId,
        participantId: row.participantId,
        success: false,
        error: outcome.error,
      });
    }
  }

  return { synced, failed, results };
};

/** Fire-and-forget recovery for unsynced local quiz attempts (login / app load). */
export const schedulePendingQuizSubmissionSync = () => {
  syncPendingQuizSubmissions()
    .then((result) => {
      if (result.synced > 0) {
        console.log(`[quiz-sync] recovered ${result.synced} pending submission(s)`);
      }
    })
    .catch((err) => {
      console.warn('[quiz-sync] pending submission recovery failed:', err);
    });
};
