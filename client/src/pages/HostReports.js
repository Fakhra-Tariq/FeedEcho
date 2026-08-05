import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { equalTo, off, onValue, orderByChild, query, ref as dbRef } from 'firebase/database';
import clsx from 'clsx';
import {
  BarChart3,
  Users,
  Award,
  TrendingUp,
  Eye,
  Trash2,
  X,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Search,
  AlertTriangle,
  Clock,
  FileQuestion,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHostData } from '../contexts/HostDataContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { useQuizSubmissionListeners } from '../hooks/useQuizSubmissionListeners';
import { db } from '../firebase';
import { quizzesAPI, quizSubmissionsAPI, handleAPIError } from '../services/api';
import {
  getCorrectOptionIndex,
  normalizeQuestionsForScoring,
  extractSubmissionAnswer,
  reviewQuestionAnswer,
} from '../utils/scoringUtils';
import { normalizeQuizTypeLabel } from '../utils/quizQuestionNormalization';
import {
  mapSubmissionNodes,
  mergeQuizSubmissionSources,
  countJoinedParticipants,
  isSubmittedRow,
  normalizeTimeTakenSeconds,
} from '../utils/hostQuizReports';

const PASS_THRESHOLD = 60;

const normalizeListStatus = (status) => {
  let normalizedStatus = status;
  if (normalizedStatus === null || normalizedStatus === undefined) {
    normalizedStatus = 'draft';
  }
  if (typeof normalizedStatus === 'string') {
    normalizedStatus = normalizedStatus.toLowerCase();
  }
  return normalizedStatus;
};

/** Fallback when GET /api/quizzes returns nothing — load this teacher's quizzes from RTDB. */
const loadHostQuizzesFromRtdb = (teacherUid, { includeDeleted = false } = {}) =>
  new Promise((resolve) => {
    if (!teacherUid) {
      resolve([]);
      return;
    }

    const quizzesQuery = query(
      dbRef(db, 'quizzes'),
      orderByChild('createdBy'),
      equalTo(teacherUid)
    );
    let settled = false;

    const finish = (list) => {
      if (settled) return;
      settled = true;
      try {
        off(quizzesQuery);
      } catch {
        /* listener may already be detached */
      }
      resolve(list);
    };

    onValue(
      quizzesQuery,
      (snap) => {
        if (!snap.exists()) {
          finish([]);
          return;
        }

        const list = Object.entries(snap.val() || {})
          .map(([id, quiz]) => ({ id, ...(quiz || {}) }))
          .filter((quiz) => {
            if (quiz.deletedAt) return includeDeleted;
            return normalizeListStatus(quiz.status) !== 'ended';
          })
          .sort(compareQuizzesByLaunchDesc);

        finish(list);
      },
      () => finish([])
    );
  });

const normalizeQuestionsList = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

/** Launch/publish time for Reports ordering — ignore delete/attempt/updatedAt churn. */
const getQuizLaunchSortKey = (quiz) =>
  String(
    quiz?.launchSettings?.launchedAt ||
      quiz?.launchedAt ||
      quiz?.publishedAt ||
      quiz?.createdAt ||
      quiz?.updatedAt ||
      ''
  );

const compareQuizzesByLaunchDesc = (a, b) =>
  getQuizLaunchSortKey(b).localeCompare(getQuizLaunchSortKey(a));

const extractStudentAnswer = extractSubmissionAnswer;

const formatAnswerDisplay = (value) => {
  if (value == null || value === '') return 'No answer';
  if (value === true) return 'True';
  if (value === false) return 'False';
  const text = String(value).trim();
  if (text.toLowerCase() === 'true') return 'True';
  if (text.toLowerCase() === 'false') return 'False';
  return text;
};

/** Match student Quiz History minute display (minimum 1 min when any time exists). */
const formatDurationForReport = (seconds) => {
  if (seconds == null || seconds === '' || Number.isNaN(Number(seconds))) return null;
  const total = Math.max(1, Math.round(Number(seconds)));
  const mins = Math.max(1, Math.round(total / 60));
  return `${mins} min`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getOptionText = (option) => {
  if (option == null) return '';
  return typeof option === 'string' ? option : option?.text || '';
};

const getSelectedOptionIndex = (question, studentAnswer) => {
  if (studentAnswer == null || studentAnswer === '') return null;

  if (typeof studentAnswer === 'number' && Array.isArray(question?.options)) {
    if (studentAnswer >= 0 && studentAnswer < question.options.length) return studentAnswer;
  }

  const parsedNumeric = Number(studentAnswer);
  if (
    Array.isArray(question?.options) &&
    Number.isInteger(parsedNumeric) &&
    parsedNumeric >= 0 &&
    parsedNumeric < question.options.length &&
    String(studentAnswer).trim() === String(parsedNumeric)
  ) {
    return parsedNumeric;
  }

  const answerText = String(studentAnswer).trim().toLowerCase();
  if (!Array.isArray(question?.options)) {
    return Number.isInteger(parsedNumeric) && !Number.isNaN(parsedNumeric) ? parsedNumeric : null;
  }

  const byText = question.options.findIndex(
    (opt) => getOptionText(opt).trim().toLowerCase() === answerText
  );
  if (byText >= 0) return byText;

  if (
    Number.isInteger(parsedNumeric) &&
    parsedNumeric >= 0 &&
    parsedNumeric < question.options.length
  ) {
    return parsedNumeric;
  }

  return null;
};

const enrichSubmission = (submission, quiz) => ({
  ...submission,
  questions: normalizeQuestionsList(submission?.questions || quiz?.questions),
  quizType: submission?.quizType || quiz?.type || '',
  answers: submission?.answers || {},
});

const buildQuizReportRow = (quiz, submissions, joinedCount = 0) => {
  const list = (submissions || []).map((sub) => enrichSubmission(sub, quiz));
  const submittedRows = list.filter(isSubmittedRow);
  const submittedCount = submittedRows.length;
  const avgScore =
    submittedCount > 0
      ? Math.round(
          submittedRows.reduce((sum, s) => sum + Number(s.percentage || 0), 0) / submittedCount
        )
      : null;
  const passCount = submittedRows.filter((s) => Number(s.percentage || 0) >= PASS_THRESHOLD).length;
  const participantCount = Math.max(Number(joinedCount) || 0, submittedCount);

  return {
    quiz,
    submissions: list,
    participantCount,
    joinedCount: Math.max(Number(joinedCount) || 0, submittedCount),
    submittedCount,
    avgScore,
    passCount,
    failCount: submittedCount - passCount,
    passRate: submittedCount > 0 ? Math.round((passCount / submittedCount) * 100) : null,
  };
};

const collectReportDataForQuiz = (quiz, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId) => {
  const quizId = quiz.id;
  const fallback = apiFallbackByQuizId[quizId];

  const submissionRows = [
    ...mapSubmissionNodes(submissionsByQuizId[quizId]),
    ...(fallback?.submissions || []).map((s, idx) => ({
      ...s,
      participantId: s.participantId || s.id || `api-sub-${idx}`,
    })),
  ];

  const participantRows = [
    ...mapSubmissionNodes(participantsByQuizId[quizId]),
    ...(fallback?.participants || []).map((p, idx) => ({
      ...p,
      participantId: p.participantId || p.id || `api-part-${idx}`,
    })),
  ];

  const mergedSubmissions = mergeQuizSubmissionSources(submissionRows, participantRows, quiz);
  const joinedCount = Math.max(
    countJoinedParticipants(participantsByQuizId[quizId]),
    fallback?.participants?.length ?? 0,
    fallback?.totalParticipants ?? 0
  );

  return buildQuizReportRow(quiz, mergedSubmissions, joinedCount);
};

export default function HostReports() {
  const { user, userProfile } = useAuth();
  const teacherUid = userProfile?.uid || user?.uid;
  const { syncQuizzes } = useHostData();
  const { alert } = useHybridAlert();

  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [apiFallbackByQuizId, setApiFallbackByQuizId] = useState({});
  const [loadingResults, setLoadingResults] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [reportModalView, setReportModalView] = useState(null);
  const [loadingReportDetail, setLoadingReportDetail] = useState(false);
  const [deleteConfirmQuizId, setDeleteConfirmQuizId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const quizIds = useMemo(() => quizzes.map((q) => q.id).filter(Boolean), [quizzes]);

  const { submissionsByQuizId, participantsByQuizId } =
    useQuizSubmissionListeners(quizIds, { listenParticipants: true });

  const refreshQuizzes = useCallback(async () => {
    if (!teacherUid) {
      setQuizzes([]);
      setLoadingQuizzes(false);
      return;
    }

    setLoadingQuizzes(true);
    try {
      let list = [];
      try {
        // includeDeleted so soft-deleted quizzes still appear in historical reports
        const response = await quizzesAPI.getAll({ includeDeleted: true });
        list = (response.data?.success ? response.data.data : []).slice();
      } catch {
        list = [];
      }

      if (!list.length) {
        list = await loadHostQuizzesFromRtdb(teacherUid, { includeDeleted: true });
      } else {
        // Newest launched/published quiz first — ignore delete/attempt/updatedAt churn
        list.sort(compareQuizzesByLaunchDesc);
      }

      setQuizzes(list);
      await syncQuizzes();
      setApiFallbackByQuizId({});
    } finally {
      setLoadingQuizzes(false);
    }
  }, [teacherUid, syncQuizzes]);

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
    return quizzes
      .map((quiz) =>
        collectReportDataForQuiz(quiz, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId)
      )
      // Only show quizzes that at least one student has joined and attempted
      .filter((report) => Number(report.submittedCount) > 0);
  }, [quizzes, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId]);

  const hasRtdbReportData = useMemo(
    () =>
      Object.values(submissionsByQuizId).some(
        (node) => node && typeof node === 'object' && Object.keys(node).length > 0
      ) ||
      Object.values(participantsByQuizId).some(
        (node) => node && typeof node === 'object' && Object.keys(node).length > 0
      ),
    [submissionsByQuizId, participantsByQuizId]
  );

  const loading =
    loadingQuizzes ||
    (loadingResults &&
      quizzes.length > 0 &&
      !Object.keys(apiFallbackByQuizId).length &&
      !hasRtdbReportData);

  const overviewStats = useMemo(() => {
    const allSubmissions = quizReports.flatMap((r) => r.submissions).filter(isSubmittedRow);
    const totalQuizzes = quizReports.length;
    const totalParticipants = allSubmissions.length;
    const avgScore =
      totalParticipants > 0
        ? Math.round(
            allSubmissions.reduce((sum, s) => sum + Number(s.percentage || 0), 0) / totalParticipants
          )
        : 0;
    const passCount = allSubmissions.filter((s) => Number(s.percentage || 0) >= PASS_THRESHOLD).length;
    const passRate =
      totalParticipants > 0 ? Math.round((passCount / totalParticipants) * 100) : 0;

    return { totalQuizzes, totalParticipants, avgScore, passRate };
  }, [quizReports]);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return quizReports;
    return quizReports.filter((r) => (r.quiz.title || '').toLowerCase().includes(term));
  }, [quizReports, searchTerm]);

  const openQuizReport = useCallback(
    async (report) => {
      setSelectedReport(report);
      setSelectedSubmission(null);
      setReportModalView('participants');
      setLoadingReportDetail(true);

      try {
        const response = await quizSubmissionsAPI.getResults(report.quiz.id);
        const data = response.data?.data;
        if (data) {
          setApiFallbackByQuizId((prev) => {
            const next = { ...prev, [report.quiz.id]: data };
            const refreshed = collectReportDataForQuiz(
              report.quiz,
              submissionsByQuizId,
              participantsByQuizId,
              next
            );
            setSelectedReport(refreshed);
            return next;
          });
        }
      } catch {
        // Live listeners + cached data still apply
      } finally {
        setLoadingReportDetail(false);
      }
    },
    [apiFallbackByQuizId, participantsByQuizId, submissionsByQuizId]
  );

  const closeReportModal = useCallback(() => {
    setSelectedReport(null);
    setSelectedSubmission(null);
    setReportModalView(null);
  }, []);

  const backToParticipants = useCallback(() => {
    setSelectedSubmission(null);
    setReportModalView('participants');
  }, []);

  useEffect(() => {
    if (!selectedReport?.quiz?.id || reportModalView !== 'participants') return;
    const updated = quizReports.find((r) => r.quiz.id === selectedReport.quiz.id);
    if (updated) {
      setSelectedReport(updated);
    }
  }, [quizReports, selectedReport?.quiz?.id, reportModalView]);

  useEffect(() => {
    if (!selectedReport?.quiz?.id || !selectedSubmission?.participantId || reportModalView !== 'detail') {
      return;
    }
    const updated = quizReports.find((r) => r.quiz.id === selectedReport.quiz.id);
    if (!updated) return;
    const refreshedSub = updated.submissions.find(
      (s) => s.participantId === selectedSubmission.participantId
    );
    if (refreshedSub) {
      setSelectedReport(updated);
      setSelectedSubmission(refreshedSub);
    }
  }, [quizReports, selectedReport?.quiz?.id, selectedSubmission?.participantId, reportModalView]);

  const handleDeleteQuiz = async () => {
    if (!deleteConfirmQuizId) return;
    setDeleting(true);
    try {
      // Soft-delete so historical attempts remain available in reports
      const response = await quizzesAPI.delete(deleteConfirmQuizId);
      if (!response.data?.success) throw new Error(response.data?.error || 'Delete failed');
      alert.toast.success('Quiz removed from library. Past attempts remain in reports.');
      if (selectedReport?.quiz?.id === deleteConfirmQuizId) {
        closeReportModal();
      }
      setDeleteConfirmQuizId(null);
      await refreshQuizzes();
    } catch (err) {
      const apiErr = handleAPIError(err);
      alert.toast.error(apiErr.message || 'Failed to delete quiz');
    } finally {
      setDeleting(false);
    }
  };

  const renderQuestionReview = (submission, quizType) => {
    const questions = normalizeQuestionsForScoring(
      normalizeQuestionsList(submission.questions),
      quizType
    );
    const totalQuestions = questions.length || submission.totalQuestions || 0;

    if (!questions.length) {
      return (
        <p className="text-sm text-text-light py-4 text-center">
          No question details available for this submission.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {questions.map((question, index) => {
          const studentAnswerRaw = extractStudentAnswer(submission.answers, index, question);
          let studentAnswer = formatAnswerDisplay(studentAnswerRaw);
          const questionType = normalizeQuizTypeLabel(question.type || quizType).toLowerCase();
          const isMultipleChoice =
            questionType.includes('multiple') || questionType === 'mcq';
          const correctIdx = isMultipleChoice ? getCorrectOptionIndex(question) : null;
          const selectedIdx = isMultipleChoice
            ? getSelectedOptionIndex(question, studentAnswerRaw)
            : null;

          if (isMultipleChoice && selectedIdx != null && question.options?.[selectedIdx]) {
            studentAnswer = getOptionText(question.options[selectedIdx]) || studentAnswer;
          }

          const { isCorrect } = reviewQuestionAnswer(
            question,
            studentAnswerRaw,
            quizType,
            totalQuestions
          );

          return (
            <div
              key={question.id || index}
              className={clsx(
                'rounded-xl border p-4',
                isCorrect ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/30'
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                {isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-light mb-1">
                    Question {index + 1}
                  </p>
                  <p className="text-sm font-medium text-text">
                    {question.questionText || question.text || `Question ${index + 1}`}
                  </p>
                </div>
              </div>

              {isMultipleChoice && Array.isArray(question.options) ? (
                <div className="space-y-2 ml-8">
                  {question.options.map((option, optIdx) => {
                    const text = getOptionText(option);
                    const isOptionCorrect = optIdx === correctIdx;
                    const isOptionSelected = optIdx === selectedIdx;

                    return (
                      <div
                        key={optIdx}
                        className={clsx(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                          isOptionCorrect && 'border-green-300 bg-green-50',
                          isOptionSelected && !isOptionCorrect && 'border-red-300 bg-red-50',
                          isOptionSelected && isOptionCorrect && 'border-green-400 bg-green-100 ring-1 ring-green-300',
                          !isOptionSelected && !isOptionCorrect && 'border-primary/10 bg-white'
                        )}
                      >
                        <span
                          className={clsx(
                            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                            isOptionSelected
                              ? isOptionCorrect
                                ? 'bg-green-600 text-white'
                                : 'bg-red-500 text-white'
                              : 'bg-primary/10 text-primary'
                          )}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1 text-text">{text || `Option ${optIdx + 1}`}</span>
                        {isOptionSelected && (
                          <span className="text-xs font-medium text-primary shrink-0">Student chose</span>
                        )}
                        {isOptionCorrect && !isOptionSelected && (
                          <span className="text-xs font-medium text-green-700 shrink-0">Correct answer</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ml-8 space-y-2 text-sm">
                  <div className="flex flex-wrap gap-x-2">
                    <span className="text-text-light">Student answer:</span>
                    <span className={clsx('font-medium', isCorrect ? 'text-green-700' : 'text-red-700')}>
                      {studentAnswer}
                    </span>
                  </div>
                  {!isCorrect && (question.sampleAnswer || question.correctAnswer != null) && (
                    <div className="flex flex-wrap gap-x-2">
                      <span className="text-text-light">Correct answer:</span>
                      <span className="font-medium text-green-700">
                        {formatAnswerDisplay(question.correctAnswer ?? question.sampleAnswer)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
        <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text">Reports</h1>
        <p className="text-text-light mt-1">
          Quiz performance overview and detailed participant results
        </p>
      </div>

      {/* Overview stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-primary/10 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">Quizzes</p>
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-3xl font-bold text-text">{overviewStats.totalQuizzes}</p>
        </div>
        <div className="bg-white rounded-2xl border border-primary/10 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">Participants</p>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <p className="text-3xl font-bold text-text">{overviewStats.totalParticipants}</p>
        </div>
        <div className="bg-white rounded-2xl border border-primary/10 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">Avg score</p>
            <Award className="w-4 h-4 text-primary" />
          </div>
          <p className="text-3xl font-bold text-text">{overviewStats.avgScore}%</p>
        </div>
        <div className="bg-white rounded-2xl border border-primary/10 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">Pass rate</p>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <p className="text-3xl font-bold text-text">{overviewStats.passRate}%</p>
          <p className="text-xs text-text-light mt-1">Passing: {PASS_THRESHOLD}%+</p>
        </div>
      </section>

      {/* Quiz reports list */}
      <section className="bg-white rounded-2xl border border-primary/10 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-primary/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Quiz reports</h2>
            <p className="text-sm text-text-light">View participant marks or remove a quiz from your library</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-primary/15 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-text"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-text-light">Loading reports...</div>
        ) : filteredReports.length === 0 ? (
          <div className="py-16 text-center">
            <FileQuestion className="w-12 h-12 text-primary/30 mx-auto mb-3" />
            <p className="text-text-light">No quizzes found in your library.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
              <thead>
                <tr className="bg-primary/5 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light">Quiz</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light">Audience joined</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light">Avg score</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light">Pass / Fail</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light">Date</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-light text-right">Actions</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-primary/10">
                {filteredReports.map((report) => (
                  <tr key={report.quiz.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-text">{report.quiz.title || 'Untitled Quiz'}</p>
                      <p className="text-xs text-text-light mt-0.5">
                        {normalizeQuizTypeLabel(report.quiz.type || 'Quiz')} ·{' '}
                        {report.quiz.questionCount ??
                          normalizeQuestionsList(report.quiz.questions).length ??
                          0}{' '}
                        questions
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-text">{report.participantCount}</td>
                    <td className="px-5 py-4 text-sm font-medium text-text">
                      {report.avgScore != null ? `${report.avgScore}%` : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {report.submittedCount > 0 ? (
                        <span>
                          <span className="text-green-700 font-medium">{report.passCount} passed</span>
                          <span className="text-text-light"> · </span>
                          <span className="text-red-600 font-medium">{report.failCount} failed</span>
                        </span>
                      ) : report.participantCount > 0 ? (
                        <span className="text-text-light">Joined · no score yet</span>
                      ) : (
                        <span className="text-text-light">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-text-light whitespace-nowrap">
                      {formatDate(report.quiz.createdAt || report.quiz.updatedAt)}
                  </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openQuizReport(report)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/20 rounded-lg hover:bg-primary/10 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmQuizId(report.quiz.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* Quiz report modal — nested participants → detail navigation */}
      {selectedReport && reportModalView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => {
            if (reportModalView === 'detail') backToParticipants();
            else closeReportModal();
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-primary/10 w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {reportModalView === 'detail' && selectedSubmission ? (
              <>
                <div className="flex items-start justify-between gap-4 p-6 border-b border-primary/10">
                  <div>
                    <button
                      type="button"
                      onClick={backToParticipants}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to participants
                    </button>
                    <h3 className="text-xl font-bold text-text">
                      {selectedSubmission.studentName || 'Anonymous Audience'}
                    </h3>
                    <p className="text-sm text-text-light mt-1">
                      {selectedReport.quiz.title} · {Number(selectedSubmission.percentage || 0)}% ·{' '}
                      {Number(selectedSubmission.percentage || 0) >= PASS_THRESHOLD ? 'Passed' : 'Failed'}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-text-light">
                      <span>
                        {selectedSubmission.correctAnswers ?? '—'}/{selectedSubmission.totalQuestions ?? '—'} correct
                      </span>
                      {formatDurationForReport(
                        normalizeTimeTakenSeconds(selectedSubmission) ?? selectedSubmission.timeTaken
                      ) && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDurationForReport(
                            normalizeTimeTakenSeconds(selectedSubmission) ?? selectedSubmission.timeTaken
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeReportModal}
                    className="p-2 rounded-lg text-text-light hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {renderQuestionReview(
                    enrichSubmission(selectedSubmission, selectedReport.quiz),
                    selectedSubmission.quizType || selectedReport.quiz.type
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 p-6 border-b border-primary/10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Quiz report</p>
                    <h3 className="text-xl font-bold text-text">{selectedReport.quiz.title}</h3>
                    <p className="text-sm text-text-light mt-1">
                      {selectedReport.joinedCount} student{selectedReport.joinedCount === 1 ? '' : 's'} joined
                      {selectedReport.submittedCount > 0
                        ? ` · ${selectedReport.submittedCount} submitted`
                        : ''}
                      {selectedReport.avgScore != null ? ` · Average ${selectedReport.avgScore}%` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeReportModal}
                    className="p-2 rounded-lg text-text-light hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {loadingReportDetail ? (
                    <div className="text-center py-12 text-text-light">Loading participants...</div>
                  ) : selectedReport.submissions.length === 0 ? (
                    <div className="text-center py-12 text-text-light">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p>No students have joined this quiz yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedReport.submissions
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(b.percentage || 0) - Number(a.percentage || 0) ||
                            String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
                        )
                        .map((submission) => {
                          const submitted = isSubmittedRow(submission);
                          const percentage = submitted ? Number(submission.percentage || 0) : null;
                          const passed = submitted && percentage >= PASS_THRESHOLD;
                          const durationLabel = formatDurationForReport(
                            normalizeTimeTakenSeconds(submission) ?? submission.timeTaken
                          );
                          return (
                            <div
                              key={submission.participantId || `${submission.submittedAt}-${submission.studentName}`}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-primary/10 hover:border-primary/25 hover:bg-primary/5 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-text">
                                  {submission.studentName || 'Anonymous Audience'}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-text-light">
                                  {submitted ? (
                                    <>
                                      <span className="font-medium text-text">{percentage}%</span>
                                      <span>
                                        {submission.correctAnswers ?? '—'}/{submission.totalQuestions ?? '—'} correct
                                      </span>
                                    </>
                                  ) : (
                                    <span>Joined · score not synced yet</span>
                                  )}
                                  {durationLabel && (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      {durationLabel}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span
                                  className={clsx(
                                    'px-3 py-1 rounded-full text-xs font-semibold',
                                    !submitted
                                      ? 'bg-primary/10 text-primary'
                                      : passed
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  )}
                                >
                                  {!submitted ? 'Joined' : passed ? 'Passed' : 'Failed'}
                                </span>
                                {submitted && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSubmission(submission);
                                      setReportModalView('detail');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-[#5A344D] transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                    View details
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmQuizId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteConfirmQuizId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-primary/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-text">Delete quiz report?</h3>
            </div>
            <p className="text-text-light text-sm mb-6">
              This permanently removes the quiz and all associated submission data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmQuizId(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border border-primary/20 text-text rounded-xl hover:bg-primary/5 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteQuiz}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
