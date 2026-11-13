import React from 'react';
import { User } from 'lucide-react';
import AudienceHeaderLogoutMenu from './AudienceHeaderLogoutMenu';

/** Same rule as AudienceActivityHeader: uid+email on profile or stored session. */
export const isLoggedInAudienceUser = (userProfile, session) =>
  Boolean((userProfile?.uid && userProfile?.email) || (session?.uid && session?.email));

export default function ExitTicketAttemptPhoneHeader({ title, participantName, isLoggedIn }) {
  return (
    <div className="md:hidden bg-white border-b border-neutral-200">
      <div className="flex items-center h-14 px-4 gap-2 min-w-0 overflow-hidden">
        <img
          src="/FeedEcho-logo.png.png"
          alt="FeedEcho"
          className="h-6 w-auto max-h-6 object-contain object-left shrink-0 mix-blend-multiply pointer-events-none select-none"
        />
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
          <div className="flex items-center gap-1 shrink min-w-0 max-w-[110px]">
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
