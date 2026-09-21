import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getStoredAudienceSession } from '../../utils/audienceSession';

const DISMISS_KEY = 'feedecho_guest_progress_login_banner_dismissed';

/** Same tint as the guest login banner strip. */
export const GUEST_LOGIN_BANNER_BG_CLASS = 'bg-[#F1E5EB]';

/** Guest-only prompt to log in so activity can be saved to progress history. */
export default function GuestProgressLoginBanner({ contentClassName } = {}) {
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
    <div className={GUEST_LOGIN_BANNER_BG_CLASS}>
      <div
        className={
          contentClassName ||
          'max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-3'
        }
      >
        <p className="text-sm text-text min-w-0">
          Log in to save this to your progress history.{' '}
          <Link
            to="/join"
            className="font-semibold text-[#6D415F] hover:text-[#5A344D] underline underline-offset-2"
          >
            Log in
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 rounded-md text-text/60 hover:text-text hover:bg-white/40 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
