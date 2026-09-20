import React from 'react';
import { ArrowLeft, Rocket } from 'lucide-react';

/**
 * Shared chrome for the Space Race "Choose your team" screen.
 * Matches the audience in-session header (Leave + Space Race).
 */
export default function AudienceTeamSelectShell({
  onLeave,
  children,
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex-shrink-0 bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-2 text-text/70 hover:text-text text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Leave
        </button>
        <div className="flex items-center gap-2 text-text">
          <Rocket className="w-5 h-5 text-primary" />
          <span className="font-semibold">Space Race</span>
        </div>
        <div className="w-16" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4 sm:p-6 py-8">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-soft-lg border border-primary/10 p-6 sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
