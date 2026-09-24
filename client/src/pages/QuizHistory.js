import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AudienceDashboardNavbar from '../components/Audience/AudienceDashboardNavbar';
import { ArrowLeft, Award, TrendingUp, CheckCircle, Calendar, Clock, X, Search, Trash2, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useRtdbValue } from '../hooks/useRtdb';
import { studentsAPI } from '../services/api';
import { getStoredAudienceSession, getStudentQueryParams } from '../utils/audienceSession';
import { matchesStudentRecord } from '../utils/audienceIdentifiers';
import {
  buildDedupedQuizAttempts,
  getQuizAttemptCollapseKey,
  isSameQuizAttempt,
  readDedupedLocalQuizSubmissions,
} from '../utils/audienceQuizAttempts';
import { schedulePendingQuizSubmissionSync } from '../utils/quizSubmissionSync';

const PASS_THRESHOLD = 60;

const QUIZ_FILTER_OPTIONS = [
  'All Quizzes',
  'Last 4 Hours',
  'Last 7 Days',
  'Passed Only',
  'Failed Only',
];

const formatAttemptRow = (row) => {
  const submittedAtSource = row.submittedAt || (row.timestamp instanceof Date ? row.timestamp : null);
  const submittedAt = submittedAtSource ? new Date(submittedAtSource) : new Date();
  const percentage = Number(row.percentage ?? 0);
  const totalQuestions = Number(row.totalQuestions ?? 0);
  const correctAnswers =
    row.correctAnswers != null
      ? Number(row.correctAnswers)
      : row.score != null && row.score <= totalQuestions
      ? Number(row.score)
      : totalQuestions > 0
      ? Math.round((percentage / 100) * totalQuestions)
      : 0;

  return {
    id: getQuizAttemptCollapseKey({ ...row, submittedAt: submittedAt.toISOString() }),
    quizId: row.quizId,
    participantId: row.participantId,
    name: row.name || row.quizTitle || 'Quiz',
    status: percentage >= PASS_THRESHOLD ? 'Passed' : 'Failed',
    date: submittedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: submittedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    duration: row.timeTaken ? Math.max(1, Math.round(Number(row.timeTaken) / 60)) : 0,
    score: correctAnswers,
    totalQuestions,
    percentage,
    timestamp: submittedAt,
    submittedAt: submittedAt.toISOString(),
    answers: row.answers || {},
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

const QuizHistory = () => {
  const navigate = useNavigate();
  const { audienceLogout } = useAuth();
  const [student, setStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOption, setFilterOption] = useState('All Quizzes');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState('All Quizzes');
  const filterButtonRef = useRef(null);
  const filterSheetRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [apiAttempts, setApiAttempts] = useState([]);
  const [loadingApi, setLoadingApi] = useState(true);
  const [localSubmissions, setLocalSubmissions] = useState([]);

  const { value: quizzesTree } = useRtdbValue('quizzes');

  const refreshLocalSubmissions = useCallback(() => {
    setLocalSubmissions(readDedupedLocalQuizSubmissions());
  }, []);

  const loadQuizHistory = useCallback(async (currentStudent) => {
    if (!currentStudent) return;
    setLoadingApi(true);
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
    const loggedInAudience = getStoredAudienceSession();
    if (!loggedInAudience) {
      navigate('/join');
      return;
    }
    setStudent(loggedInAudience);
    refreshLocalSubmissions();
    schedulePendingQuizSubmissionSync();
    loadQuizHistory(loggedInAudience);

    const onFocus = () => loadQuizHistory(loggedInAudience);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadQuizHistory(loggedInAudience);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [navigate, refreshLocalSubmissions, loadQuizHistory]);

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
    )
      .filter((row) => !hiddenIds.includes(row.id))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [apiAttempts, localSubmissions, student, hiddenIds, quizzesTree]);

  const getFilteredQuizzes = () => {
    let filtered = [...quizAttempts];

    if (searchTerm) {
      filtered = filtered.filter((quiz) =>
        quiz.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    const now = new Date();
    switch (filterOption) {
      case 'Last 4 Hours':
        filtered = filtered.filter((quiz) => (now - quiz.timestamp) / (1000 * 60 * 60) <= 4);
        break;
      case 'Last 7 Days':
        filtered = filtered.filter((quiz) => (now - quiz.timestamp) / (1000 * 60 * 60 * 24) <= 7);
        break;
      case 'Passed Only':
        filtered = filtered.filter((quiz) => quiz.status === 'Passed');
        break;
      case 'Failed Only':
        filtered = filtered.filter((quiz) => quiz.status === 'Failed');
        break;
      default:
        break;
    }

    return filtered;
  };

  const handleDeleteClick = (quiz) => {
    setQuizToDelete(quiz);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    if (quizToDelete) {
      setHiddenIds((prev) => [...prev, quizToDelete.id]);
      setShowDeleteConfirm(false);
      setQuizToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setQuizToDelete(null);
  };

  const openFilterSheet = () => {
    setDraftFilter(filterOption);
    setFilterSheetOpen(true);
  };

  const closeFilterSheet = () => {
    setFilterSheetOpen(false);
    setDraftFilter(filterOption);
    window.requestAnimationFrame(() => {
      filterButtonRef.current?.focus();
    });
  };

  const applyFilterSheet = () => {
    setFilterOption(draftFilter);
    setFilterSheetOpen(false);
    window.requestAnimationFrame(() => {
      filterButtonRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!filterSheetOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    filterSheetRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFilterSheet();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterSheetOpen, filterOption]);

  const totalQuizzes = quizAttempts.length;
  const averageScore =
    quizAttempts.length > 0
      ? quizAttempts.reduce((sum, q) => sum + q.percentage, 0) / totalQuizzes
      : 0;
  const bestScore = quizAttempts.length > 0 ? Math.max(...quizAttempts.map((q) => q.percentage)) : 0;
  const mostRecentQuiz = quizAttempts.length > 0 ? quizAttempts[0] : null;

  const filteredQuizzes = getFilteredQuizzes();
  const loading = loadingApi && quizAttempts.length === 0;

  const handleLogout = async () => {
    await audienceLogout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <AudienceDashboardNavbar
        displayName={student?.name}
        displayEmail={student?.email}
        onLogout={handleLogout}
      />
      <div className="bg-white shadow-sm" style={{ borderBottom: '1px solid #E8E0F0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
            <button
              onClick={() => navigate('/audience/home')}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity text-primary max-md:min-h-11 max-[480px]:hidden"
            >
              <ArrowLeft className="w-5 h-5 shrink-0" />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="text-2xl font-bold max-md:text-xl" style={{ color: '#1a1a1a' }}>
              Quiz History
            </h1>
            <div className="w-32 max-md:hidden" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 max-[480px]:pt-3 max-[480px]:pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 max-[480px]:grid-cols-2 max-[480px]:gap-2 max-[480px]:mb-3">
          <div className="p-6 shadow-sm max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-primary shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <Award className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-tight max-[480px]:text-[12px] max-[360px]:text-[11px]" style={{ color: '#6B7280' }}>
                  <span className="max-[320px]:hidden">Total Quizzes</span>
                  <span className="hidden max-[320px]:inline">Total</span>
                </p>
                <p className="text-2xl font-bold leading-tight max-[480px]:text-[17px]" style={{ color: '#1a1a1a' }}>{totalQuizzes}</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-primary shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <TrendingUp className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-tight max-[480px]:text-[12px] max-[360px]:text-[11px]" style={{ color: '#6B7280' }}>
                  <span className="max-[320px]:hidden">Average Score</span>
                  <span className="hidden max-[320px]:inline">Average</span>
                </p>
                <p className="text-2xl font-bold leading-tight max-[480px]:text-[17px]" style={{ color: '#1a1a1a' }}>{averageScore.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-primary shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <CheckCircle className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-tight max-[480px]:text-[12px] max-[360px]:text-[11px]" style={{ color: '#6B7280' }}>
                  <span className="max-[320px]:hidden">Best Score</span>
                  <span className="hidden max-[320px]:inline">Best</span>
                </p>
                <p className="text-2xl font-bold leading-tight max-[480px]:text-[17px]" style={{ color: '#1a1a1a' }}>{bestScore}%</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm min-w-0 overflow-hidden max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-primary flex-shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <Calendar className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight max-[480px]:text-[12px] max-[360px]:text-[11px]" style={{ color: '#6B7280' }}>
                  <span className="max-[320px]:hidden">Most Recent</span>
                  <span className="hidden max-[320px]:inline">Recent</span>
                </p>
                <p
                  className="text-lg font-bold truncate leading-tight max-[480px]:text-[17px] max-[480px]:whitespace-nowrap max-[480px]:overflow-hidden max-[480px]:text-ellipsis"
                  style={{ color: '#1a1a1a' }}
                  title={mostRecentQuiz?.name || '—'}
                >
                  {mostRecentQuiz?.name || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="shadow-sm" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
          <div className="p-6" style={{ borderBottom: '0.5px solid #E8E0F0' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: '#1a1a1a' }}>Quiz Attempts</h2>
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary" />
                <input
                  type="text"
                  placeholder="Search quizzes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent max-[480px]:min-h-11"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E0F0', color: '#1a1a1a' }}
                />
              </div>
              <div className="relative hidden min-[481px]:block">
                <select
                  value={filterOption}
                  onChange={(e) => setFilterOption(e.target.value)}
                  className="appearance-none rounded-lg px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E0F0', color: '#1a1a1a', width: '180px' }}
                >
                  <option value="All Quizzes">All Quizzes</option>
                  <option value="Last 4 Hours">Last 4 Hours</option>
                  <option value="Last 7 Days">Last 7 Days</option>
                  <option value="Passed Only">Passed Only</option>
                  <option value="Failed Only">Failed Only</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none text-primary" />
              </div>
              <button
                ref={filterButtonRef}
                type="button"
                onClick={openFilterSheet}
                aria-label="Filter quizzes"
                aria-haspopup="dialog"
                aria-expanded={filterSheetOpen}
                className="relative hidden max-[480px]:inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-primary text-white"
              >
                <SlidersHorizontal className="w-5 h-5" />
                {filterOption !== 'All Quizzes' && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error-600 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                    1
                  </span>
                )}
              </button>
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid #F3EEF8' }}>
            {loading ? (
              <div className="p-12 text-center">
                <p className="text-gray-500 text-lg">Loading quiz history...</p>
              </div>
            ) : filteredQuizzes.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500 text-lg">No quizzes found</p>
                <p className="text-sm text-gray-400 mt-2">
                  Complete a quiz session to see your attempts here.
                </p>
              </div>
            ) : (
              filteredQuizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="p-6 flex items-center justify-between min-w-0 max-[480px]:flex-col max-[480px]:items-stretch max-[480px]:gap-3 max-[480px]:p-4"
                  style={{ borderBottom: '0.5px solid #F3EEF8' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2 min-w-0 max-[480px]:items-start">
                      <h3
                        className="text-lg font-bold min-w-0 flex-1 min-[481px]:truncate max-[480px]:line-clamp-2"
                        style={{ color: '#1a1a1a' }}
                        title={quiz.name}
                      >
                        {quiz.name}
                      </h3>
                      <span
                        className="px-3 py-1 text-xs font-medium flex-shrink-0"
                        style={{
                          borderRadius: '20px',
                          ...(quiz.status === 'Passed'
                            ? { backgroundColor: '#DCFCE7', color: '#16A34A' }
                            : { backgroundColor: '#FEE2E2', color: '#DC2626' }),
                        }}
                      >
                        {quiz.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-6 text-sm max-[480px]:flex-wrap max-[480px]:gap-x-3 max-[480px]:gap-y-1 max-[480px]:space-x-0">
                      <div className="flex items-center space-x-1 whitespace-nowrap" style={{ color: '#6B7280' }}>
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span className="hidden min-[481px]:inline">
                          {quiz.date} {quiz.time}
                        </span>
                        <span className="hidden max-[480px]:inline" title={`${quiz.date} ${quiz.time}`}>
                          {quiz.date}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 whitespace-nowrap" style={{ color: '#6B7280' }}>
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>{quiz.duration} min</span>
                      </div>
                      <div className="flex items-center space-x-1 whitespace-nowrap" style={{ color: '#6B7280' }}>
                        <span className="font-medium">
                          {quiz.score}/{quiz.totalQuestions}
                        </span>
                        <span>({quiz.percentage}%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-6 flex items-center space-x-3 flex-shrink-0 max-[480px]:ml-0 max-[480px]:justify-end max-[480px]:gap-2 max-[480px]:space-x-0">
                    {quiz.status === 'Passed' ? (
                      <div
                        className="w-12 h-12 max-[480px]:w-10 max-[480px]:h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#F3EEF8' }}
                      >
                        <CheckCircle className="w-6 h-6 max-[480px]:w-5 max-[480px]:h-5 text-primary" />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-12 max-[480px]:w-10 max-[480px]:h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#FEE2E2' }}
                      >
                        <X className="w-6 h-6 max-[480px]:w-5 max-[480px]:h-5" style={{ color: '#DC2626' }} />
                      </div>
                    )}
                    <button
                      onClick={() => handleDeleteClick(quiz)}
                      className="p-2 min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors group"
                    >
                      <Trash2
                        className="w-5 h-5 group-hover:text-red-500 transition-colors"
                        style={{ color: '#9CA3AF' }}
                      />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {filterSheetOpen && (
        <div className="fixed inset-0 z-50 hidden max-[480px]:block">
          <style>
            {`
              @keyframes feQuizFilterFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes feQuizFilterSlide { from { transform: translateY(100%) } to { transform: translateY(0) } }
            `}
          </style>
          <button
            type="button"
            aria-label="Close filter"
            className="absolute inset-0 bg-black/40"
            style={{ animation: 'feQuizFilterFade 200ms ease-out' }}
            onClick={closeFilterSheet}
          />
          <div
            ref={filterSheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-filter-sheet-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-soft-lg max-h-[80vh] flex flex-col outline-none"
            style={{ animation: 'feQuizFilterSlide 200ms ease-out' }}
          >
            <div className="flex flex-col items-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-neutral-300" />
              <h3
                id="quiz-filter-sheet-title"
                className="mt-3 text-base font-semibold text-text"
              >
                Filter quizzes
              </h3>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="quiz-filter-sheet-title"
              className="overflow-y-auto px-4"
            >
              {QUIZ_FILTER_OPTIONS.map((option, index) => {
                const selected = draftFilter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDraftFilter(option)}
                    className={`w-full min-h-12 flex items-center justify-between gap-3 py-3 text-left ${
                      index > 0 ? 'border-t border-neutral-200' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-text">{option}</span>
                    <span
                      className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        selected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
                      }`}
                    >
                      {selected && (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="p-4"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={applyFilterSheet}
                className="w-full min-h-12 rounded-lg bg-primary text-white font-semibold"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className="p-6 shadow-xl max-w-sm w-full mx-4"
            style={{ backgroundColor: '#FFFFFF', borderRadius: '12px' }}
          >
            <h3 className="text-lg font-bold mb-4" style={{ color: '#1a1a1a' }}>
              Hide Quiz
            </h3>
            <p className="mb-6" style={{ color: '#6B7280' }}>
              Hide this attempt from your history on this device?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid', borderColor: 'primary', color: 'primary' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 rounded-lg text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: '#DC2626', borderRadius: '8px' }}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizHistory;
