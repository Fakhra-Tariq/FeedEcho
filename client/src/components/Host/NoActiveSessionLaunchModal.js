import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Copy, X } from 'lucide-react';
import { useHostData } from '../../contexts/HostDataContext';
import { useHybridAlert } from '../../contexts/HybridAlertContext';
import { copyToClipboard } from '../../utils/copyToClipboard';

/** Compact muted hint under Launch buttons. */
export function LaunchRequiresSessionHint({ className = '' }) {
  return (
    <p className={`text-xs text-gray-500 mt-1 ${className}`.trim()}>
      Requires an active session
    </p>
  );
}

/**
 * Shared popup when Launch is clicked with no active teacher session.
 * Offers Create Session (existing flow) or Save as Draft (caller-provided).
 */
export default function NoActiveSessionLaunchModal({
  isOpen,
  onClose,
  onSaveAsDraft,
  saveDraftLabel = 'Save as Draft',
}) {
  const { createSession } = useHostData();
  const { alert } = useHybridAlert();

  const [view, setView] = useState('choice'); // 'choice' | 'create'
  const [sessionName, setSessionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdSessionData, setCreatedSessionData] = useState(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setView('choice');
    setSessionName('');
    setBusy(false);
    setCreatedSessionData(null);
    onClose?.();
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
      setView('created');
      setSessionName('');
      alert?.toast?.success?.('Session created successfully!');
    } catch (error) {
      alert?.toast?.error?.(error?.message || 'Failed to create session');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    setBusy(true);
    try {
      await onSaveAsDraft?.();
      resetAndClose();
    } catch (error) {
      alert?.toast?.error?.(error?.message || 'Failed to save draft');
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

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {view === 'choice' && (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#2E1F2A]">No active session yet</h2>
                  <p className="text-sm text-[#5A4A55] mt-1 leading-relaxed">
                    No active session yet. Create one now to launch, or save this as a draft for later.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                type="button"
                onClick={() => setView('create')}
                className="flex-1 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
              >
                Create Session
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {busy ? 'Saving…' : saveDraftLabel}
              </button>
            </div>
          </>
        )}

        {view === 'create' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#2E1F2A]">Create Session</h2>
              <button
                type="button"
                onClick={() => setView('choice')}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Back"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label htmlFor="no-session-launch-name" className="block text-sm font-semibold text-gray-700 mb-2">
              Session name
            </label>
            <input
              id="no-session-launch-name"
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
                onClick={() => setView('choice')}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors"
              >
                Back
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
          </>
        )}

        {view === 'created' && createdSessionData && (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-[#2E1F2A] mb-1">Session Created!</h2>
            <p className="text-sm text-[#5A4A55] mb-4">
              Code:{' '}
              <span className="font-bold text-[#6D415F] tracking-wider">
                {createdSessionData.sessionCode}
              </span>
            </p>
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
                onClick={resetAndClose}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-[#2E1F2A] font-semibold hover:bg-gray-50 transition-colors"
              >
                Done
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">You can launch now that a session is active.</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
