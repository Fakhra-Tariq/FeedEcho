import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Edit, Trash2, Calendar, AlertTriangle, Library, Copy, Flag, Clock, Lock, Plus } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import LaunchQuizModal from '../components/LaunchQuizModal';
import { quizzesAPI, handleAPIError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useHostData } from '../contexts/HostDataContext';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  resolveActiveTeacherSession,
} from '../utils/requireActiveHostSession';
import NoActiveSessionLaunchModal, {
  LaunchRequiresSessionHint,
} from '../components/Host/NoActiveSessionLaunchModal';
import PageHeaderCard from '../components/Host/PageHeaderCard';
import HeaderCardStats from '../components/Host/HeaderCardStats';
import ListFilterBar from '../components/Host/ListFilterBar';
import SessionLaunchBanner from '../components/Host/SessionLaunchBanner';
import { persistLaunchedQuizInLocalStorage } from '../utils/quizLaunchSettings';
import {
  getEditorRouteForQuizType,
  normalizeQuestionsForEditor,
  normalizeQuizTypeLabel,
} from '../utils/quizQuestionNormalization';

const QuizLibrary = () => {
  const navigate = useNavigate();
  const { alert } = useHybridAlert();
  const { user, userProfile } = useAuth();
  const teacherUid = userProfile?.uid || user?.uid;
  const { data: teacherData, syncQuizzes } = useHostData();
  const [loading, setLoading] = useState(true);
  const [deleteConfirmQuiz, setDeleteConfirmQuiz] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [showNoSessionModal, setShowNoSessionModal] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [accessCode, setAccessCode] = useState('');

  // Copy access code to clipboard
  const copyAccessCode = async (accessCode) => {
    try {
      await navigator.clipboard.writeText(accessCode);
      alert.toast.success('Access code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy code:', err);
      alert.toast.error('Failed to copy access code');
    }
  };

  const savedQuizzes = useMemo(() => {
    const list = (teacherData.quizzes || []).slice();
    list.sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );
    return list;
  }, [teacherData.quizzes]);

  const refreshQuizzes = useCallback(async () => {
    await syncQuizzes();
  }, [syncQuizzes]);

  useEffect(() => {
    if (!teacherUid) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    syncQuizzes().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [teacherUid, syncQuizzes]);

  // Finish quiz and mark as completed
  const finishQuiz = async (quizId) => {
    try {
      const res = await quizzesAPI.finish(quizId);
      if (res.data.success) {
        await refreshQuizzes();
        alert.toast.success('Quiz finished successfully!');
      }
    } catch (err) {
      const apiErr = handleAPIError(err);
      alert.toast.error(apiErr.message || 'Failed to finish quiz');
    }
  };

  // Check if there's currently an active quiz
  const hasActiveQuiz = savedQuizzes.some((q) => {
    const s = String(q.status || '').toLowerCase();
    return q.launched && (s === 'launched' || s === 'active');
  });

  // Calculate quiz statistics
  const getQuizStats = () => {
    const total = savedQuizzes.length;
    const active = savedQuizzes.filter((q) => {
      const s = String(q.status || '').toLowerCase();
      return q.launched && (s === 'launched' || s === 'active');
    }).length;
    const ready = savedQuizzes.filter((q) => {
      const s = String(q.status || '').toLowerCase();
      return !q.launched && (s === 'ready' || s === 'draft');
    }).length;
    const finished = savedQuizzes.filter((q) => {
      const s = String(q.status || '').toLowerCase();
      return s === 'finished' || s === 'completed';
    }).length;
    return { total, active, ready, finished };
  };

  // Filter quizzes based on search and filter
  const getFilteredQuizzes = () => {
    let filtered = savedQuizzes;
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(quiz => 
        quiz.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply status filter
    switch (activeFilter) {
      case 'ready':
        filtered = filtered.filter((q) => {
          const s = String(q.status || '').toLowerCase();
          return !q.launched && (s === 'ready' || s === 'draft');
        });
        break;
      case 'launched':
        filtered = filtered.filter((q) => {
          const s = String(q.status || '').toLowerCase();
          return q.launched && (s === 'launched' || s === 'active');
        });
        break;
      case 'finished':
        filtered = filtered.filter((q) => {
          const s = String(q.status || '').toLowerCase();
          return s === 'finished' || s === 'completed';
        });
        break;
      default:
        // 'all' - no additional filtering
        break;
    }
    
    return filtered;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const launchQuiz = async (quizId) => {
    const sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherUid);
    if (!sessionCheck.ok) {
      setShowNoSessionModal(true);
      return;
    }

    // Single source of truth: the server validates against sessions/{id}.currentActivity
    // (fresh on every request, auto-clears stale flags) — no separate client-side pre-check here.
    const quiz = savedQuizzes.find(q => q.id === quizId);

    if (quiz) {
      setSelectedQuiz(quiz);
      setAccessCode(sessionCheck.joinCode);
      setShowLaunchModal(true);
    }
  };

  const handleLaunchQuiz = async (quizId, settings, launchedData) => {
    try {
      persistLaunchedQuizInLocalStorage(quizId, launchedData);
      await refreshQuizzes();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to launch quiz';
      alert.toast.error(msg);
      throw err;
    }
  };

  const editQuiz = async (quizId) => {
    try {
      const response = await quizzesAPI.getById(quizId);
      const quiz = response.data?.data || response.data?.quiz;
      if (!quiz) {
        alert.toast.error('Could not load quiz for editing.');
        return;
      }

      const quizType = normalizeQuizTypeLabel(quiz.type);
      const normalizedQuiz = {
        ...quiz,
        id: quiz.id || quizId,
        type: quizType,
        questions: normalizeQuestionsForEditor(quiz.questions, quizType),
      };
      localStorage.setItem('editingQuiz', JSON.stringify(normalizedQuiz));
      navigate(getEditorRouteForQuizType(quizType));
    } catch (err) {
      const apiErr = handleAPIError(err);
      alert.toast.error(apiErr.message || 'Failed to load quiz for editing');
    }
  };

  const deleteQuiz = (quizId) => {
    // Set quiz for deletion confirmation
    setDeleteConfirmQuiz(quizId);
  };

  const confirmDelete = async () => {
    if (deleteConfirmQuiz) {
      try {
        // Soft-delete: leave library, keep student attempts & teacher reports
        const response = await quizzesAPI.delete(deleteConfirmQuiz);
        
        if (response.data.success) {
          alert.toast.success('Quiz removed from library. Audience reports are preserved.');
          await refreshQuizzes();
        } else {
          throw new Error(response.data.error || 'Delete failed');
        }
      } catch (err) {
        console.error('❌ Delete quiz error:', err);
        const msg = err.response?.data?.error || err.message || 'Failed to delete quiz';
        alert.toast.error(msg);
      } finally {
        setDeleteConfirmQuiz(null);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmQuiz(null);
  };

  // Get time remaining for a specific quiz
  const getQuizTimeRemaining = (quiz) => {
    if (!quiz.launched || !quiz.launchSettings?.endTime) {
      return null;
    }

    const now = new Date();
    const endTime = new Date(quiz.launchSettings.endTime);
    const remaining = endTime.getTime() - now.getTime();

    if (remaining <= 0) {
      return 0;
    }

    return Math.floor(remaining / 1000); // Return seconds
  };

  // Format time for display
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) {
      return '00:00';
    }

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer component for quiz cards
  const QuizTimer = ({ quiz }) => {
    const [timeLeft, setTimeLeft] = useState(() => getQuizTimeRemaining(quiz));
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
      const interval = setInterval(() => {
        const remaining = getQuizTimeRemaining(quiz);
        setTimeLeft(remaining);
        
        if (remaining === 0 && !isExpired) {
          setIsExpired(true);
          // Auto-finish the quiz
          finishQuiz(quiz.id);
        }
      }, 1000);

      return () => clearInterval(interval);
    }, [quiz, isExpired]);

    if (timeLeft === null) {
      return null;
    }

    return (
      <div className={`flex items-center space-x-2 text-sm font-medium ${
        timeLeft === 0 ? 'text-red-600' : timeLeft < 300 ? 'text-orange-600' : 'text-blue-600'
      }`}>
        <Clock className="w-4 h-4" />
        <span className={timeLeft < 300 ? 'animate-pulse' : ''}>
          Time left: {formatTime(timeLeft)}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F1EC] overflow-x-hidden max-w-full">
      <div className="w-full max-w-full py-0">
        {/* Library Dashboard Header */}
        <div className="mb-4 space-y-4">
          <SessionLaunchBanner />

          <PageHeaderCard
            compact
            icon={Library}
            title="Quiz Library"
            subtitle="Manage and organize your quizzes"
          >
            <HeaderCardStats
              stats={[
                { label: 'Total', value: getQuizStats().total },
                { label: 'Ready', value: getQuizStats().ready },
                { label: 'Active', value: getQuizStats().active },
                { label: 'Finished', value: getQuizStats().finished },
              ]}
            />
          </PageHeaderCard>

          {/* Filter and Search Row */}
          <ListFilterBar
            tabs={['all', 'ready', 'launched', 'finished']}
            activeTab={activeFilter}
            onTabChange={setActiveFilter}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search quizzes..."
          />
        </div>

        {/* Quiz Cards */}
        {loading && teacherUid ? (
          <div className="text-center py-20 text-gray-600">Loading quizzes…</div>
        ) : getFilteredQuizzes().length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 sm:p-12 md:p-16 max-w-lg mx-auto border border-[#8E7CC3]/20 shadow-xl">
              <div className="text-6xl sm:text-7xl mb-6">
                {searchTerm.trim() ? ' ' : ' '}
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-3">
                {searchTerm.trim() ? 'No quizzes found' : (savedQuizzes.length === 0 ? 'Your library is empty' : 'No quizzes match this filter')}
              </h3>
              <p className="text-gray-600 mb-8">
                {searchTerm.trim() 
                  ? 'Try adjusting your search terms'
                  : savedQuizzes.length === 0 
                    ? 'Create and save quizzes to see them here'
                    : 'Try selecting a different filter'
                }
              </p>
              <button
                type="button"
                onClick={() => navigate('/host/launch')}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Quiz
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active Quiz Notice */}
            {hasActiveQuiz && (
              <div className="mb-6 p-4 bg-[#8E7CC3]/10 border border-[#8E7CC3]/20 rounded-2xl backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-[#6D415F]/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-[#6D415F]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">
                      Only one quiz can be active at a time
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Finish the current active quiz before launching another one
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 min-[481px]:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
            {getFilteredQuizzes().map((quiz) => (
              <div key={quiz.id} className="group bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-[#8E7CC3]/20 p-4 sm:p-8 transition-all duration-300 hover:scale-[1.02] max-w-full min-w-0">
                {/* Quiz Header */}
                <div className="flex items-start justify-between mb-4 gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg sm:text-xl group-hover:text-[#6D415F] transition-colors break-words">
                      {quiz.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        quiz.status === 'Finished'
                          ? 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 border border-gray-300'
                          : quiz.launched 
                            ? 'bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-gradient-to-r from-green-100 to-green-50 text-green-700 border border-green-200'
                      }`}>
                        {quiz.status === 'Finished' ? 'Finished' : quiz.launched ? 'Launched' : (quiz.status === 'ready' || quiz.status === 'Ready') ? 'Ready' : quiz.status}
                      </span>
                      <span className="bg-gradient-to-r from-[#8E7CC3]/20 to-[#6D415F]/10 text-[#6D415F] px-3 py-1 rounded-full text-xs font-semibold border border-[#8E7CC3]/30">
                        {quiz.type}
                      </span>
                      <span className="flex items-center space-x-1 text-gray-600">
                        <span>{quiz.questionCount} questions</span>
                      </span>
                    </div>
                    
                    {/* Live Timer for Launched Quizzes */}
                    {quiz.launched && quiz.launchSettings?.endTime && (
                      <div className="mt-3">
                        <QuizTimer quiz={quiz} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(quiz.createdAt || quiz.createdDate)}</span>
                </div>

                {/* Access Code for Launched Quizzes */}
                {quiz.launched && quiz.launchSettings && quiz.launchSettings.accessCode && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 mb-1">Audience Access Code</div>
                        <div className="text-lg font-bold text-gray-900 tracking-widest uppercase break-all">
                          {quiz.launchSettings.accessCode}
                        </div>
                      </div>
                      <button
                        onClick={() => copyAccessCode(quiz.launchSettings?.accessCode || '')}
                        disabled={getQuizTimeRemaining(quiz) === 0}
                        className={`min-h-11 min-w-11 inline-flex items-center justify-center p-2 rounded-lg transition-all duration-200 shrink-0 ${
                          getQuizTimeRemaining(quiz) === 0
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-[#6D415F] text-white hover:bg-[#5A344D]'
                        }`}
                        title={getQuizTimeRemaining(quiz) === 0 ? 'Quiz expired - cannot copy code' : 'Copy access code'}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Quiz Actions */}
                <div className="flex flex-col space-y-3">
                  {/* Primary Action Button */}
                  {quiz.launched ? (
                    <button
                      onClick={() => finishQuiz(quiz.id)}
                      disabled={getQuizTimeRemaining(quiz) === 0}
                      className={`flex items-center justify-center space-x-2 min-h-11 px-4 py-3 rounded-xl transition-all duration-300 font-medium shadow-md hover:shadow-lg w-full ${
                        getQuizTimeRemaining(quiz) === 0
                          ? 'bg-gray-400 text-white cursor-not-allowed opacity-60'
                          : 'bg-[#6D415F] text-white hover:bg-[#5A344D]'
                      }`}
                      title={getQuizTimeRemaining(quiz) === 0 ? 'Quiz already expired' : 'Finish quiz manually'}
                    >
                      <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>{getQuizTimeRemaining(quiz) === 0 ? 'Quiz Expired' : 'Finish Quiz'}</span>
                    </button>
                  ) : hasActiveQuiz ? (
                    <button
                      disabled
                      className="flex items-center justify-center space-x-2 min-h-11 px-4 py-3 bg-gray-400 text-white rounded-xl cursor-not-allowed opacity-60 font-medium shadow-md w-full"
                      title="Only one quiz can be active at a time"
                    >
                      <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Quiz Active - Cannot Launch</span>
                    </button>
                  ) : (
                    <div className="w-full flex flex-col items-stretch">
                      <button
                        onClick={() => launchQuiz(quiz.id)}
                        className="flex items-center justify-center space-x-2 min-h-11 px-4 py-3 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] transition-all duration-300 font-medium shadow-md hover:shadow-lg w-full group-hover:scale-105"
                      >
                        <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Launch Quiz</span>
                      </button>
                      <LaunchRequiresSessionHint className="text-center" />
                    </div>
                  )}

                  {/* Secondary Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => editQuiz(quiz.id)}
                      className="inline-flex items-center justify-center space-x-2 min-h-11 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 font-medium text-sm flex-1 sm:flex-none"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => deleteQuiz(quiz.id)}
                      className="inline-flex items-center justify-center space-x-2 min-h-11 px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all duration-300 font-medium text-sm flex-1 sm:flex-none"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Visual Placeholder for Blocked Quizzes */}
                {hasActiveQuiz && !quiz.launched && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <div className="text-center text-gray-400">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Lock className="w-5 h-5" />
                        <span className="text-sm font-medium">Waiting for the active quiz to finish</span>
                      </div>
                      <p className="text-xs text-gray-400">You can launch this quiz once the current one is completed</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDelete}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Quiz</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Remove this quiz from your library? The audience will not be able to attempt it
              again, but existing scores and reports will be kept.
            </p>
            
            <div className="flex items-center gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 min-h-11 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Quiz Modal */}
      <LaunchQuizModal
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        onLaunch={handleLaunchQuiz}
        quiz={selectedQuiz}
        existingAccessCode={accessCode}
      />

      <NoActiveSessionLaunchModal
        isOpen={showNoSessionModal}
        onClose={() => setShowNoSessionModal(false)}
        onSaveAsDraft={async () => {
          alert.toast.success('Quiz is already saved in your library');
        }}
      />
    </div>
  );
};

export default QuizLibrary;
