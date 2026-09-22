import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { X, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { quizzesAPI } from '../services/api';
import { appToast } from '../contexts/HybridAlertContext';
import {
  buildEditingQuizFromAiResponse,
  getQuizEditorRoute,
  isUsableAiQuizResponse,
} from '../utils/aiGeneratedQuiz';

const QUESTION_TYPE_OPTIONS = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'trueFalse', label: 'True/false' },
  { value: 'shortAnswer', label: 'Short answer' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const clampQuestionCount = (value) => Math.min(50, Math.max(1, value));

const MIN_PROMPT_LENGTH = 5;
const PROMPT_REQUIRED_MSG = 'Please enter a prompt describing what your quiz should cover.';
const GENERATE_FAILED_MSG =
  "Couldn't generate a quiz from that prompt. Try describing a specific topic.";

const isPromptInvalid = (value) => String(value || '').trim().length < MIN_PROMPT_LENGTH;

const AI_MODAL_PARAM = 'ai';

const hasAiHistoryFlag = (search) =>
  new URLSearchParams(search || '').get(AI_MODAL_PARAM) === '1';

const AiQuizGeneratorPanel = ({ isOpen, onClose, onApplyGeneratedQuiz }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isSlidIn, setIsSlidIn] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [questionTypes, setQuestionTypes] = useState(['mcq', 'trueFalse', 'shortAnswer']);
  const [difficulty, setDifficulty] = useState('medium');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [questionTypeError, setQuestionTypeError] = useState(null);
  const onCloseRef = useRef(onClose);
  const historyEntryRef = useRef('idle');
  const promptRef = useRef(null);
  const formScrollRef = useRef(null);
  onCloseRef.current = onClose;

  const showPromptError = (message) => {
    setErrorMessage(message);
    const scrollToPrompt = () => {
      formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      promptRef.current?.focus();
    };
    requestAnimationFrame(scrollToPrompt);
  };

  const handlePromptChange = (event) => {
    const next = event.target.value;
    setPrompt(next);
    if (!isPromptInvalid(next)) {
      setErrorMessage(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsSlidIn(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    setIsSlidIn(false);
    const timer = setTimeout(() => setShouldRender(false), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // One history entry while the modal is open so browser Back closes it in place.
  useEffect(() => {
    if (!isOpen) {
      historyEntryRef.current = 'idle';
      return;
    }
    if (hasAiHistoryFlag(location.search)) {
      historyEntryRef.current = 'active';
      return;
    }
    if (historyEntryRef.current === 'pending' || historyEntryRef.current === 'active') return;
    historyEntryRef.current = 'pending';
    const params = new URLSearchParams(location.search);
    params.set(AI_MODAL_PARAM, '1');
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      { replace: false }
    );
  }, [isOpen, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!isOpen) return;
    if (historyEntryRef.current !== 'active') return;
    if (hasAiHistoryFlag(location.search)) return;
    historyEntryRef.current = 'idle';
    onCloseRef.current?.();
  }, [isOpen, location.search]);

  const dismissModal = () => {
    const hadFlag = hasAiHistoryFlag(window.location.search);
    historyEntryRef.current = 'idle';
    onCloseRef.current?.();
    if (hadFlag) {
      navigate(-1);
    }
  };

  const clearAiFlagByReplace = (nextPath) => {
    if (nextPath) {
      navigate(nextPath, { replace: hasAiHistoryFlag(window.location.search) });
      return;
    }
    if (!hasAiHistoryFlag(window.location.search)) return;
    const params = new URLSearchParams(location.search);
    params.delete(AI_MODAL_PARAM);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '' },
      { replace: true }
    );
  };

  const toggleQuestionType = (value) => {
    setQuestionTypeError(null);
    setQuestionTypes((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((type) => type !== value);
      }
      return [...prev, value];
    });
  };

  const adjustQuestionCount = (delta) => {
    setNumberOfQuestions((prev) => clampQuestionCount(Number(prev || 5) + delta));
  };

  const handleQuestionCountChange = (event) => {
    const raw = event.target.value;
    if (raw === '') {
      setNumberOfQuestions('');
      return;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      setNumberOfQuestions(parsed);
    }
  };

  const handleQuestionCountBlur = () => {
    setNumberOfQuestions((prev) => {
      const parsed = Number.parseInt(String(prev), 10);
      if (Number.isNaN(parsed)) return 5;
      return clampQuestionCount(parsed);
    });
  };

  const applyGeneratedQuiz = (data) => {
    const quiz = buildEditingQuizFromAiResponse(data);
    const route = getQuizEditorRoute(quiz.type);
    const hadFlag = hasAiHistoryFlag(window.location.search);
    historyEntryRef.current = 'idle';

    if (location.pathname === route) {
      onApplyGeneratedQuiz?.(quiz);
      onCloseRef.current?.();
      clearAiFlagByReplace();
      return;
    }

    localStorage.setItem('editingQuiz', JSON.stringify(quiz));
    onCloseRef.current?.();
    navigate(route, { replace: hadFlag });
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    const trimmedPrompt = prompt.trim();

    if (isPromptInvalid(prompt)) {
      showPromptError(PROMPT_REQUIRED_MSG);
      return;
    }

    if (!questionTypes.length) {
      setQuestionTypeError('Please select at least one question type.');
      return;
    }

    const count = clampQuestionCount(Number.parseInt(String(numberOfQuestions), 10) || 5);
    setNumberOfQuestions(count);

    setIsGenerating(true);
    setErrorMessage(null);
    setQuestionTypeError(null);

    try {
      const response = await quizzesAPI.generateAi({
        prompt: trimmedPrompt,
        questionTypes,
        difficulty,
        numberOfQuestions: count,
      });

      const payload = response.data;
      const data = payload?.data;

      if (
        !payload?.success ||
        data?.error ||
        payload?.error ||
        !isUsableAiQuizResponse(data)
      ) {
        showPromptError(GENERATE_FAILED_MSG);
        return;
      }

      applyGeneratedQuiz(data);
    } catch (error) {
      const status = error.response?.status;
      const apiError = error.response?.data?.data?.error || error.response?.data?.error;
      if (status === 400) {
        showPromptError(PROMPT_REQUIRED_MSG);
        return;
      }
      if (apiError) {
        showPromptError(GENERATE_FAILED_MSG);
        return;
      }
      appToast.error('Failed to generate quiz, please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center bg-background p-3 sm:p-4 transition-opacity duration-300',
        isSlidIn ? 'opacity-100' : 'opacity-0'
      )}
      role="dialog"
      aria-modal="true"
      aria-label="AI quiz assistant"
    >
      <div
        className={clsx(
          'w-full max-w-[min(400px,100%)] max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden bg-background shadow-2xl rounded-2xl border border-primary/10 transition-all duration-300 ease-in-out',
          isSlidIn ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        )}
      >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-primary/10 bg-background flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-text tracking-tight">AI quiz assistant</h2>
          <p className="text-sm text-text/70 mt-1 leading-relaxed">
            Describe what your quiz should cover.
          </p>
        </div>
        <button
          type="button"
          onClick={dismissModal}
          className="min-h-11 min-w-11 p-2 rounded-lg text-text/60 hover:text-primary hover:bg-primary/10 transition-colors shrink-0 inline-flex items-center justify-center"
          aria-label="Close AI quiz assistant"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form */}
      <div ref={formScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-5 space-y-6">
        {/* Prompt */}
        <div>
          <label htmlFor="ai-prompt" className="block text-sm font-semibold text-text mb-2">
            Prompt
          </label>
          <textarea
            id="ai-prompt"
            ref={promptRef}
            value={prompt}
            onChange={handlePromptChange}
            placeholder="e.g. Object-oriented programming: classes, objects, inheritance and polymorphism"
            rows={4}
            aria-invalid={Boolean(errorMessage)}
            className={clsx(
              'w-full px-4 py-3 text-sm text-text rounded-xl focus:outline-none focus:ring-2 resize-none bg-white placeholder:text-text/40',
              errorMessage
                ? 'border border-red-400 focus:ring-red-200 focus:border-red-500'
                : 'border border-primary/15 focus:ring-primary/20 focus:border-primary'
            )}
          />
          {errorMessage && (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Question type */}
        <div>
          <p className="block text-sm font-semibold text-text mb-3">Question type</p>
          <div className="space-y-2">
            {QUESTION_TYPE_OPTIONS.map((option) => {
              const isChecked = questionTypes.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={clsx(
                    'flex items-center gap-3 min-h-11 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                    isChecked
                      ? 'bg-primary/8 border-primary/30'
                      : 'bg-white border-primary/10 hover:border-primary/25'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleQuestionType(option.value)}
                    className="w-4 h-4 rounded border-primary/30 text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm font-medium text-text">{option.label}</span>
                </label>
              );
            })}
          </div>
          {questionTypeError && (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {questionTypeError}
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div>
          <p className="block text-sm font-semibold text-text mb-3">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_OPTIONS.map((option) => {
              const isSelected = difficulty === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDifficulty(option.value)}
                  className={clsx(
                    'flex-1 min-w-[5.5rem] min-h-11 py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all',
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-text border-primary/15 hover:border-primary/35 hover:bg-primary/5'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Number of questions */}
        <div>
          <label htmlFor="ai-count" className="block text-sm font-semibold text-text mb-3">
            Number of questions
          </label>
          <div className="flex items-stretch">
            <input
              id="ai-count"
              type="number"
              min={1}
              max={50}
              value={numberOfQuestions}
              onChange={handleQuestionCountChange}
              onBlur={handleQuestionCountBlur}
              className="flex-1 min-w-0 min-h-11 px-4 py-3 text-sm text-text border border-primary/15 rounded-l-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <div className="flex flex-col border border-l-0 border-primary/15 rounded-r-xl overflow-hidden bg-white min-h-11">
              <button
                type="button"
                onClick={() => adjustQuestionCount(1)}
                disabled={Number(numberOfQuestions) >= 50}
                className="flex-1 min-h-[22px] flex items-center justify-center px-3 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-b border-primary/10"
                aria-label="Increase number of questions"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => adjustQuestionCount(-1)}
                disabled={Number(numberOfQuestions) <= 1}
                className="flex-1 min-h-[22px] flex items-center justify-center px-3 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Decrease number of questions"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-5 py-4 bg-background border-t border-primary/10 flex-shrink-0">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className={clsx(
            'w-full flex items-center justify-center gap-2 min-h-11 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
            'bg-primary text-white hover:bg-[#5A344D] shadow-soft',
            'disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating your quiz...
            </>
          ) : (
            'Generate'
          )}
        </button>
      </div>
    </div>
  </div>
  );
};

export default AiQuizGeneratorPanel;
