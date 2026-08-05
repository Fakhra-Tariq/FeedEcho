import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, TrendingUp, CheckCircle, Calendar, Clock, X, Search, Trash2, ChevronDown } from 'lucide-react';
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
  const [student, setStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOption, setFilterOption] = useState('All Quizzes');
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

  const totalQuizzes = quizAttempts.length;
  const averageScore =
    quizAttempts.length > 0
      ? quizAttempts.reduce((sum, q) => sum + q.percentage, 0) / totalQuizzes
      : 0;
  const bestScore = quizAttempts.length > 0 ? Math.max(...quizAttempts.map((q) => q.percentage)) : 0;
  const mostRecentQuiz = quizAttempts.length > 0 ? quizAttempts[0] : null;

  const filteredQuizzes = getFilteredQuizzes();
  const loading = loadingApi && quizAttempts.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white shadow-sm" style={{ borderBottom: '1px solid #E8E0F0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/audience/home')}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity text-primary"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
              Quiz History
            </h1>
            <div className="w-32" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="p-6 shadow-sm" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-primary">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#6B7280' }}>Total Quizzes</p>
                <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>{totalQuizzes}</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-primary">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#6B7280' }}>Average Score</p>
                <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>{averageScore.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-primary">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#6B7280' }}>Best Score</p>
                <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>{bestScore}%</p>
              </div>
            </div>
          </div>

          <div className="p-6 shadow-sm min-w-0 overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}>
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-3 rounded-lg bg-primary flex-shrink-0">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ color: '#6B7280' }}>Most Recent</p>
                <p
                  className="text-lg font-bold truncate"
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
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary" />
                <input
                  type="text"
                  placeholder="Search quizzes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E0F0', color: '#1a1a1a' }}
                />
              </div>
              <div className="relative">
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
                  className="p-6 flex items-center justify-between min-w-0"
                  style={{ borderBottom: '0.5px solid #F3EEF8' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2 min-w-0">
                      <h3
                        className="text-lg font-bold truncate min-w-0 flex-1"
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
                    <div className="flex items-center space-x-6 text-sm">
                      <div className="flex items-center space-x-1" style={{ color: '#6B7280' }}>
                        <Calendar className="w-4 h-4" />
                        <span>
                          {quiz.date} {quiz.time}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1" style={{ color: '#6B7280' }}>
                        <Clock className="w-4 h-4" />
                        <span>{quiz.duration} min</span>
                      </div>
                      <div className="flex items-center space-x-1" style={{ color: '#6B7280' }}>
                        <span className="font-medium">
                          {quiz.score}/{quiz.totalQuestions}
                        </span>
                        <span>({quiz.percentage}%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-6 flex items-center space-x-3 flex-shrink-0">
                    {quiz.status === 'Passed' ? (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#F3EEF8' }}
                      >
                        <CheckCircle className="w-6 h-6 text-primary" />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#FEE2E2' }}
                      >
                        <X className="w-6 h-6" style={{ color: '#DC2626' }} />
                      </div>
                    )}
                    <button
                      onClick={() => handleDeleteClick(quiz)}
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors group"
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
