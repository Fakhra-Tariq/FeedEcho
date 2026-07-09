import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { copyToClipboard } from '../utils/copyToClipboard';
import {
  Plus,
  X,
  Copy,
  CheckCircle2,
  Calendar,
  Hash,
  Loader2,
  ClipboardList,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTeacherData } from '../contexts/TeacherDataContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { sessionsAPI } from '../services/api';
import {
  formatSessionActivityHistoryLine,
  parseSessionActivities,
} from '../utils/sessionActivityLabel';

function formatSessionDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

const SessionsPage = () => {
  const { user, userProfile } = useAuth();
  const teacherId = userProfile?.uid || user?.uid;
  const { data, createSession } = useTeacherData();
  const { alert } = useHybridAlert();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [showCreatedPopup, setShowCreatedPopup] = useState(false);
  const [createdSessionData, setCreatedSessionData] = useState(null);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSessionActive = !!data.activeSession;

  const loadSessions = useCallback(async () => {
    if (!teacherId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      const response = await sessionsAPI.listByTeacher(teacherId);
      if (response.data?.success) {
        setSessions(response.data.data || []);
      } else {
        setSessions([]);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      alert?.toast?.error?.('Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, alert?.toast]);

  const activeSessionId = data.activeSession?.sessionId ?? data.activeSession?.id ?? null;
  const hasActiveSession = Boolean(data.activeSession);

  useEffect(() => {
    if (!teacherId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadSessions();
  }, [teacherId, hasActiveSession, activeSessionId, loadSessions]);

  const handleCopyCode = async (code, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const copied = await copyToClipboard(code);
    if (copied) {
      alert.toast.success('Code copied to clipboard!');
    } else {
      alert.toast.error('Could not copy code. Please copy it manually.');
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      if (alert?.toast?.error) {
        alert.toast.error('Please enter a session name');
      }
      return;
    }

    try {
      const sessionData = await createSession(sessionName);
      setCreatedSessionData(sessionData);
      setShowCreateModal(false);
      setShowCreatedPopup(true);
      setSessionName('');
      await loadSessions();
      if (alert?.toast?.success) {
        alert.toast.success('Session created successfully!');
      }
    } catch (error) {
      if (alert?.toast?.error) {
        alert.toast.error(error?.message || 'Failed to create session');
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete?.id || !teacherId) return;

    setIsDeleting(true);
    try {
      const response = await sessionsAPI.delete(sessionToDelete.id, teacherId);
      if (response.data?.success) {
        setSessionToDelete(null);
        await loadSessions();
        if (alert?.toast?.success) {
          alert.toast.success('Session deleted successfully');
        }
      } else {
        throw new Error(response.data?.error || 'Failed to delete session');
      }
    } catch (error) {
      if (alert?.toast?.error) {
        alert.toast.error(error?.message || 'Failed to delete session');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#2E1F2A] dark:text-white">Sessions</h1>
          <p className="mt-2 text-[#5A4A55] dark:text-white/70 max-w-2xl">
            View all your classroom sessions and the activities launched within each one.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          disabled={isSessionActive}
          className={clsx(
            'flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300 shrink-0',
            'bg-white text-[#6D415F] hover:bg-white/90',
            'shadow-lg hover:shadow-xl',
            isSessionActive && 'opacity-50 cursor-not-allowed'
          )}
          title={isSessionActive ? 'A session is already active' : 'Create a new session'}
        >
          <Plus className="w-5 h-5" />
          <span>Create Session</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-[#6D415F]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white dark:bg-[#3A2E2A] rounded-3xl p-12 text-center border border-[#6D415F]/20 shadow-lg">
          <div className="w-20 h-20 bg-[#6D415F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-10 h-10 text-[#6D415F]" />
          </div>
          <h2 className="text-xl font-bold text-[#2E1F2A] dark:text-white mb-2">No sessions yet</h2>
          <p className="text-[#5A4A55] dark:text-white/70 mb-6">
            Create your first session to start launching activities with a shared join code.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isSessionActive}
            className={clsx(
              'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold',
              'bg-[#6D415F] text-white hover:bg-[#6D415F]/90',
              isSessionActive && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Plus className="w-5 h-5" />
            Create Session
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onCopyCode={handleCopyCode}
              onDelete={setSessionToDelete}
            />
          ))}
        </div>
      )}

      {showCreateModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white">Create Session</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSessionName('');
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-white/70" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#2E1F2A] dark:text-white mb-2">
                    Session Name
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Enter session name"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/10 text-[#2E1F2A] dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6D415F] focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setSessionName('');
                    }}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSession}
                    className="flex-1 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
                  >
                    Create Session
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showCreatedPopup &&
        createdSessionData &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">Session Created!</h2>
              <p className="text-[#5A4A55] dark:text-white/70 mb-6">
                Session:{' '}
                <span className="font-semibold text-[#2E1F2A] dark:text-white">
                  {createdSessionData.sessionName}
                </span>
              </p>
              <div className="bg-[#F2EBF0] rounded-xl p-6 mb-6">
                <p className="text-sm text-[#5A4A55] dark:text-white/70 mb-2">Session Code</p>
                <p className="text-4xl font-bold text-[#6D415F] tracking-wider">
                  {createdSessionData.sessionCode}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyCode(createdSessionData.sessionCode)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Code
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreatedPopup(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {sessionToDelete &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">Delete session?</h2>
              <p className="text-[#5A4A55] dark:text-white/70 mb-6">
                Are you sure you want to delete this session?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const SessionCard = ({ session, onCopyCode, onDelete }) => {
  const isActive = String(session.status || '').toLowerCase() === 'active';
  const activities = parseSessionActivities(session);

  return (
    <article className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 shadow-lg border border-[#6D415F]/20">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-xl font-bold text-[#2E1F2A] dark:text-white truncate">
              {session.sessionName || 'Untitled Session'}
            </h2>
            <span
              className={clsx(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
                isActive
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/70'
              )}
            >
              {isActive ? 'ACTIVE' : 'ENDED'}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#5A4A55] dark:text-white/70">
            {isActive && session.sessionCode && (
              <span className="inline-flex items-center gap-2">
                <Hash className="w-4 h-4 text-[#6D415F]" />
                <span className="font-semibold text-[#6D415F] text-base tracking-wide">
                  {session.sessionCode}
                </span>
                <button
                  type="button"
                  onClick={() => onCopyCode(session.sessionCode)}
                  className="p-1 rounded-lg hover:bg-[#F2EBF0] text-[#6D415F]"
                  aria-label="Copy session code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#6D415F]" />
              {formatSessionDateTime(session.createdAt)}
            </span>
          </div>
        </div>

        {!isActive && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(session)}
            className="shrink-0 p-2 rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            aria-label="Delete session"
            title="Delete session"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="mt-5 pt-5 border-t border-[#6D415F]/10">
        <p className="text-xs font-semibold text-[#6D415F] uppercase tracking-widest mb-3">
          Activities in this session
        </p>
        {activities.length === 0 ? (
          <p className="text-sm text-[#5A4A55] dark:text-white/60 italic">
            No activities launched in this session yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {activities.map((entry) => (
              <li
                key={entry.id || `${entry.type}-${entry.launchedAt}`}
                className="text-sm text-[#2E1F2A] dark:text-white/90"
              >
                {formatSessionActivityHistoryLine(entry)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
};

export default SessionsPage;
