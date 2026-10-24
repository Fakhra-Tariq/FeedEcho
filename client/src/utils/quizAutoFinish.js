import { quizzesAPI } from '../services/api';
import { isQuizExpired } from './quizExpiry';

const inFlight = new Set();
const succeeded = new Set();

/** Call the existing finish API once per expired launch. Safe across tabs. */
export async function autoFinishExpiredQuiz(quiz) {
  const id = quiz?.id;
  if (!id) return false;

  if (!isQuizExpired(quiz)) {
    succeeded.delete(id);
    return false;
  }

  if (succeeded.has(id) || inFlight.has(id)) return false;

  inFlight.add(id);
  try {
    const res = await quizzesAPI.finish(id);
    if (res.data?.success) {
      succeeded.add(id);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('autoFinishExpiredQuiz failed', {
      quizId: id,
      message: error?.response?.data?.error || error?.message,
    });
    return false;
  } finally {
    inFlight.delete(id);
  }
}
