import React from 'react';
import { User } from 'lucide-react';
import AudienceHeaderLogoutMenu from './AudienceHeaderLogoutMenu';
import AudienceActivityPhoneHeaderRow from './AudienceActivityPhoneHeaderRow';
import FeedEchoLogo from '../FeedEchoLogo';

/** Same rule as AudienceActivityHeader: uid+email on profile or stored session. */
export const isLoggedInAudienceUser = (userProfile, session) =>
  Boolean((userProfile?.uid && userProfile?.email) || (session?.uid && session?.email));

export default function ExitTicketAttemptPhoneHeader({ title, participantName, isLoggedIn }) {
  return (
    <div className="md:hidden bg-white border-b border-neutral-200 phone-header-gutter px-3">
      <AudienceActivityPhoneHeaderRow
        left={<FeedEchoLogo wrapClassName="pointer-events-none" />}
        center={
          <h1 dir="auto" className="text-base font-semibold text-text">
            {title}
          </h1>
        }
        right={
          isLoggedIn ? (
            <div className="shrink-0">
              <AudienceHeaderLogoutMenu displayName={participantName} />
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1 min-w-0">
              <User className="w-4 h-4 shrink-0" color="#5F5460" aria-hidden="true" />
              <span
                dir="auto"
                className="audience-activity-phone-header__name text-[13px] font-medium"
                style={{ color: '#2B1F27' }}
              >
                {participantName}
              </span>
            </div>
          )
        }
      />
    </div>
  );
}
