import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHybridAlert } from '../contexts/HybridAlertContext';
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
  BarChart3,
  Eye,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { exitTicketsAPI } from '../services/api';

const HostExitTickets = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const { alert } = useHybridAlert();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [viewingResponses, setViewingResponses] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [showAttendanceNames, setShowAttendanceNames] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingTicketId, setClearingTicketId] = useState(null);

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
      setErrorMessage('Failed to fetch exit tickets');
      setTimeout(() => setErrorMessage(''), 5000);
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
      setErrorMessage('Failed to fetch responses');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setIsLoadingResponses(false);
    }
  };

  // Clear responses function
  const clearResponses = async (ticketId) => {
    setClearingTicketId(ticketId);
    setShowClearConfirm(true);
  };

  // Handle confirm clear responses
  const handleConfirmClear = async () => {
    try {
      // Delete all responses for this ticket
      const response = await exitTicketsAPI.clearResponses(clearingTicketId);
      
      if (response.data.success) {
        setSuccessMessage('All responses cleared successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        setViewingResponses(null);
        setResponses([]);
        await fetchExitTickets(); // Refresh tickets to update counts
        
        // Show attendance after clearing responses
        setShowAttendanceNames(true);
      } else {
        setErrorMessage('Failed to clear responses: ' + (response.data.error || 'Unknown error'));
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      console.error('Clear responses error:', error);
      setErrorMessage('Error clearing responses: ' + (error.message || 'Unknown error'));
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setShowClearConfirm(false);
      setClearingTicketId(null);
    }
  };

  // Ticket actions
  const handleEndTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.end(ticketId);
      if (response.data.success) {
        setSuccessMessage('Exit ticket ended!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await fetchExitTickets();
      } else {
        setErrorMessage('Failed to end ticket: ' + (response.data.error || 'Unknown error'));
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      console.error('End error:', error);
      setErrorMessage('Error ending ticket: ' + (error.response?.data?.error || error.message));
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleArchiveTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.update(ticketId, { status: 'archived' });
      if (response.data.success) {
        setSuccessMessage('Exit ticket archived!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await fetchExitTickets();
      } else {
        setErrorMessage('Failed to archive ticket: ' + (response.data.error || 'Unknown error'));
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      console.error('Archive error:', error);
      setErrorMessage('Error archiving ticket: ' + (error.response?.data?.error || error.message));
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    const confirmed = await alert.modal.confirm('Are you sure you want to delete this exit ticket? This action cannot be undone.');
    if (confirmed) {
      try {
        console.log('Deleting ticket:', ticketId);
        const response = await exitTicketsAPI.delete(ticketId);
        
        if (response.data.success) {
          setSuccessMessage('Exit ticket deleted successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
          await fetchExitTickets();
        } else {
          setErrorMessage('Failed to delete ticket: ' + (response.data.error || 'Unknown error'));
          setTimeout(() => setErrorMessage(''), 5000);
        }
      } catch (error) {
        console.error('Delete error:', error);
        setErrorMessage('Error deleting ticket: ' + (error.response?.data?.error || error.message));
        setTimeout(() => setErrorMessage(''), 5000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-xl font-semibold text-text">Exit Ticket Dashboard</h1>
                <p className="text-sm text-text-light">Manage your classroom feedback collection</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Stats Cards */}
          <div className="lg:col-span-4 space-y-4">
            <MetricCard
              label="Draft"
              value={ticketsByStatus.draft}
              tone="primary"
              icon={FileText}
            />
            <MetricCard
              label="Active"
              value={ticketsByStatus.active}
              tone="secondary"
              icon={PlayCircle}
            />
            <MetricCard
              label="Ended"
              value={ticketsByStatus.ended}
              tone="accent"
              icon={StopCircle}
            />
            <MetricCard
              label="Archived"
              value={ticketsByStatus.archived}
              tone="neutral"
              icon={Archive}
            />
          </div>

          {/* Create Exit Ticket Card */}
          <div className="lg:col-span-4">
            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
              <header className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold text-text">Create Exit Ticket</h2>
                    <p className="text-sm text-text-light">Design a multi-question reflection</p>
                  </div>
                </div>
              </header>

              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-text mb-2">
                  Ready to create your exit ticket?
                </h3>
                <p className="text-text-light mb-6 max-w-md mx-auto">
                  Collect anonymous student feedback and automatically track attendance. 
                  Design multi-question exit tickets with different question types including short text, multiple choice, Likert scales, and true/false questions.
                </p>
                
                <button
                  onClick={() => navigate('/exit-tickets/create')}
                  className="btn-primary text-lg px-8 py-3"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Exit Ticket
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="lg:col-span-4">
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
          <div className="lg:col-span-4">
            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-soft">
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
                      onViewFeedback={() => fetchResponses(ticket.id)}
                      onEnd={() => handleEndTicket(ticket.id)}
                      onArchive={() => handleArchiveTicket(ticket.id)}
                      onDelete={() => handleDeleteTicket(ticket.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

      {/* Messages */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <CalendarClock className="w-5 h-5 mr-2" />
            {successMessage}
          </div>
        </div>
      )}
      
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <X className="w-5 h-5 mr-2" />
            {errorMessage}
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
const TicketRow = ({ ticket, onViewFeedback, onEnd, onArchive, onDelete }) => {
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
          
          {ticket.status === 'active' && (
            <button onClick={onEnd} className="btn-secondary text-sm">
              <StopCircle className="w-4 h-4 mr-1" />
              End
            </button>
          )}
          
          {ticket.status === 'ended' && (
            <button onClick={onArchive} className="btn-secondary text-sm">
              <Archive className="w-4 h-4 mr-1" />
              Archive
            </button>
          )}
          
          {ticket.status === 'draft' && (
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
  
  if (responses.length === 0) return null;
  
  // Get ticket data from first response to extract questions
  const firstResponse = responses[0];
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
