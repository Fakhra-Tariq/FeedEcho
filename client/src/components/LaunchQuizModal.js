import React, { useState } from 'react';
import { X, Play, Minus, Plus } from 'lucide-react';
import QuizLaunchedModal from './QuizLaunchedModal';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { NO_ACTIVE_SESSION_MESSAGE } from '../utils/requireActiveHostSession';
import {
  launchQuizWithSettings,
  parseOptionalMinutes,
  QUIZ_TIME_MAX_MINUTES,
  QUIZ_TIME_MIN_MINUTES,
  QUIZ_TIME_PRESETS,
  QUIZ_TIME_STEP_MINUTES,
} from '../utils/quizLaunchSettings';

const LaunchQuizModal = ({ isOpen, onClose, onLaunch, quiz, existingAccessCode }) => {
  const { alert } = useHybridAlert();
  
  const [timeLimit, setTimeLimit] = useState(null);
  const [timePerStudent, setTimePerStudent] = useState(null);
  const [liveTimeHint, setLiveTimeHint] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleAnswers, setShuffleAnswers] = useState(false);
  const [showFinalScore, setShowFinalScore] = useState(true);
  const [oneAttempt, setOneAttempt] = useState(false);
  const [showLaunchedModal, setShowLaunchedModal] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [launching, setLaunching] = useState(false);

  const handleLiveTimeChange = (next) => {
    setTimeLimit(next);
    if (next != null && timePerStudent != null && next < timePerStudent) {
      setTimePerStudent(next);
      setLiveTimeHint(true);
      return;
    }
    setLiveTimeHint(false);
  };

  const handleAttemptTimeChange = (next) => {
    setTimePerStudent(next);
    if (next != null && timeLimit != null && next > timeLimit) {
      setTimeLimit(next);
    }
  };

  const handleLaunch = async () => {
    if (!existingAccessCode) {
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    const now = new Date();
    const quizAvailabilityMinutes = parseOptionalMinutes(timeLimit);
    const timePerStudentMinutes = parseOptionalMinutes(timePerStudent);

    let endTime = null;
    if (quizAvailabilityMinutes) {
      endTime = new Date(now.getTime() + quizAvailabilityMinutes * 60 * 1000).toISOString();
    }

    const launchSettings = {
      quizAvailabilityMinutes,
      timePerStudentMinutes,
      launchedAt: now.toISOString(),
      endTime,
      shuffleQuestions,
      shuffleAnswers,
      showFinalScore,
      oneAttempt,
      accessCode: existingAccessCode,
    };

    const code = existingAccessCode;

    setLaunching(true);
    try {
      const launchedData = await launchQuizWithSettings(quiz.id, launchSettings);
      if (onLaunch) {
        await onLaunch(quiz.id, launchSettings, launchedData);
      }
      setAccessCode(code);
      alert.toast.success(`Quiz "${quiz.title}" launched successfully!`, {
        title: 'Quiz Launched',
        duration: 4000,
      });
      setShowLaunchedModal(true);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to launch quiz';
      alert.toast.error(msg);
    } finally {
      setLaunching(false);
    }
  };

  const handleLaunchedModalClose = () => {
    setShowLaunchedModal(false);
    onClose();
  };

  if (!isOpen || !quiz) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div 
        className="absolute inset-0 bg-purple-50/80 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />

      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 24px)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-2 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 min-w-0 break-words">Quiz Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 inline-flex items-center justify-center"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-4 sm:px-6 min-h-0 overflow-y-auto overflow-x-hidden flex-1">
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <MinuteStepperField
              label="Quiz live for"
              description="How long the quiz remains live and joinable"
              value={timeLimit}
              onChange={handleLiveTimeChange}
              presets={QUIZ_TIME_PRESETS}
              hint={liveTimeHint ? 'Live time cannot be less than attempt time.' : null}
            />

            <MinuteStepperField
              label="Each audience member gets up to"
              description="Time each audience member has to attempt the quiz after joining"
              value={timePerStudent}
              onChange={handleAttemptTimeChange}
              presets={QUIZ_TIME_PRESETS}
            />

            <div className="space-y-2">
              <ToggleRow
                label="Shuffle questions"
                enabled={shuffleQuestions}
                onToggle={() => setShuffleQuestions((prev) => !prev)}
              />
              <ToggleRow
                label="Shuffle answers"
                enabled={shuffleAnswers}
                onToggle={() => setShuffleAnswers((prev) => !prev)}
              />
              <ToggleRow
                label="Show final score"
                enabled={showFinalScore}
                onToggle={() => setShowFinalScore((prev) => !prev)}
              />
              <ToggleRow
                label="One attempt only"
                badge="PRO"
                enabled={oneAttempt}
                onToggle={() => setOneAttempt((prev) => !prev)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse min-[481px]:flex-row items-stretch min-[481px]:items-center justify-between gap-2 px-4 sm:px-6 pt-3 pb-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-6 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors w-full min-[481px]:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={launching}
            className="flex items-center justify-center gap-2 min-h-11 px-6 py-2 bg-[#6D415F] text-white rounded-lg hover:bg-[#5A344D] transition-all font-medium disabled:opacity-60 w-full min-[481px]:w-auto"
          >
            <Play className="w-4 h-4" />
            {launching ? 'Launching…' : 'Launch Quiz'}
          </button>
        </div>
      </div>

      <QuizLaunchedModal
        isOpen={showLaunchedModal}
        onClose={handleLaunchedModalClose}
        accessCode={accessCode}
      />
    </div>
  );
};

const MinuteStepperField = ({ label, description, value, onChange, presets, hint = null }) => {
  const clampMinutes = (raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < QUIZ_TIME_MIN_MINUTES) return QUIZ_TIME_MIN_MINUTES;
    if (parsed > QUIZ_TIME_MAX_MINUTES) return QUIZ_TIME_MAX_MINUTES;
    return parsed;
  };

  const applyChange = (next) => {
    onChange(clampMinutes(next));
  };

  const stepBy = (delta) => {
    const current = value == null ? QUIZ_TIME_MIN_MINUTES : Number(value);
    const next = current + delta;
    if (next < QUIZ_TIME_MIN_MINUTES) {
      onChange(null);
      return;
    }
    applyChange(next);
  };

  const handleInputChange = (event) => {
    const raw = event.target.value;
    if (raw === '') {
      onChange(null);
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    applyChange(raw);
  };

  const handleBlur = () => {
    if (value == null) return;
    applyChange(value);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>

      <div className="flex flex-wrap gap-2 mb-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`min-h-11 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
              value === preset
                ? 'bg-[#6D415F] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-[#6D415F]/40 hover:text-[#6D415F]'
            }`}
          >
            {preset} min
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => stepBy(-QUIZ_TIME_STEP_MINUTES)}
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#6D415F]/40 hover:text-[#6D415F] transition-colors shrink-0"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="w-4 h-4" />
        </button>

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value == null ? '' : String(value)}
            onChange={handleInputChange}
            onBlur={handleBlur}
            placeholder="No limit"
            className="w-full min-h-11 min-w-0 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#6D415F] focus:border-transparent text-center"
          />
          <span className="text-sm font-medium text-gray-600 shrink-0">minutes</span>
        </div>

        <button
          type="button"
          onClick={() => stepBy(QUIZ_TIME_STEP_MINUTES)}
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#6D415F]/40 hover:text-[#6D415F] transition-colors shrink-0"
          aria-label={`Increase ${label}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-1">{description}</p>
      {hint ? (
        <p className="text-xs text-[#6D415F] mt-1">{hint}</p>
      ) : null}
    </div>
  );
};

const ToggleRow = ({ label, enabled, onToggle, badge }) => (
  <div className="flex items-center justify-between gap-3 min-h-11">
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm font-medium text-gray-700 break-words">{label}</span>
      {badge && (
        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded shrink-0">
          {badge}
        </span>
      )}
    </div>
    <button
      type="button"
      onClick={onToggle}
      className="min-h-11 min-w-11 inline-flex items-center justify-center shrink-0"
      aria-pressed={enabled}
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? 'bg-[#6D415F]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  </div>
);

export default LaunchQuizModal;
