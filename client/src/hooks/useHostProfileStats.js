import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuizSubmissionListeners } from './useQuizSubmissionListeners';
import { quizzesAPI } from '../services/api';
import {
  collectReportDataForQuiz,
  computeTeacherOverviewStats,
} from '../utils/hostQuizReports';

/**
 * Host profile stats — same merge/submission logic as Teacher Reports overview.
 * Live per-quiz RTDB listeners; no per-quiz HTTP results download.
 */
export function useHostProfileStats() {
  const { user, userProfile } = useAuth();
  const teacherUid = userProfile?.uid || user?.uid;

  const [quizzes, setQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);

  const quizIds = useMemo(() => quizzes.map((q) => q.id).filter(Boolean), [quizzes]);

  const { submissionsByQuizId, participantsByQuizId, ready: listenersReady } =
    useQuizSubmissionListeners(quizIds, {
      listenParticipants: true,
    });

  const refreshQuizzes = useCallback(async () => {
    if (!teacherUid) {
      setQuizzes([]);
      setLoadingQuizzes(false);
      return;
    }

    setLoadingQuizzes(true);
    try {
      const response = await quizzesAPI.getAll();
      const list = (response.data?.success ? response.data.data : [])
        .slice()
        .sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
        );
      setQuizzes(list);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [teacherUid]);

  useEffect(() => {
    refreshQuizzes();
  }, [refreshQuizzes]);

  const quizReports = useMemo(() => {
    if (!quizzes.length) return [];
    return quizzes.map((quiz) =>
      collectReportDataForQuiz(quiz, submissionsByQuizId, participantsByQuizId, {}, { includeDetails: false })
    );
  }, [quizzes, submissionsByQuizId, participantsByQuizId]);

  const stats = useMemo(() => computeTeacherOverviewStats(quizReports), [quizReports]);

  const loading = loadingQuizzes || (quizIds.length > 0 && !listenersReady);

  return { stats, loading };
}
