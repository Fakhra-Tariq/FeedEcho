import React from 'react';
import { User } from 'lucide-react';
import AudienceHeaderLogoutMenu from './AudienceHeaderLogoutMenu';

/** Same rule as AudienceActivityHeader: uid+email on profile or stored session. */
export const isLoggedInAudienceUser = (userProfile, session) =>
  Boolean((userProfile?.uid && userProfile?.email) || (session?.uid && session?.email));

export default function ExitTicketAttemptPhoneHeader({ title, participantName, isLoggedIn }) {
  return (
    <div className="md:hidden bg-white border-b border-neutral-200">
      <div className="flex items-center min-h-[60px] py-2 px-3 gap-2 min-w-0 overflow-hidden">
        {/* 500×500 asset has large empty margins; crop a scaled img so the wordmark reads at ~32–36px. */}
        <div className="relative h-8 min-[390px]:h-9 w-24 min-[390px]:w-[7.5rem] min-w-[96px] max-w-[120px] shrink-0 overflow-hidden pointer-events-none">
          <img
            src="/FeedEcho-logo.png.png"
            alt="FeedEcho"
            className="absolute left-1/2 top-1/2 h-[7.5rem] min-[390px]:h-36 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain object-center mix-blend-multiply select-none"
          />
        </div>
        <h1
          dir="auto"
          className="flex-1 min-w-0 text-center text-base font-semibold text-text truncate whitespace-nowrap"
        >
          {title}
        </h1>
        {isLoggedIn ? (
          <div className="shrink-0">
            <AudienceHeaderLogoutMenu displayName={participantName} />
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0 min-w-0 max-w-[90px]">
            <User className="w-4 h-4 shrink-0" color="#5F5460" aria-hidden="true" />
            <span
              dir="auto"
              className="min-w-0 text-[13px] font-medium truncate"
              style={{ color: '#2B1F27' }}
            >
              {participantName}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
