import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import clsx from 'clsx';
import { useHostData } from '../../contexts/HostDataContext';
import { useHybridAlert } from '../../contexts/HybridAlertContext';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { getSessionActivityLabel } from '../../utils/sessionActivityLabel';
import { GUEST_LOGIN_BANNER_BG_CLASS } from '../Audience/GuestProgressLoginBanner';
import SessionCreatedPopup from './SessionCreatedPopup';

/**
 * Compact session-status strip for content-creation pages.
 * Stays in sync with HostDataContext (navbar badge / Explore dashboard).
 */
export default function SessionLaunchBanner({ className = '' }) {
  const { data, createSession } = useHostData();
  const { alert } = useHybridAlert();
  const activeSession = data?.activeSession;
  const isActive = Boolean(activeSession);
  const sessionCode = String(activeSession?.joinCode || activeSession?.sessionCode || '')
    .trim()
    .toUpperCase();
  const activeActivityLabel = getSessionActivityLabel(
    activeSession?.currentActivity,
    data?.quizzes
  );

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatedPopup, setShowCreatedPopup] = useState(false);
  const [createdSessionData, setCreatedSessionData] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-primary/20',
          'max-md:gap-1.5 max-md:px-2 max-md:py-1.5 max-md:text-[13px]',
          GUEST_LOGIN_BANNER_BG_CLASS,
          'relative z-10 shrink-0 text-primary [&+*]:!mt-3',
          className
        )}
        role="status"
      >
        {isActive ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 max-md:flex max-md:items-center max-md:overflow-hidden">
              <span className="max-md:shrink-0 max-md:whitespace-nowrap">
                Launching to session:{' '}
              </span>
              <span className="font-semibold tracking-wider max-md:shrink-0">
                {sessionCode || '—'}
              </span>
              <span className="max-md:min-w-0 max-md:truncate max-md:whitespace-nowrap">
                {' · '}
                {activeActivityLabel || 'No active activity'}
              </span>
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 max-md:flex max-md:items-center max-md:overflow-hidden">
              <span className="max-md:min-w-0 max-md:truncate max-md:whitespace-nowrap">
                You&apos;ll need an active session to launch this.{' '}
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="font-semibold text-[#6D415F] underline underline-offset-2 hover:text-[#5A344D] transition-colors max-md:shrink-0 max-md:whitespace-nowrap"
              >
                Create Session
              </button>
            </span>
          </>
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
              <label htmlFor="launch-banner-session-name" className="block text-sm font-semibold text-gray-700 mb-2">
                Session name
              </label>
              <input
                id="launch-banner-session-name"
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

      {showCreatedPopup && createdSessionData ? (
        <SessionCreatedPopup
          sessionName={createdSessionData.sessionName}
          sessionCode={createdSessionData.sessionCode}
          onCopy={handleCopyCode}
          onDone={() => setShowCreatedPopup(false)}
        />
      ) : null}
    </>
  );
}
