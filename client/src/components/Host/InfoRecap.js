import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, HelpCircle, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Inline "How it works" link for host feature pages.
 * Sits next to the page title and opens the workflow steps in a modal.
 *
 * @param {string[]} steps - Ordered step descriptions for this feature
 * @param {'default'|'onDark'} [variant] - Use `onDark` on the plum header cards
 * @param {string} [className] - Optional classes for the inline trigger
 */
export default function InfoRecap({ steps = [], variant = 'default', className = '' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!steps.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex items-center gap-1 text-sm font-medium transition-colors',
          variant === 'onDark'
            ? 'text-white/90 hover:text-white'
            : 'text-primary hover:text-primary/80',
          className
        )}
      >
        <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        How it works
        <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className="bg-white rounded-2xl shadow-soft-lg w-full max-w-md p-5"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="info-recap-title"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <span className="inline-flex items-center gap-2 text-primary">
                  <HelpCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <h2 id="info-recap-title" className="text-lg font-semibold text-text">
                    How this works
                  </h2>
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-sm text-[#5A4A55] leading-relaxed">
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
