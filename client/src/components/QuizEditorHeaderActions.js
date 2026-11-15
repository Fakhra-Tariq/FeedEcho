import React from 'react';
import { Check, Rocket, Save } from 'lucide-react';

const ACTION_BTN =
  'flex items-center justify-center space-x-2 min-h-11 h-11 px-4 sm:px-6 rounded-xl font-medium text-sm sm:text-base shadow-sm transition-all w-full md:w-auto md:min-w-[9.5rem] whitespace-nowrap';

const PLUM_BTN = `${ACTION_BTN} bg-[#6D415F] text-white hover:bg-[#5A344D] hover:shadow-md`;

/**
 * Shared create/edit header actions.
 * create: Save Quiz
 * saved: Launch Quiz + Saved status
 * dirty: disabled Launch Quiz + Save Quiz
 */
export default function QuizEditorHeaderActions({
  mode,
  saving = false,
  onSave,
  onLaunch,
  extra = null,
}) {
  const saveButton = (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className={`${PLUM_BTN} ${saving ? 'opacity-70 cursor-wait' : ''}`}
    >
      <Save className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
      <span>{saving ? 'Saving…' : 'Save Quiz'}</span>
    </button>
  );

  const savedStatus = (
    <div
      role="status"
      aria-live="polite"
      className={`${ACTION_BTN} bg-white text-[#6D415F] border border-[#6D415F]/25 cursor-default pointer-events-none`}
    >
      <Check className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-emerald-700" aria-hidden="true" />
      <span>Saved</span>
    </div>
  );

  const launchEnabled = mode === 'saved';
  const launchButton = (
    <div className="flex flex-col items-stretch flex-1 md:flex-none min-w-0">
      <button
        type="button"
        onClick={launchEnabled ? onLaunch : undefined}
        disabled={!launchEnabled}
        title={launchEnabled ? 'Launch Quiz' : 'Save your changes first'}
        aria-label={launchEnabled ? 'Launch Quiz' : 'Launch Quiz, Save your changes first'}
        aria-disabled={!launchEnabled}
        className={`${PLUM_BTN} ${!launchEnabled ? 'opacity-50 cursor-not-allowed hover:bg-[#6D415F] hover:shadow-sm' : ''}`}
      >
        <Rocket className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
        <span>Launch Quiz</span>
      </button>
    </div>
  );

  return (
    <div className="quiz-editor-header-actions flex flex-col gap-2 w-full md:w-auto md:items-end">
      {extra ? <div className="w-full md:w-auto">{extra}</div> : null}
      <div className="flex flex-row items-stretch gap-3 w-full md:w-auto max-[320px]:flex-col">
        {mode === 'create' ? (
          <div className="flex-1 md:flex-none min-w-0">{saveButton}</div>
        ) : (
          <>
            {launchButton}
            <div className="flex-1 md:flex-none min-w-0">{mode === 'saved' ? savedStatus : saveButton}</div>
          </>
        )}
      </div>
    </div>
  );
}
