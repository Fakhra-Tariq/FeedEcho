import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRtdbValue } from './useRtdb';
import { studentsAPI } from '../services/api';
import { getStudentQueryParams } from '../utils/studentSession';
import { matchesStudentRecord } from '../utils/studentIdentifiers';
import {
  buildDedupedQuizAttempts,
  getQuizAttemptCollapseKey,
  isSameQuizAttempt,
  readDedupedLocalQuizSubmissions,
} from '../utils/studentQuizAttempts';
import { schedulePendingQuizSubmissionSync } from '../utils/quizSubmissionSync';

const PASS_THRESHOLD = 60;

const formatAttemptRow = (row) => {
  const submittedAtSource = row.submittedAt || (row.timestamp instanceof Date ? row.timestamp : null);
  const submittedAt = submittedAtSource ? new Date(submittedAtSource) : new Date();
  const percentage = Number(row.percentage ?? 0);

  return {
    id: getQuizAttemptCollapseKey({ ...row, submittedAt: submittedAt.toISOString() }),
    quizId: row.quizId,
    participantId: row.participantId,
    name: row.name || row.quizTitle || 'Quiz',
    status: percentage >= PASS_THRESHOLD ? 'Passed' : 'Failed',
    percentage,
    timestamp: submittedAt,
    submittedAt: submittedAt.toISOString(),
    source: row.source || 'server',
  };
};

const flattenLocalSubmissions = (items, student) =>
  items
    .filter((s) => matchesStudentRecord(s, student, { allowLegacyNameMatch: true }))
    .map((s) => ({
      quizId: s.quizId,
      participantId: s.participantId,
      quizTitle: s.quizTitle,
      submittedAt: s.submittedAt,
      timeTaken: s.timeTaken,
      score: s.score,
      totalQuestions: s.totalQuestions,
      percentage: s.percentage ?? (s.totalQuestions ? Math.round((s.score / s.totalQuestions) * 100) : 0),
      answers: s.answers,
      questions: s.questions,
      source: 'local',
    }));

/**
 * Quiz attempt stats for the logged-in student — same data path as Quiz History.
 */
export function useStudentQuizStats(student) {
  const [apiAttempts, setApiAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localSubmissions, setLocalSubmissions] = useState([]);
  const { value: quizzesTree } = useRtdbValue('quizzes');

  const refreshLocalSubmissions = useCallback(() => {
    setLocalSubmissions(readDedupedLocalQuizSubmissions());
  }, []);

  const loadQuizHistory = useCallback(async (currentStudent) => {
    if (!currentStudent) return;
    setLoading(true);
    try {
      const response = await studentsAPI.getQuizHistory({
        ...getStudentQueryParams(currentStudent),
        limit: 200,
      });
      setApiAttempts(response.data?.data || []);
    } catch (error) {
      console.error('Failed to load quiz history from server:', error);
      setApiAttempts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!student) return undefined;
    refreshLocalSubmissions();
    schedulePendingQuizSubmissionSync();
    loadQuizHistory(student);

    const onFocus = () => loadQuizHistory(student);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadQuizHistory(student);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [student, refreshLocalSubmissions, loadQuizHistory]);

  const quizAttempts = useMemo(() => {
    const rawRows = [];

    apiAttempts.forEach((row) => {
      rawRows.push({
        ...row,
        source: row.source || 'server',
        name: row.name || row.quizTitle || quizzesTree?.[row.quizId]?.title,
      });
    });

    flattenLocalSubmissions(localSubmissions, student)
      .filter((local) => !apiAttempts.some((api) => isSameQuizAttempt(api, local)))
      .forEach((row) => {
        rawRows.push(row);
      });

    return buildDedupedQuizAttempts(rawRows, (row) =>
      formatAttemptRow({
        ...row,
        name: row.name || row.quizTitle || quizzesTree?.[row.quizId]?.title,
      })
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [apiAttempts, localSubmissions, student, quizzesTree]);

  const stats = useMemo(() => {
    const totalQuizzes = quizAttempts.length;
    const averageScore =
      totalQuizzes > 0
        ? quizAttempts.reduce((sum, q) => sum + q.percentage, 0) / totalQuizzes
        : 0;
    const bestScore = totalQuizzes > 0 ? Math.max(...quizAttempts.map((q) => q.percentage)) : 0;
    return { totalQuizzes, averageScore, bestScore };
  }, [quizAttempts]);

  return { stats, loading };
}
