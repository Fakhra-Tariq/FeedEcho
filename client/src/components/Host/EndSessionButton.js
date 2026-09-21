import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import { useHostData } from '../../contexts/HostDataContext';
import { useHybridAlert } from '../../contexts/HybridAlertContext';

/**
 * Shared End Session control used by the Explore banner.
 * Opens the existing confirmation modal, then calls the same context handlers.
 */
export default function EndSessionButton({
  className = 'flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors',
  labelClassName = 'hidden sm:inline',
}) {
  const { data, endActiveSession, endStandaloneSession } = useHostData();
  const { alert } = useHybridAlert();
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const activeSession = data.activeSession;

  const handleEndSession = async () => {
    if (activeSession?.type === 'session' && activeSession?.sessionId) {
      try {
        await endStandaloneSession(activeSession.sessionId);
        setShowEndConfirmModal(false);
        if (alert?.toast?.success) {
          alert.toast.success('Session ended successfully');
        }
      } catch (error) {
        if (alert?.toast?.error) {
          alert.toast.error(error?.message || 'Failed to end session');
        }
      }
    } else {
      try {
        await endActiveSession();
        setShowEndConfirmModal(false);
      } catch (error) {
        if (alert?.toast?.error) {
          alert.toast.error(error?.message || 'Failed to end session');
        }
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowEndConfirmModal(true)}
        className={className}
      >
        <X className="w-4 h-4" />
        <span className={labelClassName}>End Session</span>
      </button>

      {showEndConfirmModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">End Session?</h2>
              <p className="text-[#5A4A55] dark:text-white/70 mb-6">
                Are you sure you want to end this session? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEndConfirmModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
