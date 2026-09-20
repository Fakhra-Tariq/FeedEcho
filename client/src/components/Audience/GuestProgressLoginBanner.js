import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getStoredAudienceSession } from '../../utils/audienceSession';

const DISMISS_KEY = 'feedecho_guest_progress_login_banner_dismissed';

/** Guest-only prompt to log in so activity can be saved to progress history. */
export default function GuestProgressLoginBanner() {
  const isLoggedIn = Boolean(getStoredAudienceSession());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (isLoggedIn || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-text min-w-0">
          Log in to save this to your progress history.{' '}
          <Link
            to="/join"
            className="font-semibold text-primary hover:text-primary/80 underline underline-offset-2"
          >
            Log in
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 rounded-md text-text/60 hover:text-text hover:bg-primary/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
