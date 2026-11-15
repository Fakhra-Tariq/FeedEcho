import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Copy } from 'lucide-react';

/**
 * Shared "Session Created!" success popup (Explore / Sessions design).
 * Overlay is portaled to document.body so it sits above page chrome.
 */
export default function SessionCreatedPopup({ sessionName, sessionCode, onCopy, onDone }) {
  if (!sessionCode) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">Session Created!</h2>
        <p className="text-[#5A4A55] dark:text-white/70 mb-6">
          Session:{' '}
          <span className="font-semibold text-[#2E1F2A] dark:text-white">{sessionName}</span>
        </p>
        <div className="bg-[#F2EBF0] rounded-xl p-6 mb-6">
          <p className="text-sm text-[#5A4A55] dark:text-white/70 mb-2">Session Code</p>
          <p className="text-4xl font-bold text-[#6D415F] tracking-wider break-all">{sessionCode}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => onCopy?.(sessionCode, e)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy Code
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
