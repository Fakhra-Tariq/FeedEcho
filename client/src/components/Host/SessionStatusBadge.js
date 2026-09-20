import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Copy, X } from 'lucide-react';
import clsx from 'clsx';
import { useHostData } from '../../contexts/HostDataContext';
import { useHybridAlert } from '../../contexts/HybridAlertContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { copyToClipboard } from '../../utils/copyToClipboard';

/**
 * Persistent teacher-nav session indicator. Reads/writes via HostDataContext
 * so it stays in sync with the Explore dashboard session bar.
 */
const SessionStatusBadge = () => {
  const { data, createSession, endStandaloneSession, endActiveSession } = useHostData();
  const { alert } = useHybridAlert();
  const activeSession = data?.activeSession;
  const isActive = Boolean(activeSession);
  const sessionCode = String(activeSession?.joinCode || activeSession?.sessionCode || '')
    .trim()
    .toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatedPopup, setShowCreatedPopup] = useState(false);
  const [createdSessionData, setCreatedSessionData] = useState(null);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);

  const handleBadgeClick = () => {
    if (!isActive) {
      setShowCreateModal(true);
      return;
    }
    setMenuOpen((prev) => !prev);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      alert?.toast?.error?.('Please enter a session name');
      return;
    }
    setBusy(true);
    try {
      const sessionData = await createSession(sessionName.trim());
      setCreatedSessionData(sessionData);
      setShowCreateModal(false);
      setShowCreatedPopup(true);
      setSessionName('');
      alert?.toast?.success?.('Session created successfully!');
    } catch (error) {
      alert?.toast?.error?.(error?.message || 'Failed to create session');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async (code, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const copied = await copyToClipboard(code);
    if (copied) {
      alert?.toast?.success?.('Code copied to clipboard!');
    } else {
      alert?.toast?.error?.('Could not copy code. Please copy it manually.');
    }
  };

  const handleEndSession = async () => {
    setBusy(true);
    try {
      if (activeSession?.type === 'session' && activeSession?.sessionId) {
        await endStandaloneSession(activeSession.sessionId);
      } else {
        await endActiveSession();
      }
      setShowEndConfirmModal(false);
      setMenuOpen(false);
      alert?.toast?.success?.('Session ended successfully');
    } catch (error) {
      alert?.toast?.error?.(error?.message || 'Failed to end session');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={handleBadgeClick}
          className={clsx(
            'inline-flex items-center gap-2 max-w-[11rem] sm:max-w-none px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition-colors',
            isActive
              ? 'bg-[#6D415F]/10 border-[#6D415F]/25 text-[#6D415F] hover:bg-[#6D415F]/15'
              : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200/80'
          )}
          title={isActive ? `Active session ${sessionCode}` : 'Create a session'}
          aria-label={isActive ? `Active session ${sessionCode}` : 'No active session'}
        >
          <span
            className={clsx(
              'w-2 h-2 rounded-full shrink-0',
              isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
            )}
            aria-hidden
          />
          <span className="truncate">
            {isActive && sessionCode ? `Session: ${sessionCode}` : 'No active session'}
          </span>
        </button>

        {menuOpen && isActive && (
          <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-soft-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6D415F] mb-1">
                Active Session
              </p>
              <p className="text-sm font-medium text-gray-700 truncate">
                {activeSession?.sessionName || 'Session'}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-lg font-bold text-[#6D415F] tracking-wider">{sessionCode}</span>
                <button
                  type="button"
                  onClick={(e) => handleCopyCode(sessionCode, e)}
                  className="p-1.5 rounded-lg text-[#6D415F] hover:bg-[#6D415F]/10 transition-colors"
                  title="Copy code"
                  aria-label="Copy session code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowEndConfirmModal(true);
              }}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              End Session
            </button>
          </div>
        )}
      </div>

      {showCreateModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#2E1F2A]">Create Session</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSessionName('');
                  }}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <label htmlFor="navbar-session-name" className="block text-sm font-semibold text-gray-700 mb-2">
                Session name
              </label>
              <input
                id="navbar-session-name"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSession();
                }}
                placeholder="e.g. Period 3 Biology"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6D415F]/40 focus:border-[#6D415F] mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSessionName('');
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors disabled:opacity-60"
                >
                  {busy ? 'Creating…' : 'Create Session'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showCreatedPopup &&
        createdSessionData &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-[#2E1F2A] mb-2">Session Created!</h2>
              <p className="text-[#5A4A55] mb-6">
                Session:{' '}
                <span className="font-semibold text-[#2E1F2A]">{createdSessionData.sessionName}</span>
              </p>
              <div className="bg-[#F2EBF0] rounded-xl p-6 mb-6">
                <p className="text-sm text-[#5A4A55] mb-2">Session Code</p>
                <p className="text-4xl font-bold text-[#6D415F] tracking-wider">
                  {createdSessionData.sessionCode}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => handleCopyCode(createdSessionData.sessionCode, e)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Code
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreatedPopup(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showEndConfirmModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-[#2E1F2A] mb-2">End Session?</h2>
              <p className="text-[#5A4A55] mb-6">
                Are you sure you want to end this session? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEndConfirmModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEndSession}
                  disabled={busy}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {busy ? 'Ending…' : 'End Session'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default SessionStatusBadge;
