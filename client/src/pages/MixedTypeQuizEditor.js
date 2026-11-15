import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import LaunchQuizModal from '../components/LaunchQuizModal';
import QuizEditorHeaderActions from '../components/QuizEditorHeaderActions';
import NoActiveSessionLaunchModal from '../components/Host/NoActiveSessionLaunchModal';
import { TEACHER_PAGE_GUTTER_MD } from '../components/Host/HostLayout';
import QuestionTypeDropdown from '../components/QuestionTypeDropdown';
import AiQuizGeneratorPanel from '../components/AiQuizGeneratorPanel';
import { quizzesAPI, handleAPIError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useHostData } from '../contexts/HostDataContext';
import { AI_GENERATED_QUIZ_SOURCE } from '../utils/aiGeneratedQuiz';
import { normalizeQuizTypeLabel, normalizeQuestionsForEditor } from '../utils/quizQuestionNormalization';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  getActiveTeacherSession,
} from '../utils/requireActiveHostSession';
import { persistLaunchedQuizInLocalStorage } from '../utils/quizLaunchSettings';
import useQuizCreateBackToLibrary, { useGoToQuizLibrary } from '../hooks/useQuizCreateBackToLibrary';
import useQuizEditorDirty from '../hooks/useQuizEditorDirty';
import { openHostQuizLaunch } from '../utils/openHostQuizLaunch';
import {
  peekEditingQuizForType,
  serializeQuizEditorSnapshot,
} from '../utils/quizEditorSnapshot';

const QUIZ_TYPE = 'Mixed Type';

const MixedTypeQuizEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useQuizCreateBackToLibrary();
  const goToLibrary = useGoToQuizLibrary();
  const { alert } = useHybridAlert();
  const { user, userProfile } = useAuth();
  const teacherUid = userProfile?.uid || user?.uid;
  const { data: teacherData } = useHostData();
  const [initialEdit] = useState(() =>
    peekEditingQuizForType(QUIZ_TYPE, { acceptAnyWithQuestions: true })
  );
  const [quizTitle, setQuizTitle] = useState(initialEdit?.quiz.title || '');
  const [questions, setQuestions] = useState(initialEdit?.quiz.questions || []);
  const [isQuizSaved, setIsQuizSaved] = useState(Boolean(initialEdit?.isSavedEdit));
  const [isEditMode, setIsEditMode] = useState(Boolean(initialEdit?.isSavedEdit));
  const [editingQuizId, setEditingQuizId] = useState(initialEdit?.quiz.id || null);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchAccessCode, setLaunchAccessCode] = useState('');
  const [showNoSessionModal, setShowNoSessionModal] = useState(false);
  const [savedQuizId, setSavedQuizId] = useState(initialEdit?.isSavedEdit ? initialEdit.quiz.id : null);
  const [showAiPanel, setShowAiPanel] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('ai') === '1';
  });
  const [quizSource, setQuizSource] = useState(initialEdit?.quiz.source || null);
  const [isQuizLaunched, setIsQuizLaunched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState(() =>
    initialEdit?.isSavedEdit
      ? serializeQuizEditorSnapshot({
          title: initialEdit.quiz.title,
          questions: initialEdit.quiz.questions,
          quizType: QUIZ_TYPE,
        })
      : null
  );
  const persistedId = savedQuizId || (isEditMode ? editingQuizId : null);
  const { mode } = useQuizEditorDirty({
    title: quizTitle,
    questions,
    quizType: QUIZ_TYPE,
    persistedId,
    snapshot,
  });

  useEffect(() => {
    if (location.state?.openAiPanel) {
      setShowAiPanel(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (initialEdit) localStorage.removeItem('editingQuiz');
  }, [initialEdit]);

  useEffect(() => {
    const quizId = savedQuizId || editingQuizId;
    if (!quizId) return;

    const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
    const quiz = savedQuizzes.find((q) => q.id === quizId);
    setIsQuizLaunched(Boolean(quiz?.launched && quiz?.status === 'Launched'));
  }, [savedQuizId, editingQuizId]);

  const addQuestion = (questionType) => {
    const newQuestion = {
      id: Date.now(),
      type: questionType,
      questionText: '',
      // Add type-specific properties
      ...(questionType === 'multiple-choice' && {
        options: ['', '', '', ''],
        correctAnswer: 0
      }),
      ...(questionType === 'true-false' && {
        correctAnswer: true
      }),
      ...(questionType === 'short-answer' && {
        sampleAnswer: ''
      }),
      ...(questionType === 'long-answer' && {
        sampleAnswer: '',
        maxWords: 500
      })
    };
    setQuestions([...questions, newQuestion]);
  };

  const removeQuestion = (questionId) => {
    setQuestions(questions.filter(q => q.id !== questionId));
  };

  const updateQuestion = (questionId, updates) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, ...updates } : q
    ));
  };

  const handleApplyGeneratedQuiz = (quiz) => {
    const quizType = normalizeQuizTypeLabel(quiz.type || 'Mixed Type');
    setQuizTitle(quiz.title || '');
    setQuestions(normalizeQuestionsForEditor(quiz.questions || [], quizType));
    setIsEditMode(false);
    setEditingQuizId(null);
    setIsQuizSaved(false);
    setSavedQuizId(null);
    setSnapshot(null);
    setQuizSource(quiz.source || null);
  };

  const saveQuiz = async () => {
    // Save quiz state logic here
    if (quizTitle.trim() && questions.length > 0) {
      // Check if all questions have required content
      const validQuestions = questions.every(q => {
        if (!q.questionText.trim()) return false;
        
        if (q.type === 'multiple-choice') {
          return q.options.every(opt => opt.trim()) && q.correctAnswer >= 0;
        }
        if (q.type === 'true-false') {
          return q.correctAnswer !== undefined;
        }
        if (q.type === 'short-answer' || q.type === 'long-answer') {
          return q.sampleAnswer && q.sampleAnswer.trim();
        }
        return true;
      });
      
      if (validQuestions) {
        const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
        const existingQuiz = savedQuizzes.find(q => q.id === editingQuizId);
        const isActuallyEditMode = isEditMode && existingQuiz;

        const payload = {
          title: quizTitle.trim(),
          description: '',
          type: 'Mixed Type',
          questions,
          questionCount: questions.length,
          status: 'Ready',
          launched: false,
        };
        if (quizSource === AI_GENERATED_QUIZ_SOURCE || existingQuiz?.source === AI_GENERATED_QUIZ_SOURCE) {
          payload.source = AI_GENERATED_QUIZ_SOURCE;
        }
        if (isActuallyEditMode) payload.id = editingQuizId;

        setSaving(true);
        try {
          const res = isActuallyEditMode
            ? await quizzesAPI.update(editingQuizId, payload)
            : await quizzesAPI.create(payload);

          if (res.data.success && res.data.data) {
            const saved = res.data.data;
            setSavedQuizId(saved.id);
            setIsQuizSaved(true);
            setIsEditMode(true);
            setEditingQuizId(saved.id);
            setSnapshot(serializeQuizEditorSnapshot({ title: quizTitle, questions, quizType: QUIZ_TYPE }));

            const updatedList = isActuallyEditMode
              ? savedQuizzes.map((q) =>
                  q.id === editingQuizId ? { ...saved, createdDate: saved.createdAt || q.createdDate } : q
                )
              : [...savedQuizzes, { ...saved, createdDate: saved.createdAt }];
            localStorage.setItem('savedQuizzes', JSON.stringify(updatedList));
            alert.toast.success(isActuallyEditMode ? 'Quiz updated successfully' : 'Quiz saved successfully');
            goToLibrary();
          }
        } catch (err) {
          const apiErr = handleAPIError(err);
          alert.toast.error(apiErr.message || 'Failed to save quiz. Are you logged in as a host?');

          const quiz = {
            id: isActuallyEditMode ? editingQuizId : Date.now(),
            ...payload,
            createdDate: existingQuiz?.createdDate || new Date().toISOString(),
          };

          if (isActuallyEditMode) {
            const quizIndex = savedQuizzes.findIndex(q => q.id === editingQuizId);
            if (quizIndex !== -1) savedQuizzes[quizIndex] = quiz;
          } else {
            savedQuizzes.push(quiz);
          }

          localStorage.setItem('savedQuizzes', JSON.stringify(savedQuizzes));
        } finally {
          setSaving(false);
        }
      } else {
        alert.toast.error('Please complete all questions with required information.');
      }
    } else {
      alert.toast.error('Please add a quiz title and at least one question before saving.');
    }
  };

  const launchQuiz = async () => {
    const result = await openHostQuizLaunch({
      activeSession: teacherData.activeSession,
      teacherUid,
      quiz: {
        id: persistedId,
        title: quizTitle,
        type: QUIZ_TYPE,
        questions,
      },
    });
    if (!result.ok) {
      if (result.reason === 'no-session') setShowNoSessionModal(true);
      return;
    }
    setLaunchAccessCode(result.joinCode);
    setShowLaunchModal(true);
  };

  const handleLaunchQuiz = async (quizId, settings, launchedData) => {
    try {
      persistLaunchedQuizInLocalStorage(quizId, launchedData);
      setIsQuizLaunched(true);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to launch quiz';
      alert.toast.error(msg);
      throw err;
    }
  };

  const getQuestionTypeConfig = (type) => {
    const configs = {
      'multiple-choice': {
        icon: '🔘',
        color: 'blue',
        bgColor: 'bg-blue-50/50 hover:bg-blue-50/70',
        borderColor: 'focus:ring-blue-500 focus:border-blue-500',
        label: 'Multiple Choice'
      },
      'true-false': {
        icon: '✓',
        color: 'green',
        bgColor: 'bg-green-50/50 hover:bg-green-50/70',
        borderColor: 'focus:ring-green-500 focus:border-green-500',
        label: 'True / False'
      },
      'short-answer': {
        icon: '📝',
        color: 'purple',
        bgColor: 'bg-purple-50/50 hover:bg-purple-50/70',
        borderColor: 'focus:ring-purple-500 focus:border-purple-500',
        label: 'Short Answer'
      },
      'long-answer': {
        icon: '📄',
        color: 'orange',
        bgColor: 'bg-orange-50/50 hover:bg-orange-50/70',
        borderColor: 'focus:ring-orange-500 focus:border-orange-500',
        label: 'Long Answer'
      }
    };
    return configs[type] || configs['short-answer'];
  };

  const renderQuestionEditor = (question, index) => {
    const config = getQuestionTypeConfig(question.type);

    return (
      <div key={question.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6 lg:p-8 max-w-full min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4 sm:mb-6">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="text-2xl shrink-0">{config.icon}</div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 break-words">
                Question {index + 1}
              </h3>
              <p className="text-sm text-gray-500">{config.label}</p>
            </div>
          </div>
          <button
            onClick={() => removeQuestion(question.id)}
            className="inline-flex items-center justify-center space-x-1 min-h-11 px-3 text-red-500 hover:text-red-700 transition-colors rounded-lg hover:bg-red-50 shrink-0"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-sm font-medium">Remove</span>
          </button>
        </div>

        {/* Question Text Input */}
        <div className="mb-6">
          <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
            Question Text
          </label>
          <textarea
            value={question.questionText}
            onChange={(e) => updateQuestion(question.id, { questionText: e.target.value })}
            placeholder="Enter your question..."
            rows={3}
            className={`w-full px-4 py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${config.bgColor} resize-none`}
          />
        </div>

        {/* Type-specific fields */}
        {question.type === 'multiple-choice' && (
          <div className="space-y-3 sm:space-y-4">
            <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
              Answer Options
            </label>
            {question.options.map((option, optIndex) => {
              const isCorrect = question.correctAnswer === optIndex;
              const optionLetter = String.fromCharCode(65 + optIndex);
              return (
                <div key={optIndex} className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => updateQuestion(question.id, { correctAnswer: optIndex })}
                    className="flex-shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                  >
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                        isCorrect
                          ? 'border-[#6D415F] bg-[#6D415F]'
                          : 'border-gray-300 hover:border-[#6D415F]'
                      }`}
                    >
                      {isCorrect && (
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-white rounded-full" />
                      )}
                    </div>
                  </button>
                  <span className="text-sm sm:text-base font-semibold text-gray-600 uppercase">
                    {optionLetter}.
                  </span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...question.options];
                      newOptions[optIndex] = e.target.value;
                      updateQuestion(question.id, { options: newOptions });
                    }}
                    placeholder={`Option ${optionLetter}`}
                    className="flex-1 min-w-0 min-h-11 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-orange-50/50 hover:bg-orange-50/70"
                  />
                </div>
              );
            })}
          </div>
        )}

        {question.type === 'true-false' && (
          <div className="space-y-3 sm:space-y-4">
            <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
              Answer Options
            </label>
            <div className="grid grid-cols-1 min-[481px]:grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => updateQuestion(question.id, { correctAnswer: true })}
                className={`flex items-center space-x-3 min-h-11 px-4 py-3 rounded-xl border-2 transition-all duration-200 font-medium text-sm sm:text-base ${
                  question.correctAnswer === true
                    ? 'border-[#6D415F] bg-[#6D415F] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-[#6D415F] hover:bg-orange-50'
                }`}
              >
                <div
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    question.correctAnswer === true
                      ? 'border-white bg-white'
                      : 'border-gray-400 bg-white'
                  }`}
                >
                  {question.correctAnswer === true && (
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#6D415F] rounded-full" />
                  )}
                </div>
                <span className="font-semibold">True</span>
              </button>

              <button
                type="button"
                onClick={() => updateQuestion(question.id, { correctAnswer: false })}
                className={`flex items-center space-x-3 min-h-11 px-4 py-3 rounded-xl border-2 transition-all duration-200 font-medium text-sm sm:text-base ${
                  question.correctAnswer === false
                    ? 'border-[#6D415F] bg-[#6D415F] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-[#6D415F] hover:bg-orange-50'
                }`}
              >
                <div
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    question.correctAnswer === false
                      ? 'border-white bg-white'
                      : 'border-gray-400 bg-white'
                  }`}
                >
                  {question.correctAnswer === false && (
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#6D415F] rounded-full" />
                  )}
                </div>
                <span className="font-semibold">False</span>
              </button>
            </div>
          </div>
        )}

        {(question.type === 'short-answer' || question.type === 'long-answer') && (
          <div className="mb-6">
            <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
              Sample / Expected Answer {question.type === 'long-answer' && `(Max ${question.maxWords || 500} words)`}
            </label>
            <textarea
              value={question.sampleAnswer}
              onChange={(e) => updateQuestion(question.id, { sampleAnswer: e.target.value })}
              placeholder="Enter the sample or expected answer..."
              rows={question.type === 'long-answer' ? 4 : 2}
              className={`w-full px-4 py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${config.bgColor} resize-none`}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 overflow-x-hidden max-w-full">
      {!showAiPanel && (
      <div className={`w-full max-w-full py-4 sm:py-6 lg:py-8 max-md:px-4 max-md:pt-8 max-md:pb-6 ${TEACHER_PAGE_GUTTER_MD}`}>
        {/* Page Header with Navigation */}
        <div className="mb-6 sm:mb-8 lg:mb-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-3">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.375rem,5vw,2.25rem)] font-bold text-gray-900 mb-2 sm:mb-4 break-words max-md:text-xl">
                Create Mixed Type Quiz
              </h1>
              <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl">
                Add your quiz title and start creating questions with different types
              </p>
            </div>
            <QuizEditorHeaderActions
              mode={mode}
              saving={saving}
              onSave={saveQuiz}
              onLaunch={launchQuiz}
              extra={
                <button
                  type="button"
                  onClick={() => setShowAiPanel(true)}
                  className={clsx(
                    'flex items-center justify-center space-x-2 min-h-11 h-11 px-4 sm:px-5 rounded-xl font-medium text-sm sm:text-base shadow-sm hover:shadow-md transition-all w-full md:w-auto',
                    showAiPanel
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-white text-primary border border-primary/20 hover:bg-primary/5'
                  )}
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>AI Generator</span>
                </button>
              }
            />
          </div>
        </div>

        {/* Quiz Title Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 lg:mb-10 max-w-full">
          <div className="w-full max-w-3xl">
            <label htmlFor="quizTitle" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2 sm:mb-3">
              Quiz Title
            </label>
            <input
              type="text"
              id="quizTitle"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Enter your quiz title..."
              className="w-full min-h-11 px-4 sm:px-5 py-3 sm:py-4 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-orange-50/50 hover:bg-orange-50/70"
            />
          </div>
        </div>

        {/* Questions Section */}
        <div className="space-y-6 sm:space-y-8">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 max-md:text-lg">
            Questions
          </h2>

          {/* Questions List */}
          {questions.map((question, questionIndex) => renderQuestionEditor(question, questionIndex))}

          {/* Add Question Button - Only after questions */}
          {questions.length > 0 && (
            <div className="flex justify-center mt-8 w-full">
              <QuestionTypeDropdown onAddQuestion={addQuestion} />
            </div>
          )}

          {/* Empty State - Only when no questions */}
          {questions.length === 0 && (
            <div className="text-center py-12 sm:py-16">
              <div className="bg-orange-50 rounded-2xl p-6 sm:p-12 max-w-md mx-auto">
                <div className="text-4xl sm:text-5xl mb-4">🎯</div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                  No questions yet
                </h3>
                <p className="text-sm sm:text-base text-gray-600 mb-6">
                  Click "Add Question" to start creating your mixed type quiz
                </p>
                <div className="flex justify-center">
                  <QuestionTypeDropdown onAddQuestion={addQuestion} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Launch Quiz Modal */}
      <LaunchQuizModal
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        onLaunch={handleLaunchQuiz}
        quiz={{
          id: savedQuizId || editingQuizId || Date.now(),
          title: quizTitle,
          type: 'Mixed Type',
          questions: questions
        }}
        existingAccessCode={launchAccessCode || getActiveTeacherSession(teacherData.activeSession)?.joinCode || ''}
        redirectToLibraryOnSuccess
      />

      <NoActiveSessionLaunchModal
        isOpen={showNoSessionModal}
        onClose={() => setShowNoSessionModal(false)}
        onSaveAsDraft={async () => {
          if (mode !== 'saved') {
            await saveQuiz();
          } else {
            alert.toast.success('Quiz is already saved as a draft');
          }
        }}
      />

      <AiQuizGeneratorPanel
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        onApplyGeneratedQuiz={handleApplyGeneratedQuiz}
      />
    </div>
  );
};

export default MixedTypeQuizEditor;
