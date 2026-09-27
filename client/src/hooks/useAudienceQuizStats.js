import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRtdbValue } from './useRtdb';
import { studentsAPI } from '../services/api';
import { getStudentQueryParams } from '../utils/audienceSession';
import { matchesStudentRecord } from '../utils/audienceIdentifiers';
import {
  buildDedupedQuizAttempts,
  getQuizAttemptCollapseKey,
  isSameQuizAttempt,
  readDedupedLocalQuizSubmissions,
} from '../utils/audienceQuizAttempts';
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
      source: 'local',
    }));

const flattenIndexedSubmissions = (tree) => {
  if (!tree || typeof tree !== 'object') return [];
  const rows = [];
  Object.entries(tree).forEach(([quizId, participants]) => {
    if (!participants || typeof participants !== 'object') return;
    Object.entries(participants).forEach(([participantId, sub]) => {
      if (!sub || typeof sub !== 'object') return;
      rows.push({
        quizId: sub.quizId || quizId,
        participantId: sub.participantId || participantId,
        quizTitle: sub.quizTitle || 'Quiz',
        submittedAt: sub.submittedAt || null,
        timeTaken: sub.timeTaken ?? null,
        score: sub.correctAnswers ?? sub.score,
        totalQuestions: sub.totalQuestions,
        percentage: Number(sub.percentage ?? 0),
        source: 'index',
      });
    });
  });
  return rows;
};

/**
 * Quiz attempt stats for the logged-in student — same scoring as Quiz History,
 * sourced from the per-student index (plus local pending rows) instead of a full-tree scan.
 */
export function useAudienceQuizStats(student) {
  const [apiAttempts, setApiAttempts] = useState([]);
  const [loadingApi, setLoadingApi] = useState(true);
  const [localSubmissions, setLocalSubmissions] = useState([]);

  const studentUid = student?.uid || '';
  const { value: indexedTree, loading: indexLoading } = useRtdbValue(
    studentUid ? `quiz_submissions_by_student/${studentUid}` : null,
    { enabled: Boolean(studentUid) }
  );

  const refreshLocalSubmissions = useCallback(() => {
    setLocalSubmissions(readDedupedLocalQuizSubmissions());
  }, []);

  const loadQuizHistory = useCallback(async (currentStudent, { silent = false } = {}) => {
    if (!currentStudent) return;
    if (!silent) setLoadingApi(true);
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
      setLoadingApi(false);
    }
  }, []);

  useEffect(() => {
    if (!student) return undefined;
    refreshLocalSubmissions();
    schedulePendingQuizSubmissionSync();
    loadQuizHistory(student, { silent: Boolean(student.uid) });

    const onFocus = () => loadQuizHistory(student, { silent: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadQuizHistory(student, { silent: true });
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
    const indexedRows = flattenIndexedSubmissions(indexedTree);

    indexedRows.forEach((row) => rawRows.push(row));

    apiAttempts.forEach((row) => {
      rawRows.push({
        ...row,
        source: row.source || 'server',
        name: row.name || row.quizTitle || 'Quiz',
      });
    });

    flattenLocalSubmissions(localSubmissions, student)
      .filter(
        (local) =>
          !apiAttempts.some((api) => isSameQuizAttempt(api, local)) &&
          !indexedRows.some((idx) => isSameQuizAttempt(idx, local))
      )
      .forEach((row) => {
        rawRows.push(row);
      });

    return buildDedupedQuizAttempts(rawRows, (row) => formatAttemptRow(row)).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }, [apiAttempts, localSubmissions, student, indexedTree]);

  const stats = useMemo(() => {
    const totalQuizzes = quizAttempts.length;
    const averageScore =
      totalQuizzes > 0
        ? quizAttempts.reduce((sum, q) => sum + q.percentage, 0) / totalQuizzes
        : 0;
    const bestScore = totalQuizzes > 0 ? Math.max(...quizAttempts.map((q) => q.percentage)) : 0;
    return { totalQuizzes, averageScore, bestScore };
  }, [quizAttempts]);

  const loading = studentUid ? indexLoading && loadingApi : loadingApi;

  return { stats, loading };
}
