import React from 'react';
import { GUEST_ALREADY_ATTEMPTED_MESSAGE } from '../../utils/guestAttemptIdentity';

export default function GuestAlreadyAttemptedNotice({ onUseDifferentName }) {
  if (!onUseDifferentName) return null;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-text px-1">{GUEST_ALREADY_ATTEMPTED_MESSAGE}</p>
      <button
        type="button"
        onClick={onUseDifferentName}
        className="w-full min-h-11 px-6 py-3 border border-primary/30 text-primary rounded-xl hover:bg-primary/5 transition-colors font-semibold"
      >
        Use a different name
      </button>
    </div>
  );
}
