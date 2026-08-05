import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Rocket } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import LaunchQuizModal from '../components/LaunchQuizModal';
import { quizzesAPI, handleAPIError } from '../services/api';
import { useHostData } from '../contexts/HostDataContext';
import { AI_GENERATED_QUIZ_SOURCE } from '../utils/aiGeneratedQuiz';
import { loadEditingQuizFromStorage, normalizeQuizTypeLabel } from '../utils/quizQuestionNormalization';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  getActiveTeacherSession,
  requireActiveHostSession,
} from '../utils/requireActiveHostSession';
import { persistLaunchedQuizInLocalStorage } from '../utils/quizLaunchSettings';

const CreateShortAnswerQuiz = () => {
  const navigate = useNavigate();
  const { alert } = useHybridAlert();
  const { data: teacherData } = useHostData();
  const [quizTitle, setQuizTitle] = useState('');
  const [questions, setQuestions] = useState([]);
  const [isQuizSaved, setIsQuizSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [savedQuizId, setSavedQuizId] = useState(null);
  const [quizSource, setQuizSource] = useState(null);

  // Load editing quiz if exists
  useEffect(() => {
    const quiz = loadEditingQuizFromStorage();

    if (quiz && normalizeQuizTypeLabel(quiz.type) === 'Short Answer') {
      setQuizTitle(quiz.title);
      setQuestions(quiz.questions);
      setIsEditMode(!quiz.isFromPaste);
      setEditingQuizId(quiz.id);
      setQuizSource(quiz.source || null);
      localStorage.removeItem('editingQuiz');
    }
  }, []);

  const addQuestion = () => {
    const newQuestion = {
      id: Date.now(),
      questionText: '',
      sampleAnswer: ''
    };
    setQuestions([...questions, newQuestion]);
  };

  const removeQuestion = (questionId) => {
    setQuestions(questions.filter(q => q.id !== questionId));
  };

  const updateQuestionText = (questionId, text) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, questionText: text } : q
    ));
  };

  const updateSampleAnswer = (questionId, answer) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, sampleAnswer: answer } : q
    ));
  };

  const saveQuiz = async () => {
    if (!quizTitle.trim() || questions.length === 0) {
      alert.toast.error('Please add a quiz title and at least one question before saving.');
      return;
    }
    const validQuestions = questions.every(q => q.questionText.trim() && q.sampleAnswer.trim());
    if (!validQuestions) {
      alert.toast.error('Please complete all questions with text and a sample answer.');
      return;
    }
    const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
    const existingQuiz = savedQuizzes.find(q => q.id === editingQuizId);
    const isActuallyEditMode = isEditMode && existingQuiz;
    const payload = {
      title: quizTitle.trim(),
      description: '',
      type: 'Short Answer',
      questions,
      questionCount: questions.length,
      status: 'Ready',
      launched: false,
    };
    if (quizSource === AI_GENERATED_QUIZ_SOURCE || existingQuiz?.source === AI_GENERATED_QUIZ_SOURCE) {
      payload.source = AI_GENERATED_QUIZ_SOURCE;
    }
    if (isActuallyEditMode) payload.id = editingQuizId;
    try {
      const res = isActuallyEditMode
        ? await quizzesAPI.update(editingQuizId, payload)
        : await quizzesAPI.create(payload);
      if (res.data.success && res.data.data) {
        const saved = res.data.data;
        setSavedQuizId(saved.id);
        setIsQuizSaved(true);
        const updatedList = isActuallyEditMode
          ? savedQuizzes.map(q => (q.id === editingQuizId ? { ...saved, createdDate: saved.createdAt || q.createdDate } : q))
          : [...savedQuizzes, { ...saved, createdDate: saved.createdAt }];
        localStorage.setItem('savedQuizzes', JSON.stringify(updatedList));
        alert.toast.success(isActuallyEditMode ? 'Quiz updated successfully' : 'Quiz saved successfully');
      }
    } catch (err) {
      const apiErr = handleAPIError(err);
      alert.toast.error(apiErr.message || 'Failed to save quiz. Are you logged in as a teacher?');
      const quiz = { id: isActuallyEditMode ? editingQuizId : Date.now(), ...payload, createdDate: existingQuiz?.createdDate || new Date().toISOString() };
      if (isActuallyEditMode) { const idx = savedQuizzes.findIndex(q => q.id === editingQuizId); if (idx !== -1) savedQuizzes[idx] = quiz; } else savedQuizzes.push(quiz);
      localStorage.setItem('savedQuizzes', JSON.stringify(savedQuizzes));
      setSavedQuizId(quiz.id);
      setIsQuizSaved(true);
    }
  };

  const launchQuiz = () => {
    const sessionCheck = requireActiveHostSession(teacherData.activeSession);
    if (!sessionCheck.ok) {
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
    const hasActiveQuiz = savedQuizzes.some(q => q.launched && q.status === 'Launched');

    if (hasActiveQuiz) {
      alert.modal.warning('Only one quiz can be active at a time. Please finish the current active quiz before launching another one.');
      return;
    }

    setShowLaunchModal(true);
  };

  const handleLaunchQuiz = async (quizId, settings, launchedData) => {
    try {
      persistLaunchedQuizInLocalStorage(quizId, launchedData);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to launch quiz';
      alert.toast.error(msg);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4">
        {/* Page Header with Navigation */}
        <div className="mb-2 sm:mb-3 lg:mb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/quiz-library')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base font-medium">Back to Library</span>
            </button>
            
            <div className="flex items-center space-x-3">
              {/* Save Quiz Button */}
              <button
                onClick={saveQuiz}
                disabled={isQuizSaved}
                className={`flex items-center space-x-2 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-medium text-sm sm:text-base shadow-sm hover:shadow-md transition-all ${
                  isQuizSaved 
                    ? 'bg-purple-100 text-purple-700 border border-purple-300 cursor-not-allowed' 
                    : 'bg-[#6D415F] text-white hover:bg-[#5A344D]'
                }`}
              >
                {isQuizSaved ? (
                  <>
                    <span className="w-4 h-4 sm:w-5 sm:h-5">✓</span>
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Save Quiz</span>
                  </>
                )}
              </button>

              {/* Launch Quiz Button - Secondary, appears after saving */}
              {isQuizSaved && (
                <button
                  onClick={launchQuiz}
                  className="flex items-center space-x-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] transition-colors font-medium text-sm sm:text-base shadow-sm hover:shadow-md"
                >
                  <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Launch Quiz</span>
                </button>
              )}
            </div>
          </div>
          
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2 mt-2">
            Create Short Answer Quiz
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl">
            Add your quiz title and start creating questions
          </p>
        </div>

        {/* Quiz Title Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 sm:p-3 lg:p-4 mb-2 sm:mb-3 lg:mb-4">
          <div className="max-w-3xl">
            <label htmlFor="quizTitle" className="block text-sm sm:text-base font-semibold text-gray-700 mb-1 sm:mb-2">
              Quiz Title
            </label>
            <input
              type="text"
              id="quizTitle"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Enter your quiz title..."
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-orange-50/50 hover:bg-orange-50/70"
            />
          </div>
        </div>

        {/* Questions Section */}
        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
            Questions
          </h2>

          {/* Questions List */}
          {questions.map((question, questionIndex) => (
            <div key={question.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4 lg:p-5">
              <div className="flex items-start justify-between mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
                  Question {questionIndex + 1}
                </h3>
                <button
                  onClick={() => removeQuestion(question.id)}
                  className="flex items-center space-x-1 text-red-500 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm font-medium hidden sm:inline">Remove</span>
                </button>
              </div>

              {/* Question Text Input */}
              <div className="mb-6">
                <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                  Question Text
                </label>
                <textarea
                  value={question.questionText}
                  onChange={(e) => updateQuestionText(question.id, e.target.value)}
                  placeholder="Enter your question..."
                  rows={3}
                  className="w-full px-4 py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-orange-50/50 hover:bg-orange-50/70 resize-none"
                />
              </div>

              {/* Sample Answer Input */}
              <div className="mb-6">
                <label className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                  Sample / Expected Answer
                </label>
                <textarea
                  value={question.sampleAnswer}
                  onChange={(e) => updateSampleAnswer(question.id, e.target.value)}
                  placeholder="Enter the sample or expected answer..."
                  rows={2}
                  className="w-full px-4 py-3 text-sm sm:text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-orange-50/50 hover:bg-orange-50/70 resize-none"
                />
              </div>
            </div>
          ))}

          {/* Add Question Button - Only after questions */}
          {questions.length > 0 && (
            <div className="flex justify-center mt-8">
              <button
                onClick={addQuestion}
                className="flex items-center space-x-2 px-6 sm:px-8 py-3 sm:py-4 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] transition-colors font-medium text-sm sm:text-base shadow-sm hover:shadow-md"
              >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>Add Question</span>
              </button>
            </div>
          )}

          {/* Empty State - Only when no questions */}
          {questions.length === 0 && (
            <div className="text-center py-4 sm:py-6">
              <div className="bg-orange-50 rounded-2xl p-3 sm:p-4 max-w-md mx-auto">
                <div className="text-3xl sm:text-4xl mb-2">📝</div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                  No questions yet
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-3">
                  Click "Add Question" to start creating your short answer quiz
                </p>
                <button
                  onClick={addQuestion}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] transition-colors font-medium text-sm sm:text-base shadow-sm hover:shadow-md mx-auto"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Add First Question</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Launch Quiz Modal */}
      <LaunchQuizModal
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        onLaunch={handleLaunchQuiz}
        quiz={{
          id: savedQuizId || editingQuizId || Date.now(),
          title: quizTitle,
          type: 'Short Answer',
          questions: questions
        }}
        existingAccessCode={getActiveTeacherSession(teacherData.activeSession)?.joinCode || ''}
      />
    </div>
  );
};

export default CreateShortAnswerQuiz;
