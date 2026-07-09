import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ClipboardList,
  Upload,
  Pencil,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import CopyPasteQuizModal from '../components/CopyPasteQuizModal';
import ImportQuizModal from '../components/ImportQuizModal';
import QuizStructureModal from '../components/QuizStructureModal';

const launchOptions = [
  {
    key: 'ai',
    title: 'AI Quiz Generator',
    description: 'Draft questions from a topic in seconds.',
    icon: Sparkles,
    tone: {
      surface: 'from-primary/14 via-white to-white',
      glow: 'bg-primary/25',
      iconWrap: 'bg-primary/20 ring-1 ring-primary/25',
      icon: 'text-primary',
      cta: 'bg-primary text-white shadow-soft',
      kicker: 'AI assisted',
    },
  },
  {
    key: 'blank',
    title: 'Blank Quiz',
    description: 'Start fresh with your own structure and settings.',
    icon: ClipboardList,
    tone: {
      surface: 'from-primary/14 via-white to-white',
      glow: 'bg-primary/25',
      iconWrap: 'bg-primary/20 ring-1 ring-primary/25',
      icon: 'text-primary',
      cta: 'bg-primary text-white shadow-soft',
      kicker: 'Build from scratch',
    },
  },
  {
    key: 'import',
    title: 'Import Quiz',
    description: 'Upload docs or spreadsheets to convert content.',
    icon: Upload,
    tone: {
      surface: 'from-primary/14 via-white to-white',
      glow: 'bg-primary/25',
      iconWrap: 'bg-primary/20 ring-1 ring-primary/25',
      icon: 'text-primary',
      cta: 'bg-primary text-white shadow-soft',
      kicker: 'Bring your files',
    },
  },
  {
    key: 'paste',
    title: 'Copy-Paste Quiz',
    description: 'Paste raw questions and we\'ll organize them.',
    icon: Pencil,
    tone: {
      surface: 'from-primary/14 via-white to-white',
      glow: 'bg-primary/25',
      iconWrap: 'bg-primary/20 ring-1 ring-primary/25',
      icon: 'text-primary',
      cta: 'bg-primary text-white shadow-soft',
      kicker: 'Quick input',
    },
  },
];

const TeacherLaunch = () => {
  const navigate = useNavigate();

  const [selectedOption, setSelectedOption] = useState(null);
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState(['Multiple Choice']);
  const [showCopyPasteModal, setShowCopyPasteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showQuizStructureModal, setShowQuizStructureModal] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!selectedOption) return;
    if (!panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedOption]);

  const handleQuizStructureSelect = (structure) => {
    if (structure === 'single-type') {
      // Show the original question type modal for single-type quizzes
      setShowQuestionTypeModal(true);
    } else if (structure === 'mixed-type') {
      // Navigate to mixed-type quiz editor
      navigate('/create/mixed-type');
    }
  };

  const handleBlankQuizClick = () => {
    // Show quiz structure selection for Blank Quiz only
    setShowQuizStructureModal(true);
  };

  const handleCopyPasteClick = () => {
    // Show original question type selection for Copy Paste
    setShowCopyPasteModal(true);
  };

  const handleImportClick = () => {
    // Show original question type selection for Import
    setShowImportModal(true);
  };

  const handleAiClick = () => {
    navigate('/create/mixed-type', { state: { openAiPanel: true } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary/5 animate-fade-in">
      <div className="container mx-auto px-4 pt-0 pb-4">
        {/* Centered Quiz Creation Section */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-2 pt-3">
            <div className="inline-flex items-center gap-2 text-primary mb-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Quiz Creation</span>
            </div>
            <h1 className="text-4xl font-bold text-text mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Create a New Quiz
            </h1>
            <p className="text-base text-text-light max-w-2xl mx-auto leading-relaxed">
              Choose how you want to build your assessment. Start from scratch, use AI assistance, or import existing content.
            </p>
          </div>

          <div className="space-y-3">
            {/* Primary Creation Options */}
            <div>
              <h2 className="text-xl font-semibold text-text mb-3 text-center">Create a new quiz</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {launchOptions.slice(0, 2).map((option) => (
                  <LaunchOptionCard
                    key={option.key}
                    icon={option.icon}
                    title={option.title}
                    description={option.description}
                    tone={option.tone}
                    selected={selectedOption === option.key}
                    dimmed={Boolean(selectedOption) && selectedOption !== option.key}
                    onSelect={() =>
                      setSelectedOption((prev) => (prev === option.key ? null : option.key))
                    }
                    onBlankQuizClick={handleBlankQuizClick}
                    onCopyPasteClick={handleCopyPasteClick}
                    onImportClick={handleImportClick}
                    onAiClick={handleAiClick}
                  />
                ))}
              </div>
            </div>

            {/* Secondary Creation Options */}
            <div>
              <h2 className="text-xl font-semibold text-text mb-3 text-center">Other ways to start</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {launchOptions.slice(2, 4).map((option) => (
                  <LaunchOptionCard
                    key={option.key}
                    icon={option.icon}
                    title={option.title}
                    description={option.description}
                    tone={option.tone}
                    selected={selectedOption === option.key}
                    dimmed={Boolean(selectedOption) && selectedOption !== option.key}
                    onSelect={() =>
                      setSelectedOption((prev) => (prev === option.key ? null : option.key))
                    }
                    onBlankQuizClick={handleBlankQuizClick}
                    onCopyPasteClick={handleCopyPasteClick}
                    onImportClick={handleImportClick}
                    onAiClick={handleAiClick}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Quiz Creation Panel */}
          <div
            ref={panelRef}
            className={clsx(
              'rounded-2xl border bg-white shadow-soft overflow-hidden transition-all duration-500',
              selectedOption
                ? 'opacity-100 translate-y-0 scale-100 max-h-[1400px] border-gray-200'
                : 'opacity-0 -translate-y-2 scale-[0.99] max-h-0 border-transparent shadow-none'
            )}
          >
            <div
              className={clsx(
                'p-6 transition-all duration-500',
                selectedOption ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              )}
            >
              {/* Quiz creation forms would go here */}
              <div className="text-center py-8">
                <p className="text-text-light">Select a quiz creation option to get started</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Quiz Structure Modal */}
      <QuizStructureModal
        isOpen={showQuizStructureModal}
        onClose={() => setShowQuizStructureModal(false)}
        onStructureSelect={handleQuizStructureSelect}
      />

      {/* Question Type Modal */}
      <QuestionTypeModal
        isOpen={showQuestionTypeModal}
        onClose={() => setShowQuestionTypeModal(false)}
        onSelect={setSelectedQuestionTypes}
        selectedTypes={selectedQuestionTypes}
      />

      {/* Copy & Paste Quiz Modal */}
      <CopyPasteQuizModal
        isOpen={showCopyPasteModal}
        onClose={() => setShowCopyPasteModal(false)}
        onCreateQuiz={(route) => navigate(route)}
      />

      {/* Import Quiz Modal */}
      <ImportQuizModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onCreateQuiz={(route) => navigate(route)}
      />
    </div>
  );
};


const questionTypes = [
  { key: 'multiple-choice', title: 'Multiple Choice', icon: '🔘' },
  { key: 'true-false', title: 'True / False', icon: '✓' },
  { key: 'short-answer', title: 'Short Answer', icon: '📝' }
];

const QuestionTypeModal = ({ isOpen, onClose, onSelect, selectedTypes }) => {
  const navigate = useNavigate();
  
  if (!isOpen) return null;

  const handleContinue = () => {
    if (selectedTypes.length > 0) {
      if (selectedTypes.includes('Multiple Choice')) {
        navigate('/create/multiple-choice');
      } else if (selectedTypes.includes('True / False')) {
        navigate('/create/true-false');
      } else if (selectedTypes.includes('Short Answer')) {
        navigate('/create/short-answer');
      } else if (selectedTypes.includes('Long Answer')) {
        navigate('/create/long-answer');
      }
    }
    onClose();
  };

  const handleTypeSelect = (type) => {
    // Clear previous selection and select only this type
    onSelect([type.title]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-text mb-2">Choose Question Type</h2>
          <p className="text-sm text-gray-600">Select one question type to continue</p>
        </div>

        {/* Question Type Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {questionTypes.map((type) => {
            const isSelected = selectedTypes.includes(type.title);
            return (
              <button
                key={type.key}
                onClick={() => handleTypeSelect(type)}
                className={clsx(
                  'relative p-6 rounded-2xl border-2 transition-all duration-200',
                  'hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02]',
                  isSelected 
                    ? 'border-primary/40 bg-gradient-to-br from-primary/8 via-primary/5 to-primary/8 shadow-md'
                    : 'border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-50 hover:border-primary/30'
                )}
              >
                <div className="text-center">
                  <div className={clsx(
                    'text-3xl mb-3',
                    isSelected ? 'scale-110' : 'scale-100 transition-transform'
                  )}>
                    {type.icon}
                  </div>
                  <h3 className="font-semibold text-text text-sm">{type.title}</h3>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 text-text-light hover:text-text transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={selectedTypes.length === 0}
            className={clsx(
              'px-8 py-3 rounded-full font-semibold transition-all',
              'bg-[#6D415F] text-white',
              'hover:shadow-lg hover:scale-[1.05]',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100'
            )}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

const LaunchOptionCard = ({ icon: Icon, title, description, tone, selected, dimmed, onSelect, onBlankQuizClick, onCopyPasteClick, onImportClick, onAiClick }) => {
  const isPrimary = title === 'AI Quiz Generator';
  
  return (
  <button
    type="button"
    onClick={() => {
      if (title === 'AI Quiz Generator') {
        onAiClick();
      } else if (title === 'Blank Quiz') {
        onBlankQuizClick();
      } else if (title === 'Copy-Paste Quiz') {
        onCopyPasteClick();
      } else if (title === 'Import Quiz') {
        onImportClick();
      } else {
        onSelect();
      }
    }}
    className={clsx(
      'group relative text-left w-full rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 focus:outline-none overflow-hidden',
      'shadow-md hover:shadow-xl hover:-translate-y-1',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
      selected
        ? 'border-primary/40 ring-2 ring-primary/25 scale-[1.02] shadow-xl'
        : isPrimary
          ? 'border-primary/30 bg-gradient-to-br from-primary/8 via-white to-primary/5 hover:border-primary/40'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
      'active:scale-[0.98] active:translate-y-0',
      'focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      dimmed && 'opacity-50 scale-[0.98]'
    )}
  >
    <div
      className={clsx(
        'pointer-events-none absolute inset-0 opacity-100 transition-opacity duration-300',
        selected ? 'opacity-100' : 'opacity-100'
      )}
    >
      <div className={clsx('absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl', tone?.glow || 'bg-primary/20')} />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-secondary/15 blur-3xl" />
    </div>

    <div
      className={clsx(
        'absolute inset-0 -z-10 bg-gradient-to-br',
        tone?.surface || 'from-white via-white to-white'
      )}
    />

    <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/5" />

    <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-100 bg-gradient-to-br from-white/0 via-white/0 to-primary/5" />

    <div className="flex items-start gap-6">
      <div
        className={clsx(
          'relative h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300',
          tone?.iconWrap || 'bg-primary/12 ring-2 ring-primary/20',
          'shadow-lg shadow-[inset_0_-2px_4px_rgba(0,0,0,0.06)]',
          selected ? 'scale-110 ring-primary/40' : 'group-hover:scale-105 group-hover:ring-primary/30'
        )}
      >
        <Icon
          className={clsx(
            'h-8 w-8 transition-transform duration-300',
            tone?.icon || 'text-primary',
            selected ? 'rotate-0 scale-110' : 'group-hover:-rotate-6 group-hover:scale-105'
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        {tone?.kicker && (
          <p className="text-xs font-bold uppercase tracking-wider text-primary/70 mb-2">{tone.kicker}</p>
        )}
        <h3 className="text-xl font-bold text-text tracking-tight mb-3">{title}</h3>
        <p className="text-base text-text-light leading-relaxed mb-5">{description}</p>
        <div className="inline-flex items-center">
          <span
            className={clsx(
              'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all',
              selected
                ? clsx(tone?.cta || 'bg-primary text-white', 'shadow-lg ring-2 ring-primary/30')
                : clsx(tone?.cta || 'bg-primary text-white', 'shadow-md hover:shadow-lg hover:ring-2 hover:ring-primary/20'),
              'group-hover:scale-105'
            )}
          >
            {selected ? 'Selected' : 'Create'}
            <ArrowRight
              className={clsx(
                'h-4 w-4 transition-all',
                selected ? 'rotate-90 translate-x-1' : 'opacity-90 group-hover:translate-x-1'
              )}
            />
          </span>
        </div>
      </div>
    </div>
  </button>
  );
};

export default TeacherLaunch;
