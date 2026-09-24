import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, X, FileText, Sparkles, Users, CheckCircle, Copy, Check } from 'lucide-react';
import { exitTicketsAPI } from '../services/api';
import { useHostData } from '../contexts/HostDataContext';
import { useAuth } from '../contexts/AuthContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  resolveActiveTeacherSession,
} from '../utils/requireActiveHostSession';
import NoActiveSessionLaunchModal, {
  LaunchRequiresSessionHint,
} from '../components/Host/NoActiveSessionLaunchModal';

const LIKERT_OPTIONS = [
  "Strongly Agree",
  "Agree", 
  "Neutral",
  "Disagree",
  "Strongly Disagree"
];

const questionTypeCatalog = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'likert', label: 'Likert Scale' },
  { value: 'true_false', label: 'True / False' }
];

const emptyQuestion = () => ({
  prompt: '',
  type: 'short_text',
  options: [],
});

const normalizeLoadedQuestion = (question) => {
  const rawType = String(question?.type || 'short_text').toLowerCase().replace(/[\s-]+/g, '_');
  const type =
    rawType === 'shorttext' ? 'short_text'
    : rawType === 'multiplechoice' || rawType === 'mcq' ? 'multiple_choice'
    : rawType === 'truefalse' || rawType === 'true/false' ? 'true_false'
    : rawType;
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => (
      typeof option === 'string' ? option : (option?.text || option?.label || '')
    ))
    : [];

  return {
    prompt: question?.prompt || question?.text || question?.question || '',
    type: questionTypeCatalog.some((item) => item.value === type) ? type : 'short_text',
    options: type === 'multiple_choice' && options.length === 0 ? ['', ''] : options,
  };
};

export default function CreateExitTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editTicketId = searchParams.get('edit');
  const { data: teacherData } = useHostData();
  const { userProfile } = useAuth();
  const { alert } = useHybridAlert();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(editTicketId));
  const [editingTicketId, setEditingTicketId] = useState(editTicketId || null);
  const [showNoSessionModal, setShowNoSessionModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [launchedTicketCode, setLaunchedTicketCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  
  // Form state
  const [ticketForm, setTicketForm] = useState({
    title: '',
    collectAttendance: true,
    questions: [emptyQuestion()]
  });

  useEffect(() => {
    if (!editTicketId) {
      setIsLoadingDraft(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoadingDraft(true);

    (async () => {
      try {
        const response = await exitTicketsAPI.getById(editTicketId);
        const ticket = response.data?.data;
        if (!response.data?.success || !ticket) {
          throw new Error(response.data?.error || 'Exit ticket not found');
        }
        if (cancelled) return;

        const questions = Array.isArray(ticket.questions) && ticket.questions.length > 0
          ? ticket.questions.map(normalizeLoadedQuestion)
          : [emptyQuestion()];

        setEditingTicketId(ticket.id || editTicketId);
        setTicketForm({
          title: ticket.title || '',
          collectAttendance: ticket.collectAttendance !== false,
          questions,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load exit ticket for editing:', error);
        alert.toast.error(error?.response?.data?.error || error.message || 'Failed to load exit ticket');
        navigate('/host/exit-tickets');
      } finally {
        if (!cancelled) setIsLoadingDraft(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editTicketId, alert.toast, navigate]);

  const handleCopyJoinCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setShowCopyNotification(true);
      setTimeout(() => setCopied(false), 2000);
      setTimeout(() => setShowCopyNotification(false), 3000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Navigation
  const goToStep = (step) => {
    if (step >= 1 && step <= 3) {
      setCurrentStep(step);
    }
  };

  const goBack = () => {
    navigate('/host/exit-tickets');
  };

  // Form handlers
  const handleTitleChange = (e) => {
    setTicketForm(prev => ({ ...prev, title: e.target.value }));
  };

  const handleAttendanceToggle = (collectAttendance) => {
    setTicketForm(prev => ({ ...prev, collectAttendance }));
  };

  const handleQuestionChange = (index, field, value) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === index ? { ...q, [field]: value } : q
      )
    }));
  };

  const handleOptionChange = (questionIndex, optionIndex, value) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === questionIndex) {
          return {
            ...q,
            options: q.options.map((opt, j) => 
              j === optionIndex ? value : opt
            )
          };
        }
        return q;
      })
    }));
  };

  const addQuestion = () => {
    setTicketForm(prev => ({
      ...prev,
      questions: [...prev.questions, {
        prompt: '',
        type: 'short_text',
        options: []
      }]
    }));
  };

  const removeQuestion = (index) => {
    if (ticketForm.questions.length > 1) {
      setTicketForm(prev => ({
        ...prev,
        questions: prev.questions.filter((_, i) => i !== index)
      }));
    }
  };

  const addOption = (questionIndex) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === questionIndex) {
          return {
            ...q,
            options: [...q.options, '']
          };
        }
        return q;
      })
    }));
  };

  const removeOption = (questionIndex, optionIndex) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === questionIndex && q.options.length > 1) {
          return {
            ...q,
            options: q.options.filter((_, j) => j !== optionIndex)
          };
        }
        return q;
      })
    }));
  };

  // Validation
  const isFormValid = ticketForm.title.trim() && 
    ticketForm.questions.length > 0 && 
    ticketForm.questions.every(q => {
      const hasPrompt = q.prompt.trim();
      const hasType = q.type;
      const hasValidOptions = q.type === 'multiple_choice' 
        ? q.options.filter(opt => opt.trim()).length >= 2
        : true;
      return hasPrompt && hasType && hasValidOptions;
    });

  // Save handlers
  const handleSaveDraft = async () => {
    // Prevent double submission
    if (isSaving) {
      console.log('Save already in progress, ignoring duplicate call');
      return;
    }
    
    if (!isFormValid) {
      let errorMsg = 'Please fill in all required fields.';
      
      if (!ticketForm.title.trim()) {
        errorMsg = 'Title is required.';
      } else if (ticketForm.questions.length === 0) {
        errorMsg = 'At least one question is required.';
      } else {
        const invalidQuestion = ticketForm.questions.find(q => !q.prompt.trim());
        if (invalidQuestion) {
          errorMsg = 'All questions must have a prompt.';
        } else {
          const invalidMultipleChoice = ticketForm.questions.find(q => 
            q.type === 'multiple_choice' && q.options.filter(opt => opt.trim()).length < 2
          );
          if (invalidMultipleChoice) {
            errorMsg = 'Multiple choice questions must have at least 2 options.';
          }
        }
      }
      
      alert.toast.error(errorMsg);
      return;
    }

    setIsSaving(true);

    try {
      // Log current user ID for debugging
      const userId = sessionStorage.getItem('feedecho-user-id');
      console.log('Creating exit ticket with user ID:', userId);
      
      const ticketData = {
        title: ticketForm.title.trim(),
        collectAttendance: ticketForm.collectAttendance,
        questions: ticketForm.questions.map(q => ({
          prompt: q.prompt.trim(),
          type: q.type,
          options: q.type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : 
                 q.type === 'likert' ? LIKERT_OPTIONS : []
        })),
        status: 'draft'
      };

      console.log('Sending ticket data:', ticketData);

      const response = editingTicketId
        ? await exitTicketsAPI.update(editingTicketId, ticketData)
        : await exitTicketsAPI.create(ticketData);
      if (response.data.success) {
        console.log('Exit ticket created successfully:', response.data);
        alert.toast.success('Exit ticket saved as draft!');
        setTimeout(() => {
          navigate('/host/exit-tickets');
        }, 1500);
      } else {
        alert.toast.error('Failed to save exit ticket: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert.toast.error('Error saving exit ticket: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLaunch = async () => {
    if (!isFormValid) {
      alert.toast.error('Please complete all required fields before launching.');
      return;
    }

    const teacherId = userProfile?.uid;
    const sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherId);
    if (!sessionCheck.ok) {
      setShowNoSessionModal(true);
      return;
    }

    // Single source of truth: the server validates against sessions/{id}.currentActivity
    // (fresh on every request, auto-clears stale flags) when /start is called below.
    setIsSaving(true);

    try {
      // First save as draft
      const ticketData = {
        title: ticketForm.title.trim(),
        collectAttendance: ticketForm.collectAttendance,
        questions: ticketForm.questions.map(q => ({
          prompt: q.prompt.trim(),
          type: q.type,
          options: q.type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : 
                 q.type === 'likert' ? LIKERT_OPTIONS : []
        })),
        status: 'draft'
      };

      const persistResponse = editingTicketId
        ? await exitTicketsAPI.update(editingTicketId, ticketData)
        : await exitTicketsAPI.create(ticketData);
      if (!persistResponse.data.success) {
        alert.toast.error('Failed to create exit ticket: ' + (persistResponse.data.error || 'Unknown error'));
        setIsSaving(false);
        return;
      }

      const ticketId = editingTicketId || persistResponse.data.data.id;

      // Then launch it
      const launchResponse = await exitTicketsAPI.start(ticketId);
      if (launchResponse.data.success) {
        const joinCode = launchResponse.data.data.joinCode;
        setLaunchedTicketCode(joinCode);
        setShowJoinCodeModal(true);
        alert.toast.success('Exit ticket launched successfully!');
      } else {
        alert.toast.error('Failed to launch exit ticket: ' + (launchResponse.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Launch error:', error);
      alert.toast.error('Error launching exit ticket: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingDraft) {
    return (
      <div className="p-4 sm:p-6 overflow-x-hidden max-w-full">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 text-center text-text-light">
          Loading draft…
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 overflow-x-hidden max-w-full">
      {/* Progress Steps */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-6 max-w-full">
        <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                currentStep >= step 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {step}
              </div>
              {step < 3 && (
                <div className={`w-8 sm:w-12 h-1 transition-colors ${
                  currentStep > step ? 'bg-primary' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-4">
          <h3 className="text-lg font-medium text-text">
            {currentStep === 1 && 'Step 1: Enter Title'}
            {currentStep === 2 && 'Step 2: Add Questions'}
            {currentStep === 3 && 'Step 3: Review & Launch'}
          </h3>
        </div>
      </div>

      {/* Step 1: Title */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            <div>
              <label className="block text-lg font-medium text-text mb-2">
                Exit Ticket Title
              </label>
              <input
                type="text"
                value={ticketForm.title}
                onChange={handleTitleChange}
                placeholder="e.g., End of Class Feedback"
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-lg"
              />
            </div>

            <div>
              <label className="flex items-center space-x-3 min-h-11">
                <input
                  type="checkbox"
                  checked={ticketForm.collectAttendance}
                  onChange={(e) => handleAttendanceToggle(e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-primary"
                />
                <span className="text-sm font-medium text-text">
                  Mark attendance when audience members submit
                </span>
              </label>
              <p className="text-xs text-text-light mt-1">
                Automatically track which audience members attended based on submission
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse min-[481px]:flex-row justify-between gap-2 mt-8">
            <button
              onClick={goBack}
              className="min-h-11 px-4 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors w-full min-[481px]:w-auto"
            >
              Cancel
            </button>
            <button
              onClick={() => goToStep(2)}
              disabled={!ticketForm.title.trim()}
              className="min-h-11 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full min-[481px]:w-auto"
            >
              Continue
              <Plus className="w-4 h-4 ml-2 inline" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Questions */}
      {currentStep === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            {ticketForm.questions.map((question, qIndex) => (
              <div key={qIndex} className="border border-gray-200 rounded-xl p-4 sm:p-6 bg-gray-50 max-w-full min-w-0">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h4 className="text-lg font-medium text-text">
                    Question {qIndex + 1}
                  </h4>
                  {ticketForm.questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(qIndex)}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Question Prompt
                    </label>
                    <textarea
                      value={question.prompt}
                      onChange={(e) => handleQuestionChange(qIndex, 'prompt', e.target.value)}
                      placeholder="What would you like to ask?"
                      rows={3}
                      className="w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Question Type
                    </label>
                    <select
                      value={question.type}
                      onChange={(e) => handleQuestionChange(qIndex, 'type', e.target.value)}
                      className="w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {questionTypeCatalog.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dynamic Options */}
                  {(question.type === 'multiple_choice' || question.type === 'likert') && (
                    <div>
                      <label className="block text-sm font-medium text-text mb-2">
                        {question.type === 'multiple_choice' ? 'Answer Options' : 'Likert Scale Options'}
                      </label>
                      
                      {question.type === 'likert' ? (
                        <div className="bg-gray-100 p-4 rounded-lg">
                          {LIKERT_OPTIONS.map((option, i) => (
                            <div key={i} className="text-sm text-gray-700 py-1">
                              {i + 1}. {option}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {question.options.map((option, oIndex) => (
                            <div key={oIndex} className="flex gap-2 min-w-0">
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                                placeholder={`Option ${oIndex + 1}`}
                                className="flex-1 min-w-0 min-h-11 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                              {question.options.length > 1 && (
                                <button
                                  onClick={() => removeOption(qIndex, oIndex)}
                                  className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addOption(qIndex)}
                            className="w-full min-h-11 px-3 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Plus className="w-4 h-4 mr-2 inline" />
                            Add Option
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={addQuestion}
              className="w-full min-h-11 px-4 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              Add Question
            </button>
          </div>

          <div className="flex flex-col-reverse min-[481px]:flex-row justify-between gap-2 mt-8">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => goToStep(1)}
                className="min-h-11 px-4 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors flex-1 min-[481px]:flex-none"
              >
                Back
              </button>
              <button
                onClick={goBack}
                className="min-h-11 px-4 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors flex-1 min-[481px]:flex-none"
              >
                Cancel
              </button>
            </div>
            <button
              onClick={() => goToStep(3)}
              disabled={!isFormValid}
              className="min-h-11 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full min-[481px]:w-auto"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {currentStep === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 max-w-full">
          <div className="space-y-6">
            {/* Review Card */}
            <div className="bg-gray-50 rounded-xl p-4 sm:p-6 max-w-full">
              <h3 className="text-lg font-semibold text-text mb-4">Review Exit Ticket</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-text">Title</h4>
                  <p className="text-text-light">{ticketForm.title || 'Untitled'}</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-text">Questions ({ticketForm.questions.length})</h4>
                  <div className="space-y-2 mt-2">
                    {ticketForm.questions.map((question, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between min-w-0">
                          <span className="text-sm font-medium text-text">
                            Q{index + 1}: {question.type.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                          </span>
                          <span className="text-xs text-text-light break-words min-w-0">
                            {question.prompt || 'No prompt'}
                          </span>
                        </div>
                        {(question.type === 'multiple_choice' || question.type === 'likert') && (
                          <div className="mt-2 text-xs text-text-light">
                            {question.type === 'multiple_choice' 
                              ? `${question.options.filter(opt => opt.trim()).length} options`
                              : `${LIKERT_OPTIONS.length} point scale`
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-text">Settings</h4>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="text-sm text-text-light">
                      {ticketForm.collectAttendance ? 'Attendance tracking enabled' : 'Attendance tracking disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => goToStep(2)}
                    className="min-h-11 px-4 py-2 bg-white font-normal border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center justify-center shadow-none"
                  >
                    Back to Edit
                  </button>
                  <button
                    onClick={goBack}
                    className="min-h-11 px-4 py-2 bg-white font-normal border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center justify-center shadow-none"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="min-h-11 px-4 py-2 bg-white font-normal border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center shadow-none"
                  >
                    {isSaving ? 'Saving...' : 'Save as Draft'}
                  </button>
                </div>
                <button
                  onClick={handleLaunch}
                  disabled={isSaving || !isFormValid}
                  className="min-h-11 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center text-center"
                >
                  {isSaving ? 'Launching...' : 'Launch Exit Ticket'}
                  <Sparkles className="w-4 h-4 ml-2 inline shrink-0" />
                </button>
              </div>
              <div className="flex justify-end">
                <LaunchRequiresSessionHint />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Join Code Modal - matching Space Race/Quiz design */}
      <NoActiveSessionLaunchModal
        isOpen={showNoSessionModal}
        onClose={() => setShowNoSessionModal(false)}
        onSaveAsDraft={handleSaveDraft}
      />

      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Dark overlay background */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Popup modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="p-8 text-center">
              {/* Theme colored circular success icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Title and subtitle */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Exit Ticket Launched</h2>
              <p className="text-sm text-gray-600 mb-8">Share this code with audience</p>

              {/* Audience Access Code box */}
              <div className="mb-8">
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Audience Access Code
                  </label>
                  <div className="text-3xl font-bold text-gray-900 tracking-widest uppercase">
                    {launchedTicketCode}
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                {/* Primary Copy Code button */}
                <button
                  onClick={() => handleCopyJoinCode(launchedTicketCode)}
                  className="w-full min-h-11 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>

                {/* Secondary Close button */}
                <button
                  onClick={() => {
                    setShowJoinCodeModal(false);
                    navigate('/host/exit-tickets');
                  }}
                  className="w-full min-h-11 px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Go to Exit Ticket Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy Success Notification */}
      {showCopyNotification && (
        <div className="fixed top-4 right-4 z-[60] animate-pulse">
          <div className="bg-primary text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Code copied successfully</span>
          </div>
        </div>
      )}
    </div>
  );
}
