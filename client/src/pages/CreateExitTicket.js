import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  X,
  FileText,
  Sparkles,
  CalendarClock,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import { exitTicketsAPI } from '../services/api';
import { useHostData } from '../contexts/HostDataContext';
import { useAuth } from '../contexts/AuthContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  resolveActiveTeacherSession,
} from '../utils/requireActiveHostSession';

const LIKERT_OPTIONS = [
  "Strongly Agree",
  "Agree", 
  "Neutral",
  "Disagree",
  "Strongly Disagree"
];

const questionTypeCatalog = [
  { value: 'short_text', label: 'Short text' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'likert', label: 'Likert scale' },
  { value: 'true_false', label: 'True / False' }
];

const CreateExitTicket = () => {
  const { data: teacherData } = useHostData();
  const { userProfile } = useAuth();
  const { alert } = useHybridAlert();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [ticketForm, setTicketForm] = useState({
    title: '',
    collectAttendance: true,
    questions: [{
      prompt: '',
      type: 'short_text',
      options: []
    }]
  });

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

      const response = await exitTicketsAPI.create(ticketData);
      if (response.data.success) {
        alert.toast.success('Exit ticket saved as draft!');
        setTimeout(() => {
          navigate('/exit-tickets');
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
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
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

      const createResponse = await exitTicketsAPI.create(ticketData);
      if (!createResponse.data.success) {
        alert.toast.error('Failed to create exit ticket: ' + (createResponse.data.error || 'Unknown error'));
        setIsSaving(false);
        return;
      }

      // Then launch it
      const launchResponse = await exitTicketsAPI.start(createResponse.data.data.id);
      if (launchResponse.data.success) {
        alert.toast.success('Exit ticket launched successfully!');
        setTimeout(() => {
          navigate('/exit-tickets');
        }, 1500);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="px-4 py-2 border border-gray-300 text-text-light rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <h1 className="text-xl font-semibold text-text">Create Exit Ticket</h1>
                  <p className="text-sm text-text-light">Collect anonymous student feedback</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-soft border border-gray-200">
          
          {/* Progress Steps */}
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-center justify-center space-x-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    currentStep >= step 
                      ? 'bg-primary text-white' 
                      : 'bg-gray-200 text-gray-500'
                  )}>
                    {step}
                  </div>
                  {step < 3 && (
                    <div className={clsx(
                      'w-12 h-1 transition-colors',
                      currentStep > step ? 'bg-primary' : 'bg-gray-200'
                    )} />
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
            <div className="px-8 pb-8">
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-lg"
                  />
                </div>

                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={ticketForm.collectAttendance}
                      onChange={(e) => handleAttendanceToggle(e.target.checked)}
                      className="w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <span className="text-sm font-medium text-text">
                      Mark attendance when students submit
                    </span>
                  </label>
                  <p className="text-xs text-text-light mt-1">
                    Automatically track which students attended based on submission
                  </p>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={goBack}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => goToStep(2)}
                  disabled={!ticketForm.title.trim()}
                  className="btn-primary"
                >
                  Continue
                  <Plus className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Questions */}
          {currentStep === 2 && (
            <div className="px-8 pb-8">
              <div className="space-y-6">
                {ticketForm.questions.map((question, qIndex) => (
                  <div key={qIndex} className="border border-gray-200 rounded-xl p-6 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium text-text">
                        Question {qIndex + 1}
                      </h4>
                      {ticketForm.questions.length > 1 && (
                        <button
                          onClick={() => removeQuestion(qIndex)}
                          className="btn-danger text-sm"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text mb-2">
                          Question Type
                        </label>
                        <select
                          value={question.type}
                          onChange={(e) => handleQuestionChange(qIndex, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                                <div key={oIndex} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                                    placeholder={`Option ${oIndex + 1}`}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                  />
                                  {question.options.length > 1 && (
                                    <button
                                      onClick={() => removeOption(qIndex, oIndex)}
                                      className="btn-danger"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={() => addOption(qIndex)}
                                className="btn-secondary w-full"
                              >
                                <Plus className="w-4 h-4 mr-2" />
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
                  className="btn-secondary w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Question
                </button>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => goToStep(1)}
                  className="btn-secondary"
                >
                  Back
                </button>
                <button
                  onClick={() => goToStep(3)}
                  disabled={!isFormValid}
                  className="btn-primary"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="px-8 pb-8">
              <div className="space-y-6">
                {/* Review Card */}
                <div className="bg-gray-50 rounded-xl p-6">
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
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-text">
                                Q{index + 1}: {question.type.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                              </span>
                              <span className="text-xs text-text-light">
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

                <div className="flex justify-between">
                  <button
                    onClick={() => goToStep(2)}
                    className="btn-secondary"
                  >
                    Back to Edit
                  </button>
                  <div className="space-x-3">
                    <button
                      onClick={handleSaveDraft}
                      disabled={isSaving}
                      className="btn-secondary"
                    >
                      {isSaving ? 'Saving...' : 'Save as Draft'}
                    </button>
                    <button
                      onClick={handleLaunch}
                      disabled={isSaving || !isFormValid}
                      className="btn-primary"
                    >
                      {isSaving ? 'Launching...' : 'Launch Exit Ticket'}
                      <Sparkles className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default CreateExitTicket;
