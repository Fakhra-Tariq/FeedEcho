import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Square, Eye, Users, Clock, FileText, X, BarChart3, CheckCircle, Copy, RotateCcw, Trash2, Archive, RotateCcw as Restore, Loader2, Check } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { exitTicketsAPI, quizzesAPI, spaceRacesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useRtdbList, useRtdbValue } from '../hooks/useRtdb';
import { useTeacherData } from '../contexts/TeacherDataContext';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  resolveActiveTeacherSession,
} from '../utils/requireActiveTeacherSession';

function questionsForTicket(questionsTree, ticketId, fallback = []) {
  const raw = questionsTree?.[ticketId];
  if (!raw) return fallback;
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => raw[k]);
}

function attachQuestionsToTickets(ticketList, questionsTree, existingById = {}) {
  return ticketList.map((t) => {
    // First try questionsTree, then fallback to existing data, then ticket's own questions
    let questions = questionsForTicket(
      questionsTree,
      t.id,
      existingById[t.id]?.questions || t.questions || []
    );
    
    // If still no questions and ticket has a questions array, use it directly
    if ((!questions || questions.length === 0) && t.questions && Array.isArray(t.questions)) {
      questions = t.questions;
    }
    
    return {
      ...t,
      questions,
    };
  });
}

function ticketListSignature(list) {
  return (list || [])
    .map((t) => `${t.id}:${t.status}:${t.responsesCount ?? 0}:${t.updatedAt || ''}`)
    .sort()
    .join('|');
}

export default function ExitTicketDashboard() {
  const navigate = useNavigate();
  const { alert } = useHybridAlert();
  const { user, userProfile } = useAuth();
  const uid = userProfile?.uid || user?.uid;
  const uidFallback = sessionStorage.getItem('feedecho-user-id');
  const { data: teacherData } = useTeacherData();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const fallbackRequestedRef = useRef(false);
  const rtdbSignatureRef = useRef('');
  const [viewingResponses, setViewingResponses] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [launchedTicketCode, setLaunchedTicketCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [showAttendanceNames, setShowAttendanceNames] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingTicketId, setClearingTicketId] = useState(null);

  const { list: liveTickets, loading: liveTicketsLoading, error: liveTicketsError } = useRtdbList(
    uid ? 'exit_tickets' : null,
    {
      enabled: Boolean(uid),
      filter: (t) =>
        t.createdBy === uid || (uidFallback && t.createdBy === uidFallback),
      sort: (a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
    }
  );

  const { value: questionsTree } = useRtdbValue(
    uid ? 'exit_questions' : null,
    { enabled: Boolean(uid) }
  );

  const upsertTicket = useCallback((updated) => {
    if (!updated?.id) return;
    setTickets((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      let next;
      if (idx === -1) {
        next = [updated, ...prev].sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
        );
      } else {
        next = [...prev];
        next[idx] = { ...next[idx], ...updated };
      }
      rtdbSignatureRef.current = ticketListSignature(next);
      return next;
    });
  }, []);

  const removeTicket = useCallback((ticketId) => {
    setTickets((prev) => {
      const next = prev.filter((t) => t.id !== ticketId);
      rtdbSignatureRef.current = ticketListSignature(next);
      return next;
    });
  }, []);

  const fetchTicketsFromApi = useCallback(async () => {
    const res = await exitTicketsAPI.getAll();
    if (res.data?.success) {
      const list = (res.data.data || []).slice();
      list.sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
      );
      
      // Fetch questions for each ticket individually if not present
      const withQuestions = await Promise.all(list.map(async (ticket) => {
        if (ticket.questions && ticket.questions.length > 0) {
          return ticket;
        }
        // Try to get questions from questionsTree first
        const treeQuestions = questionsForTicket(questionsTree, ticket.id);
        if (treeQuestions.length > 0) {
          return { ...ticket, questions: treeQuestions };
        }
        // If no questions in tree, try fetching from API
        try {
          const detailRes = await exitTicketsAPI.getById(ticket.id);
          if (detailRes.data?.success && detailRes.data.data?.questions) {
            return { ...ticket, questions: detailRes.data.data.questions };
          }
        } catch (error) {
          console.error(`Failed to fetch questions for ticket ${ticket.id}:`, error);
        }
        return ticket;
      }));
      
      setTickets(withQuestions);
    }
    return res;
  }, [questionsTree]);

  // Keep UI in sync with Firebase RTDB (status, responsesCount, deletions)
  useEffect(() => {
    if (!uid || liveTicketsLoading) return;
    if (liveTickets.length === 0) return;

    const signature = ticketListSignature(liveTickets);
    if (signature === rtdbSignatureRef.current) return;
    rtdbSignatureRef.current = signature;

    setTickets((prev) => {
      const prevById = Object.fromEntries(prev.map((t) => [t.id, t]));
      const merged = attachQuestionsToTickets(liveTickets, questionsTree, prevById).map((rtdbTicket) => {
        const local = prevById[rtdbTicket.id];
        if (!local) return rtdbTicket;
        const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
        const rtdbTime = new Date(rtdbTicket.updatedAt || rtdbTicket.createdAt || 0).getTime();
        if (localTime > rtdbTime) {
          return { ...local, questions: rtdbTicket.questions?.length ? rtdbTicket.questions : local.questions };
        }
        return rtdbTicket;
      });
      return merged.sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
      );
    });
    setIsLoading(false);
  }, [uid, liveTickets, liveTicketsLoading, questionsTree]);

  // Refresh question counts when exit_questions tree updates
  useEffect(() => {
    if (!questionsTree) return;
    setTickets((prev) => {
      if (prev.length === 0) return prev;
      const prevById = Object.fromEntries(prev.map((t) => [t.id, t]));
      const withQuestions = attachQuestionsToTickets(prev, questionsTree, prevById);
      return withQuestions;
    });
  }, [questionsTree]);

  useEffect(() => {
    fallbackRequestedRef.current = false;
    rtdbSignatureRef.current = '';
  }, [uid]);

  useEffect(() => {
    if (!liveTicketsError) return;
    console.error('Live exit tickets listener error:', liveTicketsError);
  }, [liveTicketsError]);

  // API fallback when RTDB listener returns empty (e.g. before auth is ready)
  useEffect(() => {
    if (!uid) {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    if (liveTicketsLoading) return;
    if (liveTickets.length > 0) {
      setIsLoading(false);
      return;
    }
    if (fallbackRequestedRef.current) return;
    fallbackRequestedRef.current = true;
    (async () => {
      try {
        await fetchTicketsFromApi();
      } catch (e) {
        console.error('Exit ticket fallback load failed:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [uid, liveTicketsLoading, liveTickets, fetchTicketsFromApi]);

  const isLoadingView =
    isLoading && tickets.length === 0;

  const { list: liveResponses, loading: liveResponsesLoading, error: liveResponsesError } = useRtdbList(
    viewingResponses ? `exit_responses/${viewingResponses}` : null,
    {
      enabled: Boolean(viewingResponses),
      sort: (a, b) => String(a.submittedAt || a.createdAt || '').localeCompare(String(b.submittedAt || b.createdAt || '')),
    }
  );

  useEffect(() => {
    if (!viewingResponses) {
      setResponses([]);
      setIsLoadingResponses(false);
      return;
    }
    setIsLoadingResponses(liveResponsesLoading);
    setResponses(liveResponses);
  }, [viewingResponses, liveResponsesLoading, liveResponses]);

  useEffect(() => {
    if (!liveResponsesError) return;
    console.error('Live exit responses listener error:', liveResponsesError);
  }, [liveResponsesError]);

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
        alert.toast.success('All responses cleared successfully!');
        setViewingResponses(null);
        setResponses([]);
        // Tickets update in realtime via RTDB listener
        
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

  // Get counts by status
  const ticketsByStatus = {
    draft: tickets.filter(t => t.status === 'draft').length,
    active: tickets.filter(t => t.status === 'active').length,
    ended: tickets.filter(t => t.status === 'ended').length,
    archived: tickets.filter(t => t.status === 'archived').length,
  };

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (filter === 'all') return true;
      return ticket.status === filter;
    });
  }, [tickets, filter]);

  // Fetch responses for feedback viewing
  const fetchResponses = async (ticketId) => {
    setViewingResponses(ticketId);
    setShowAttendanceNames(false); // Reset when viewing new ticket
  };

  const handleEndTicket = async (ticketId) => {
    try {
      const response = await exitTicketsAPI.end(ticketId);
      if (!response.data?.success) {
        alert.toast.error('Failed to end ticket: ' + (response.data?.error || 'Unknown error'));
        return;
      }
      if (response.data.data) upsertTicket(response.data.data);
      alert.toast.success('Exit ticket ended successfully!');
    } catch (error) {
      console.error('End error:', error);
      alert.toast.error('Error ending ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleResumeTicket = async (ticketId) => {
    try {
      // Check if any other exit ticket is already active (not counting the current paused one)
      const otherActiveTickets = tickets.filter(t => 
        t.status === 'active' && t.id !== ticketId
      );
      
      if (otherActiveTickets.length > 0) {
        alert.toast.error('Another Exit Ticket is already active. Please end it first.');
        return;
      }

      // Check if any other quiz is active (Library Quiz or Space Race)
      try {
        // Check for active Library Quizzes
        const quizzesResponse = await quizzesAPI.getAll({ status: 'launched' });
        const activeQuizzes = quizzesResponse.data?.success ? quizzesResponse.data.data : [];
        
        // Check for active Space Races
        const spaceRacesResponse = await spaceRacesAPI.getAll({ status: 'active' });
        const activeSpaceRaces = spaceRacesResponse.data?.success ? spaceRacesResponse.data.data : [];
        
        if (activeQuizzes.length > 0 || activeSpaceRaces.length > 0) {
          const activeQuizType = activeQuizzes.length > 0 ? 'Library Quiz' : 'Space Race Quiz';
          alert.toast.error(`A ${activeQuizType} is already active. Only one quiz can be active at a time. Please end the ${activeQuizType} first.`);
          return;
        }
      } catch (error) {
        console.log('Could not check other quizzes, proceeding with resume');
      }

      const response = await exitTicketsAPI.update(ticketId, { status: 'active' });
      if (!response.data?.success) {
        alert.toast.error('Failed to resume ticket: ' + (response.data?.error || 'Unknown error'));
        return;
      }
      if (response.data.data) upsertTicket(response.data.data);
      alert.toast.success('Exit ticket resumed successfully!');
    } catch (error) {
      console.error('Resume error:', error);
      alert.toast.error('Error resuming ticket: ' + (error.response?.data?.error || error.message));
    }
  };

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

  const handleArchiveTicket = async (ticketId) => {
    const confirmMessage = 'Are you sure you want to archive this exit ticket? It will be moved to the Archived section and can be restored later.';
    const confirmed = await alert.modal.confirm(confirmMessage);
    
    if (confirmed) {
      try {
        const response = await exitTicketsAPI.update(ticketId, { status: 'archived' });
        if (!response.data?.success) {
          alert.toast.error('Failed to archive ticket: ' + (response.data?.error || 'Unknown error'));
          return;
        }
        if (response.data.data) upsertTicket(response.data.data);
        alert.toast.success('Exit ticket archived successfully!');
      } catch (error) {
        console.error('Archive error:', error);
        alert.toast.error('Error archiving ticket: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const handleRestoreTicket = async (ticketId) => {
    const ticket = tickets.find(t => t.id === ticketId);
    const previousStatus = ticket?.previousStatus || 'ended'; // Fallback to 'ended' if no previousStatus
    const confirmMessage = 'Are you sure you want to restore this exit ticket? It will be moved back to its previous section.';
    const confirmed = await alert.modal.confirm(confirmMessage);
    
    if (confirmed) {
      try {
        const response = await exitTicketsAPI.update(ticketId, { status: previousStatus });
        if (!response.data?.success) {
          alert.toast.error('Failed to restore ticket: ' + (response.data?.error || 'Unknown error'));
          return;
        }
        if (response.data.data) upsertTicket(response.data.data);
        alert.toast.success('Exit ticket restored successfully!');
      } catch (error) {
        console.error('Restore error:', error);
        alert.toast.error('Error restoring ticket: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    // Find the ticket to determine its current status
    const ticket = tickets.find(t => t.id === ticketId);
    const isArchived = ticket?.status === 'archived';
    
    const confirmMessage = isArchived 
      ? 'Are you sure you want to permanently delete this archived exit ticket? This action cannot be undone.'
      : 'Are you sure you want to delete this exit ticket? It will be moved to archived and can be restored later.';
    
    const confirmed = await alert.modal.confirm(confirmMessage);
    if (confirmed) {
      try {
        if (isArchived) {
          // Permanent deletion for archived tickets
          const response = await exitTicketsAPI.delete(ticketId);

          if (!response.data?.success) {
            alert.toast.error('Failed to delete ticket: ' + (response.data?.error || 'Unknown error'));
            return;
          }
          removeTicket(ticketId);
          alert.toast.success('Exit ticket permanently deleted!');
        } else {
          const response = await exitTicketsAPI.update(ticketId, { status: 'archived' });

          if (!response.data?.success) {
            alert.toast.error('Failed to archive ticket: ' + (response.data?.error || 'Unknown error'));
            return;
          }
          if (response.data.data) upsertTicket(response.data.data);
          alert.toast.success('Exit ticket moved to archived!');
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert.toast.error('Error deleting ticket: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const handleLaunchTicket = async (ticketId) => {
    const teacherId = uid;
    const sessionCheck = await resolveActiveTeacherSession(teacherData.activeSession, teacherId);
    if (!sessionCheck.ok) {
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    try {
      // Check if any other exit ticket is already active
      const activeExitTicket = tickets.find(t => t.status === 'active');
      if (activeExitTicket) {
        alert.toast.error('Another Exit Ticket is already active. Please end it first.');
        return;
      }

      // Check if any other quiz is active (Library Quiz or Space Race)
      // We'll need to check this via API calls
      try {
        // Check for active Library Quizzes
        const quizzesResponse = await quizzesAPI.getAll({ status: 'launched' });
        const activeQuizzes = quizzesResponse.data?.success ? quizzesResponse.data.data : [];
        
        // Check for active Space Races
        const spaceRacesResponse = await spaceRacesAPI.getAll({ status: 'active' });
        const activeSpaceRaces = spaceRacesResponse.data?.success ? spaceRacesResponse.data.data : [];
        
        if (activeQuizzes.length > 0 || activeSpaceRaces.length > 0) {
          const activeQuizType = activeQuizzes.length > 0 ? 'Library Quiz' : 'Space Race Quiz';
          alert.toast.error(`A ${activeQuizType} is already active. Only one quiz can be active at a time. Please end the ${activeQuizType} first.`);
          return;
        }
      } catch (error) {
        console.log('Could not check other quizzes, proceeding with exit ticket launch');
      }

      const response = await exitTicketsAPI.start(ticketId);

      if (!response.data?.success || !response.data?.data) {
        alert.toast.error(response.data?.error || 'Failed to launch ticket.');
        return;
      }
      upsertTicket(response.data.data);
      alert.toast.success(`Exit ticket launched! Join code: ${response.data.data.joinCode}`);
      setLaunchedTicketCode(response.data.data.joinCode);
      setShowJoinCodeModal(true);
    } catch (error) {
      console.error('Launch error:', error);
      alert.toast.error(error.response?.data?.error || error.message || 'Error launching ticket');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-primary/10 text-primary';
      case 'active': return 'bg-gray-100 text-gray-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'ended': return 'bg-primary/10 text-primary';
      case 'archived': return 'bg-primary/10 text-primary';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'draft': return 'Draft';
      case 'active': return 'Active';
      case 'paused': return 'Paused';
      case 'ended': return 'Ended';
      case 'archived': return 'Archived';
      default: return status;
    }
  };

  const activeTicket = tickets.find(t => t.status === 'active');
  
  // Ensure active ticket has questions from questionsTree
  useEffect(() => {
    if (activeTicket && questionsTree && (!activeTicket.questions || activeTicket.questions.length === 0)) {
      const questions = questionsForTicket(questionsTree, activeTicket.id);
      if (questions.length > 0) {
        setTickets(prev => prev.map(t => 
          t.id === activeTicket.id ? { ...t, questions } : t
        ));
      }
    }
  }, [activeTicket?.id, questionsTree]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Exit Ticket</h1>
          <p className="text-text-light mt-1">Collect anonymous student feedback and track attendance</p>
        </div>
        <button
          onClick={() => navigate('/teacher/exit-tickets/create')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Exit Ticket
        </button>
      </div>

      {/* Exit Ticket Summary Card - Always Visible */}
      <div className="bg-primary rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {activeTicket ? 'Exit Ticket in Progress' : 'No Exit Ticket Active'}
              </h3>
              <p className="text-white/80">
                {activeTicket ? activeTicket.title : 'Create or launch an exit ticket to begin'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {activeTicket && (
              <>
                <button
                  onClick={() => fetchResponses(activeTicket.id)}
                  className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                  title="View Responses"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleEndTicket(activeTicket.id)}
                  className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                  title="End Exit Ticket"
                >
                  <Square className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-white/80 text-sm">Questions</p>
            <p className="text-2xl font-bold">{activeTicket?.questions?.length || 0}</p>
          </div>
          <div>
            <p className="text-white/80 text-sm">Responses</p>
            <p className="text-2xl font-bold">{activeTicket?.responsesCount || 0}</p>
          </div>
          <div>
            <p className="text-white/80 text-sm">Attendance</p>
            <p className="text-2xl font-bold">{activeTicket?.responsesCount || 0} students</p>
          </div>
          <div>
            <p className="text-white/80 text-sm">Join Code</p>
            <p className="text-2xl font-bold font-mono">{activeTicket?.joinCode || '----'}</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-light text-sm">Draft</p>
              <p className="text-2xl font-bold text-text">{ticketsByStatus.draft}</p>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <FileText className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-light text-sm">Active</p>
              <p className="text-2xl font-bold text-text">{ticketsByStatus.active}</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Play className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-light text-sm">Ended</p>
              <p className="text-2xl font-bold text-text">{ticketsByStatus.ended}</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Square className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-light text-sm">Archived</p>
              <p className="text-2xl font-bold text-text">{ticketsByStatus.archived}</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-4 border-b border-gray-200">
        {['all', 'draft', 'active', 'ended', 'archived'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`pb-3 px-1 capitalize transition-colors border-b-2 ${
              filter === status
                ? 'border-primary text-primary'
                : 'border-transparent text-text-light hover:text-text'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Exit Tickets List */}
      <div className="grid gap-4">
        {isLoadingView ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-text-light">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            Loading exit tickets…
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-text mb-2">No {filter === 'all' ? 'exit tickets' : `${filter} exit tickets`}</h3>
            <p className="text-text-light mb-6">Create your first exit ticket to start collecting student feedback</p>
            <button
              onClick={() => navigate('/teacher/exit-tickets/create')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Exit Ticket
            </button>
          </div>
        ) : (
          filteredTickets.map(ticket => (
            <div key={ticket.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-text">{ticket.title}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(ticket.status)}`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                  <p className="text-text-light mb-4">
                    {ticket.questions?.length || 0} questions • {ticket.responsesCount || 0} responses
                  </p>
                  <div className="flex items-center space-x-6 text-sm text-text-light">
                    <div className="flex items-center space-x-1">
                      <FileText className="w-4 h-4" />
                      <span>{ticket.questions?.length || 0} questions</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{ticket.responsesCount || 0} responses</span>
                    </div>
                    {ticket.joinCode && (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span className="font-mono">Code: {ticket.joinCode}</span>
                      </div>
                    )}
                  </div>

                  {/* Show join code for active tickets */}
                  {ticket.status === 'active' && ticket.joinCode && (
                    <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-primary/5 text-primary text-xs font-medium">
                      Join Code: <span className="ml-1 font-mono tracking-widest">{ticket.joinCode}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {ticket.status === 'active' && (
                    <button
                      onClick={() => handleEndTicket(ticket.id)}
                      className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                      title="End Exit Ticket"
                    >
                      <Square className="w-4 h-4 mr-1" />
                      End
                    </button>
                  )}

                  {ticket.status === 'paused' && (
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => handleResumeTicket(ticket.id)}
                        className="p-2 text-green-600 rounded-lg border border-green-300 hover:bg-green-100 transition-colors text-sm flex items-center"
                        title="Resume Exit Ticket"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Resume
                      </button>
                      <button
                        onClick={() => handleEndTicket(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="End Exit Ticket"
                      >
                        <Square className="w-4 h-4 mr-1" />
                        End
                      </button>
                    </div>
                  )}
                  
                  {ticket.status === 'ended' && (
                    <>
                      <button
                        onClick={() => fetchResponses(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="View Responses"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Responses
                      </button>
                      <button
                        onClick={() => handleArchiveTicket(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="Archive Exit Ticket"
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        Archive
                      </button>
                    </>
                  )}
                  
                  {ticket.status === 'draft' && (
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => navigate(`/teacher/exit-tickets/create?edit=${ticket.id}`)}
                        className="p-2 text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors text-sm flex items-center"
                        title="Edit Exit Ticket"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleLaunchTicket(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="Launch Exit Ticket"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Launch
                      </button>
                      <button
                        onClick={() => handleArchiveTicket(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="Archive Exit Ticket"
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        Archive
                      </button>
                    </div>
                  )}
                  
                  {ticket.status === 'archived' && (
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => handleRestoreTicket(ticket.id)}
                        className="p-2 text-primary rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-sm flex items-center"
                        title="Restore Exit Ticket"
                      >
                        <Restore className="w-4 h-4 mr-1" />
                        Restore
                      </button>
                      <button
                        onClick={() => handleDeleteTicket(ticket.id)}
                        className="p-2 text-red-600 rounded-lg border border-red-300 hover:bg-red-100 transition-colors text-sm flex items-center"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Permanently
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Feedback Viewing Modal */}
      {viewingResponses && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
                  <FileText className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="mt-4 text-sm font-semibold text-text">No responses yet</p>
                  <p className="mt-1 text-xs text-text-light">Students haven't submitted any feedback.</p>
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

      {/* Join Code Modal - matching Space Race/Quiz design */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Dark overlay background */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Popup modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-8 text-center">
              {/* Theme colored circular success icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Title and subtitle */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Exit Ticket Launched</h2>
              <p className="text-sm text-gray-600 mb-8">Share this code with students</p>

              {/* Student Access Code box */}
              <div className="mb-8">
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Student Access Code
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>

                {/* Secondary Close button */}
                <button
                  onClick={() => setShowJoinCodeModal(false)}
                  className="w-full px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Close
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

// Feedback View Component
const FeedbackView = ({ responses, showAttendanceNames, setShowAttendanceNames }) => {
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  
  if (!responses || responses.length === 0) return null;
  
  // Get questions from first response
  const firstResponse = responses[0];
  if (!firstResponse || !firstResponse.answers) return null;
  
  const questions = firstResponse.answers.map((_, index) => ({
    index,
    prompt: `Question ${index + 1}`,
    type: 'short_text'
  }));
  
  return (
    <div className="space-y-6">
      {/* Question Tabs */}
      <div className="flex flex-wrap gap-2 border-b">
        {questions.map((question) => (
          <button
            key={question.index}
            onClick={() => setSelectedQuestion(question.index)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedQuestion === question.index
                ? 'border-primary text-primary'
                : 'border-transparent text-text-light hover:text-text'
            }`}
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
                      Student Privacy Protected
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
                      {[...responses].sort((a, b) => 
                        (a.studentName || '').localeCompare(b.studentName || '')
                      ).map((response, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-primary">
                              {response.studentName ? response.studentName.charAt(0).toUpperCase() : '?'}
                            </span>
                          </div>
                          <span className="text-sm text-gray-700">
                            {response.studentName || 'Anonymous Student'}
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
