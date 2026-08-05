import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Sparkles,
  CalendarClock,
  Users,
  MessageCircle,
  FileText,
  Filter,
  PlayCircle,
  StopCircle,
  Archive,
  Trash2,
  Edit,
  Plus,
  X,
  BarChart3,
  Eye,
  CheckCircle,
  Pause,
  Square,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { exitTicketsAPI, quizzesAPI, spaceRacesAPI } from '../services/api';
import { useHostData } from '../contexts/HostDataContext';
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

const HostExitTickets = () => {
  const { userProfile } = useAuth();
  const { data: teacherData } = useHostData();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [viewingResponses, setViewingResponses] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [showAttendanceNames, setShowAttendanceNames] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingTicketId, setClearingTicketId] = useState(null);

  // Clear responses function
  const clearResponses = async (ticketId) => {
    setClearingTicketId(ticketId);
    setShowClearConfirm(true);
  };

  // Handle confirm clear responses
  const handleConfirmClear = async () => {
    try {
      console.log('Clearing responses for ticket:', clearingTicketId);
      
      // Delete all responses for this ticket
      const response = await exitTicketsAPI.clearResponses(clearingTicketId);
      console.log('Clear responses API response:', response);
      
      if (response.data.success) {
        alert.toast.success('All responses cleared successfully!');
        setViewingResponses(null);
        setResponses([]);
        await fetchExitTickets(); // Refresh tickets to update counts
        
        // Show attendance after clearing responses
        setShowAttendanceNames(true);
      } else {
        alert.toast.error('Failed to clear responses: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Clear responses error:', error);
      alert.toast.error('Error clearing responses: ' + (error.message || 'Unknown error'));
    } finally {
      setShowClearConfirm(false);
      setClearingTicketId(null);
    }
  };

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

  // Fetch exit tickets
  const fetchExitTickets = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = filter !== 'All' ? { status: filter } : {};
      const response = await exitTicketsAPI.getAll(params);
      
      if (response.data.success) {
        setTickets(response.data.data);
        console.log('Fetched exit tickets:', response.data.data);
      }
    } catch (error) {
      console.error('Error fetching exit tickets:', error);
      alert.toast.error('Failed to fetch exit tickets');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchExitTickets();
  }, [fetchExitTickets]);

  // Get counts by status
  const ticketsByStatus = useMemo(() => {
    const map = { draft: 0, active: 0, ended: 0, archived: 0 };
    tickets.forEach((ticket) => {
      if (map[ticket.status] !== undefined) {
        map[ticket.status] += 1;
      }
    });
    return map;
  }, [tickets]);

  // Filter tickets
  const filteredTickets = useMemo(() => {
    if (filter === 'All') return tickets;
    return tickets.filter((ticket) => ticket.status === filter);
  }, [tickets, filter]);

  // Form handlers
  const handleAddQuestion = () => {
    setTicketForm(prev => ({
      ...prev,
      questions: [...prev.questions, {
        prompt: '',
        type: 'short_text',
        options: []
      }]
    }));
  };

  const handleRemoveQuestion = (index) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
  };

  const handleQuestionChange = (index, field, value) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === index) {
          const updated = { ...q, [field]: value };
          
          // Auto-generate likert options
          if (field === 'type' && value === 'likert') {
            updated.options = LIKERT_OPTIONS;
          }
          
          // Clear options if not multiple choice
          if (field === 'type' && value !== 'multiple_choice') {
            updated.options = [];
          }
          
          return updated;
        }
        return q;
      })
    }));
  };

  const handleOptionChange = (questionIndex, optionIndex, value) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === questionIndex) {
          const newOptions = [...q.options];
          newOptions[optionIndex] = value;
          return {
            ...q,
            options: newOptions
          };
        }
        return q;
      })
    }));
  };

  const addOption = (questionIndex) => {
    setTicketForm(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i === questionIndex) {
          return {
            ...q,
            options: [...(q.options || []), '']
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
        if (i === questionIndex) {
          return {
            ...q,
            options: (q.options || []).filter((_, j) => j !== optionIndex)
          };
        }
        return q;
      })
    }));
  };

  // Validate form
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

  // Save as draft
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
        questions: ticketForm.questions.map(q => ({
          prompt: q.prompt.trim(),
          type: q.type,
          options: q.type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : 
                 q.type === 'likert' ? LIKERT_OPTIONS : []
        })),
        status: 'draft'
      };

      console.log('Saving exit ticket draft:', ticketData);

      const response = editingTicket 
        ? await exitTicketsAPI.update(editingTicket.id, ticketData)
        : await exitTicketsAPI.create(ticketData);

      if (response.data.success) {
        alert.toast.success('Exit ticket saved as draft!');
        
        // Reset form
        setTicketForm({
          title: '',
          questions: [{
            prompt: '',
            type: 'short_text',
            options: []
          }]
        });
        setEditingTicket(null);
        
        await fetchExitTickets();
      } else {
        alert.toast.error('Failed to save ticket: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert.toast.error('Error saving ticket: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  // Launch exit ticket
  const handleLaunchTicket = async (ticketId) => {
    const teacherId = userProfile?.uid;
    const sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherId);
    if (!sessionCheck.ok) {
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    // Check if any other quiz is active (Library Quiz or Space Race)
    try {
      const quizzesResponse = await quizzesAPI.getAll({ status: 'launched' });
      const activeQuizzes = quizzesResponse.data?.success ? quizzesResponse.data.data : [];
      
      const spaceRacesResponse = await spaceRacesAPI.getAll({ status: 'active' });
      const activeSpaceRaces = spaceRacesResponse.data?.success ? spaceRacesResponse.data.data : [];
      
      if (activeQuizzes.length > 0 || activeSpaceRaces.length > 0) {
        const activeQuizType = activeQuizzes.length > 0 ? 'Library Quiz' : 'Space Race Quiz';
        alert.toast.error(`A ${activeQuizType} is already active. Please end it first before launching an Exit Ticket.`);
        return;
      }
    } catch (error) {
      console.log('Could not check other quizzes, proceeding with exit ticket launch');
    }

    try {
      console.log('Launching exit ticket:', ticketId);

      const response = await exitTicketsAPI.start(ticketId);
      
      if (response.data.success) {
        alert.toast.success(`Exit ticket launched! Join code: ${response.data.data.joinCode}`);
        await fetchExitTickets();
      } else {
        if (response.data.error === 'Another Exit Ticket is already active') {
          alert.toast.error('Another Exit Ticket is already active. Please end it first.');
        } else {
          alert.toast.error('Failed to launch ticket: ' + (response.data.error || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('Launch error:', error);
      alert.toast.error('Error launching ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  // Pause exit ticket
  const handlePauseTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.pause(ticketId);
      if (response.data.success) {
        alert.toast.success('Exit ticket paused!');
        await fetchExitTickets();
      } else {
        alert.toast.error('Failed to pause ticket: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Pause error:', error);
      alert.toast.error('Error pausing ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  // End exit ticket
  const handleEndTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.end(ticketId);
      if (response.data.success) {
        alert.toast.success('Exit ticket ended!');
        await fetchExitTickets();
      } else {
        alert.toast.error('Failed to end ticket: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('End error:', error);
      alert.toast.error('Error ending ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  // Archive exit ticket
  const handleArchiveTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.update(ticketId, { status: 'archived' });
      if (response.data.success) {
        alert.toast.success('Exit ticket archived!');
        await fetchExitTickets();
      } else {
        alert.toast.error('Failed to archive ticket: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Archive error:', error);
      alert.toast.error('Error archiving ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  // Fetch responses for feedback viewing
  const fetchResponses = async (ticketId) => {
    try {
      setIsLoadingResponses(true);
      const response = await exitTicketsAPI.getResponses(ticketId);
      if (response.data.success) {
        setResponses(response.data.data.responses || []);
        setViewingResponses(ticketId);
        setShowAttendanceNames(false); // Reset when viewing new ticket
      }
    } catch (error) {
      console.error('Error fetching responses:', error);
      alert.toast.error('Failed to fetch responses');
    } finally {
      setIsLoadingResponses(false);
    }
  };

  // Delete exit ticket
  const handleDeleteTicket = async (ticketId) => {
    const confirmed = await alert.modal.confirm('Are you sure you want to delete this exit ticket? This action cannot be undone.');
    if (confirmed) {
      try {
        console.log('Deleting ticket:', ticketId);
        const response = await exitTicketsAPI.delete(ticketId);
        
        if (response.data.success) {
          alert.toast.success('Exit ticket deleted successfully!');
          await fetchExitTickets();
        } else {
          alert.toast.error('Failed to delete ticket: ' + (response.data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert.toast.error('Error deleting ticket: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  // Edit ticket
  const handleEditTicket = (ticket) => {
    if (ticket.status === 'active') {
      // For active tickets, show confirmation before editing
      if (window.confirm('This exit ticket is currently active. Editing will require ending the current session. Do you want to continue?')) {
        // End the ticket first, then edit
        handleEndTicket(ticket.id).then(() => {
          // Wait a moment for the status to update, then edit
          setTimeout(() => {
            setEditingTicket({ ...ticket, status: 'draft' });
            setTicketForm({
              title: ticket.title,
              questions: ticket.questions.map(q => ({
                prompt: q.prompt,
                type: q.type,
                options: q.options || []
              }))
            });
          }, 500);
        });
      }
    } else {
      // For draft and archived tickets, edit normally
      setEditingTicket(ticket);
      setTicketForm({
        title: ticket.title,
        questions: ticket.questions.map(q => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options || []
        }))
      });
    }
  };

  // Get active ticket
  const activeTicket = tickets.find(t => t.status === 'active');

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest">Exit tickets</p>
          <h1 className="mt-2 text-3xl font-semibold text-text">Create and manage exit tickets</h1>
          <p className="mt-2 text-text-light max-w-3xl">
            Design multi-question reflections, track participation in real-time, and review responses.
          </p>
        </div>
        <div className="border border-primary/20 rounded-2xl p-5 bg-primary/10 max-w-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-primary">Multi-Question Support</p>
              <p className="text-xs text-primary/80">
                Create comprehensive exit tickets with multiple question types.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Status Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Draft" value={ticketsByStatus.draft} tone="neutral" icon={FileText} />
        <MetricCard label="Active" value={ticketsByStatus.active} tone="accent" icon={Users} />
        <MetricCard label="Ended" value={ticketsByStatus.ended} tone="secondary" icon={CalendarClock} />
        <MetricCard label="Archived" value={ticketsByStatus.archived} tone="primary" icon={Archive} />
      </section>

      {/* Active Exit Ticket */}
      {activeTicket && (
        <section className="border border-primary/20 rounded-2xl p-6 bg-primary/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest">ACTIVE EXIT TICKET</p>
              <p className="mt-1 text-lg font-semibold text-primary">{activeTicket.title}</p>
              <p className="text-sm text-primary">Join code: <span className="font-mono">{activeTicket.joinCode}</span></p>
              <p className="text-sm text-primary">{activeTicket.responsesCount || 0} responses</p>
            </div>
            <button
              onClick={() => handleEndTicket(activeTicket.id)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              End Session
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Create Exit Ticket Card */}
        <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
          <header className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-text">Create Exit Ticket</h2>
                <p className="text-sm text-text-light">Design a multi-question reflection</p>
              </div>
            </div>
            {editingTicket && (
              <button
                onClick={() => {
                  setEditingTicket(null);
                  setTicketForm({
                    title: '',
                    questions: [{
                      prompt: '',
                      type: 'short_text',
                      options: []
                    }]
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </header>

          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-text-light">
                Exit Ticket Title *
              </label>
              <input
                className="input-field"
                placeholder="e.g. End of Lesson Reflection"
                value={ticketForm.title}
                onChange={(e) => setTicketForm(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            {/* Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-widest text-text-light">
                  Questions * ({ticketForm.questions.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="btn-secondary text-sm px-3 py-1"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Question
                </button>
              </div>

              {ticketForm.questions.map((question, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-text">Question {index + 1}</h4>
                    {ticketForm.questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Prompt */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-text-light">Question Prompt *</label>
                    <textarea
                      className="input-field h-20"
                      placeholder="What is one takeaway from today's lesson?"
                      value={question.prompt}
                      onChange={(e) => handleQuestionChange(index, 'prompt', e.target.value)}
                      required
                    />
                  </div>

                  {/* Question Type */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-text-light">Question Type *</label>
                    <select
                      className="input-field"
                      value={question.type}
                      onChange={(e) => handleQuestionChange(index, 'type', e.target.value)}
                      required
                    >
                      {questionTypeCatalog.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Options for Multiple Choice */}
                  {question.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-text-light">Answer Options</label>
                      {question.options.map((option, optIndex) => (
                        <div key={optIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="input-field flex-1"
                            placeholder={`Option ${optIndex + 1}`}
                            value={option}
                            onChange={(e) => handleOptionChange(index, optIndex, e.target.value)}
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(index, optIndex)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(index)}
                        className="btn-secondary text-sm px-3 py-1"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Option
                      </button>
                    </div>
                  )}

                  {/* Likert Scale Options (Display Only) */}
                  {question.type === 'likert' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-text-light">Likert Scale Options</label>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        {LIKERT_OPTIONS.map((option, i) => (
                          <div key={i} className="text-sm text-gray-600">
                            {i + 1}. {option}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={!isFormValid || isSaving}
                className="btn-primary flex-1"
              >
                {isSaving ? 'Saving...' : (editingTicket ? 'Update Draft' : 'Save as Draft')}
              </button>
              
              {!editingTicket && (
                <button
                  onClick={async () => {
                    if (isFormValid) {
                      // First save as draft, then launch
                      await handleSaveDraft();
                      // Find the newly created ticket and launch it
                      setTimeout(async () => {
                        const updatedTickets = await exitTicketsAPI.getAll({ status: 'draft' });
                        if (updatedTickets.data.success && updatedTickets.data.data.length > 0) {
                          const newestTicket = updatedTickets.data.data[0];
                          await handleLaunchTicket(newestTicket.id);
                        }
                      }, 1000);
                    }
                  }}
                  disabled={!isFormValid || isSaving}
                  className="btn-accent flex-1"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Launch Exit Ticket
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Filters */}
        <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
          <header className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-text">Filter Tickets</h2>
              <p className="text-sm text-text-light">Quickly find the right tickets.</p>
            </div>
          </header>
          <div className="flex flex-wrap gap-2">
            {['All', 'Draft', 'Active', 'Ended', 'Archived'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors',
                  option === filter
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'border-gray-200 text-text-light hover:border-primary/30'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exit Tickets Library */}
      <section className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
        <header className="flex items-center gap-3 mb-4">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-text">Exit Ticket Library</h2>
            <p className="text-sm text-text-light">Manage your exit tickets.</p>
          </div>
        </header>

        {filteredTickets.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-300 rounded-xl">
            <FileText className="w-10 h-10 mx-auto text-gray-300" />
            <p className="mt-4 text-sm font-semibold text-text">No {filter.toLowerCase()} exit tickets</p>
            <p className="mt-1 text-xs text-text-light">Create a new ticket or adjust your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                onEdit={() => handleEditTicket(ticket)}
                onLaunch={() => handleLaunchTicket(ticket.id)}
                onPause={() => handlePauseTicket(ticket.id)}
                onEnd={() => handleEndTicket(ticket.id)}
                onArchive={() => handleArchiveTicket(ticket.id)}
                onDelete={() => handleDeleteTicket(ticket.id)}
                onViewFeedback={() => fetchResponses(ticket.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Feedback Viewing Modal */}
      {viewingResponses && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-text flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Feedback Summary
                  </h2>
                  <p className="text-sm text-text-light mt-1">
                    Anonymous responses from {responses.length} students
                  </p>
                </div>
                <div className="flex gap-2">
                  {responses.length > 0 && (
                    <button
                      onClick={() => clearResponses(viewingResponses)}
                      className="px-3 py-2 bg-primary text-white rounded hover:bg-opacity-80 transition-colors text-sm font-medium"
                    >
                      Clear Responses
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setViewingResponses(null);
                      setResponses([]);
                    }}
                    className="btn-secondary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isLoadingResponses ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-sm text-text-light">Loading feedback...</p>
                </div>
              ) : responses.length === 0 ? (
                <div className="text-center py-10">
                  <MessageCircle className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="mt-4 text-sm font-semibold text-text">No responses yet</p>
                  <p className="mt-1 text-xs text-text-light">Audience members haven't submitted any feedback.</p>
                </div>
              ) : (
                <FeedbackView responses={responses} showAttendanceNames={showAttendanceNames} setShowAttendanceNames={setShowAttendanceNames} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clear Responses Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text mb-2">Clear All Responses?</h3>
                <p className="text-sm text-text-light mb-4">
                  Are you sure you want to clear all responses for this exit ticket? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Clear All Responses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ label, value, tone, icon: Icon }) => {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    accent: 'bg-primary/10 text-primary',
    neutral: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-light">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
        </div>
        <span className={clsx('inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold', tones[tone] || tones.neutral)}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
};

// Ticket Row Component
const TicketRow = ({ ticket, onEdit, onLaunch, onEnd, onPause, onArchive, onDelete, onViewFeedback }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'active': return 'bg-primary/10 text-primary';
      case 'ended': return 'bg-blue-100 text-blue-600';
      case 'archived': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="border border-gray-200 rounded-2xl p-4 bg-white">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-semibold text-text">{ticket.title}</h3>
            <span className={clsx('px-2 py-1 rounded-full text-xs font-semibold', getStatusColor(ticket.status))}>
              {ticket.status}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-text-light">
            <span>{ticket.questions?.length || 0} questions</span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {ticket.responsesCount || 0} responses
            </span>
            {ticket.joinCode && (
              <span className="font-mono">Code: {ticket.joinCode}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(ticket.status === 'ended' || ticket.status === 'archived') && ticket.responsesCount > 0 && (
            <button onClick={onViewFeedback} className="btn-accent text-sm">
              <Eye className="w-4 h-4 mr-1" />
              View Feedback
            </button>
          )}
          
          {ticket.status === 'draft' && (
            <>
              <button onClick={onEdit} className="btn-secondary text-sm">
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </button>
              <button onClick={onLaunch} className="btn-primary text-sm">
                <PlayCircle className="w-4 h-4 mr-1" />
                Launch
              </button>
            </>
          )}
          
          {ticket.status === 'active' && (
            <div className="flex items-center space-x-2">
              <button 
                onClick={onEdit} 
                className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors text-sm font-medium"
                title="Edit Exit Ticket"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button 
                onClick={onPause} 
                className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                title="Pause Exit Ticket"
              >
                <Pause className="w-5 h-5" />
              </button>
              <button 
                onClick={onEnd} 
                className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                title="End Exit Ticket"
              >
                <Square className="w-5 h-5" />
              </button>
            </div>
          )}
          
          {ticket.status === 'ended' && (
            <button onClick={onArchive} className="btn-secondary text-sm">
              <Archive className="w-4 h-4 mr-1" />
              Archive
            </button>
          )}
          
          {(ticket.status === 'draft' || ticket.status === 'archived') && (
            <button onClick={onDelete} className="btn-danger text-sm">
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Feedback View Component
const FeedbackView = ({ responses, showAttendanceNames, setShowAttendanceNames }) => {
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  
  if (!responses || responses.length === 0) return null;
  
  // Get the ticket data from the first response to extract questions
  const firstResponse = responses[0];
  if (!firstResponse || !firstResponse.answers) return null;
  
  const questions = firstResponse.answers.map((_, index) => ({
    index,
    prompt: `Question ${index + 1}`,
    type: 'short_text' // Default, will be updated when we have full ticket data
  }));
  
  return (
    <div className="space-y-6">
      {/* Question Tabs */}
      <div className="flex flex-wrap gap-2 border-b">
        {questions.map((question) => (
          <button
            key={question.index}
            onClick={() => setSelectedQuestion(question.index)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              selectedQuestion === question.index
                ? 'border-primary text-primary'
                : 'border-transparent text-text-light hover:text-text'
            )}
          >
            Q{question.index + 1}
          </button>
        ))}
      </div>
      
      {/* Question Content */}
      <div className="space-y-4">
        <h3 className="font-semibold text-text">
          {questions[selectedQuestion].prompt}
        </h3>
        
        {/* Response Analysis */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Individual Responses */}
            <div>
              <h4 className="font-medium text-text mb-3">Individual Responses</h4>
              {responses.length < 2 ? (
                <div className="text-center py-8">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                    <div className="flex items-center justify-center mb-4">
                      <div className="bg-primary/20 rounded-full p-3">
                        <Users className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-primary mb-2">
                      Audience Privacy Protected
                    </h3>
                    <p className="text-text-light">
                      Responses will appear once at least 2 students submit feedback to ensure privacy.
                    </p>
                    <div className="bg-primary/5 rounded-lg p-3 mt-4">
                      <p className="text-sm text-primary">
                        <span className="font-medium">Current responses:</span> {responses.length} / 2 minimum
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {responses.map((response, responseIndex) => {
                    const answer = response.answers[selectedQuestion]?.answer;
                    if (!answer) return null;
                    
                    return (
                      <div key={responseIndex} className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-sm text-text">{answer}</p>
                        <p className="text-xs text-text-light mt-1">
                          Anonymous Response #{responseIndex + 1}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Summary Stats */}
            <div>
              <h4 className="font-medium text-text mb-3">Summary</h4>
              <div className="space-y-3">
                <div className="bg-white p-3 rounded border border-gray-200">
                  <p className="text-sm font-medium text-text">Total Responses</p>
                  <p className="text-2xl font-bold text-primary">{responses.length}</p>
                </div>
                
                <div className="bg-white p-3 rounded border border-gray-200">
                  <p className="text-sm font-medium text-text">Response Rate</p>
                  <p className="text-lg font-semibold text-primary">100%</p>
                </div>
                
                <div className="bg-white p-3 rounded border border-gray-200">
                  <p className="text-sm font-medium text-text">Attendance Marked</p>
                  <div className="flex items-center gap-2 mt-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm text-text">{responses.length} students</span>
                    <button
                      onClick={() => setShowAttendanceNames(!showAttendanceNames)}
                      className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
                    >
                      {showAttendanceNames ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showAttendanceNames && (
                    <div className="mt-3 space-y-2">
                      {responses.map((response, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-primary">
                              {response.studentName ? response.studentName.charAt(0).toUpperCase() : '?'}
                            </span>
                          </div>
                          <span className="text-sm text-gray-700">
                            {response.studentName || 'Anonymous Audience'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostExitTickets;
