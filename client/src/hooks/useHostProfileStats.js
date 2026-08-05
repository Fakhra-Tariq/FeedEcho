import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuizSubmissionListeners } from './useQuizSubmissionListeners';
import { quizzesAPI, quizSubmissionsAPI } from '../services/api';
import {
  collectReportDataForQuiz,
  computeTeacherOverviewStats,
} from '../utils/hostQuizReports';

/**
 * Host profile stats — same merge/submission logic as Teacher Reports overview.
 */
export function useHostProfileStats() {
  const { user, userProfile } = useAuth();
  const teacherUid = userProfile?.uid || user?.uid;

  const [quizzes, setQuizzes] = useState([]);
  const [apiFallbackByQuizId, setApiFallbackByQuizId] = useState({});
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  const quizIds = useMemo(() => quizzes.map((q) => q.id).filter(Boolean), [quizzes]);

  const { submissionsByQuizId, participantsByQuizId } = useQuizSubmissionListeners(quizIds, {
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
      setApiFallbackByQuizId({});
    } finally {
      setLoadingQuizzes(false);
    }
  }, [teacherUid]);

  useEffect(() => {
    refreshQuizzes();
  }, [refreshQuizzes]);

  useEffect(() => {
    if (!teacherUid || !quizzes.length) return undefined;

    let cancelled = false;
    setLoadingResults(true);

    Promise.all(
      quizzes.map(async (quiz) => {
        try {
          const response = await quizSubmissionsAPI.getResults(quiz.id);
          return [quiz.id, response.data?.data || null];
        } catch {
          return [quiz.id, null];
        }
      })
    )
      .then((pairs) => {
        if (cancelled) return;
        const next = {};
        pairs.forEach(([quizId, data]) => {
          if (data) next[quizId] = data;
        });
        setApiFallbackByQuizId(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingResults(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teacherUid, quizzes]);

  const quizReports = useMemo(() => {
    if (!quizzes.length) return [];
    return quizzes.map((quiz) =>
      collectReportDataForQuiz(quiz, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId)
    );
  }, [quizzes, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId]);

  const stats = useMemo(() => computeTeacherOverviewStats(quizReports), [quizReports]);

  const loading =
    loadingQuizzes ||
    (loadingResults && quizzes.length > 0 && !Object.keys(apiFallbackByQuizId).length);

  return { stats, loading };
}
