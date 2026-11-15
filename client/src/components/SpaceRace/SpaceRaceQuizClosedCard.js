import React from 'react';
import { Clock } from 'lucide-react';

/** Shared Space Race quiz-closed card (quiz duration and join duration). */
export default function SpaceRaceQuizClosedCard({ onBack }) {
  return (
    <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8 max-w-md w-full text-center">
      <Clock className="w-16 h-16 text-error-500 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-text mb-4">Time&apos;s Up</h1>
      <p className="text-text-light mb-6">
        This quiz is closed. Your team&apos;s time has ended, so it can no longer be opened or attempted.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
      >
        Back to Race
      </button>
    </div>
  );
}
