import React from 'react';
import { User, Users } from 'lucide-react';
import AudienceAvatar from '../AudienceAvatar';
import AudienceHeaderLogoutMenu from './AudienceHeaderLogoutMenu';
import AudienceActivityPhoneHeaderRow from './AudienceActivityPhoneHeaderRow';
import FeedEchoLogo from '../FeedEchoLogo';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredAudienceSession } from '../../utils/audienceSession';

/** Homepage-aligned content width for student quiz / exit-ticket pages. */
export const AUDIENCE_ACTIVITY_PAGE_WIDTH =
  'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';

export function AudienceActivityHeader({
  title,
  badge = null,
  titleIcon = null,
  participantName = 'Audience',
  onLogoClick = null,
  rightAddon = null,
  children,
  className = '',
  showAvatar = false,
  showLoggedInLogoutMenu = false,
  compactMobileZones = false,
  trueCenterTitle = false,
  leftAlignMobileTitle = false,
  phoneHeaderVariant = null,
}) {
  void showAvatar;
  void trueCenterTitle;
  void leftAlignMobileTitle;
  const { userProfile } = useAuth();
  const session = getStoredAudienceSession();
  const isLoggedInAudience = Boolean(
    (userProfile?.uid && userProfile?.email) || (session?.uid && session?.email)
  );

  const activityLogoDesktop =
    'md:h-40 md:max-w-[min(11rem,calc(100vw-8rem))]';
  const logoSlot = onLogoClick ? (
    <FeedEchoLogo
      onClick={onLogoClick}
      ariaLabel="Leave"
      buttonClassName="relative flex md:h-16 shrink-0 items-center overflow-hidden cursor-pointer"
      wrapClassName="md:h-16 md:overflow-hidden"
      desktopImgClassName={activityLogoDesktop}
    />
  ) : (
    <FeedEchoLogo
      wrapClassName="md:h-16 md:overflow-hidden"
      desktopImgClassName={activityLogoDesktop}
    />
  );

  const desktopIdentity = (
    <div className="hidden md:flex items-center gap-1 text-text-light min-w-0">
      <Users className="w-4 h-4 shrink-0" />
      <span className="text-sm truncate">{participantName}</span>
    </div>
  );

  const phoneGuestName = (
    <div className="flex items-center justify-end gap-1 min-w-0">
      <User className="w-4 h-4 shrink-0" color="#5F5460" aria-hidden="true" />
      <span
        dir="auto"
        className="audience-activity-phone-header__name text-xs text-text-light text-right"
      >
        {participantName}
      </span>
    </div>
  );

  const phoneIdentity =
    showLoggedInLogoutMenu && isLoggedInAudience ? (
      <AudienceHeaderLogoutMenu displayName={participantName} />
    ) : isLoggedInAudience ? (
      <div className="flex items-center justify-end shrink-0">
        <AudienceAvatar
          name={participantName}
          className="w-8 h-8"
          textClassName="text-sm"
        />
      </div>
    ) : (
      phoneGuestName
    );

  const desktopIdentityBlock =
    showLoggedInLogoutMenu && isLoggedInAudience ? (
      <AudienceHeaderLogoutMenu displayName={participantName} />
    ) : (
      desktopIdentity
    );

  const titleHeading = (twoLine) => (
    <h1
      dir="auto"
      title={typeof title === 'string' ? title : undefined}
      className={
        twoLine
          ? 'font-bold text-gray-900 text-center leading-tight text-sm sm:text-base min-w-0 line-clamp-2 whitespace-normal break-words'
          : 'font-bold text-gray-900 text-center leading-tight truncate whitespace-nowrap text-sm sm:text-base'
      }
    >
      {title}
    </h1>
  );

  const phoneTitleContent = (
    <>
      {titleIcon}
      {titleHeading(phoneHeaderVariant === 'quiz')}
    </>
  );

  const desktopTitleContent = (
    <>
      {titleIcon}
      {titleHeading(false)}
      {badge ? (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap text-rose-purple shrink-0 max-[480px]:px-1.5 max-[480px]:text-[10px] ${
            compactMobileZones ? 'max-[375px]:hidden' : ''
          }`}
          style={{ backgroundColor: '#F1E5EB', color: '#6D415F' }}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  const phoneRight = rightAddon ? (
    <div className="flex items-center justify-end gap-2 min-w-0">
      <div className="shrink-0">{rightAddon}</div>
      {phoneIdentity}
    </div>
  ) : (
    phoneIdentity
  );

  return (
    <div className={`bg-white border-b border-neutral-200 ${className}`.trim()}>
      <div className={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} phone-header-gutter`.trim()}>
        <AudienceActivityPhoneHeaderRow
          left={logoSlot}
          center={
            <div className="audience-activity-phone-header__cluster-title">{phoneTitleContent}</div>
          }
          right={phoneRight}
          rightHasAddon={Boolean(rightAddon)}
          variant={phoneHeaderVariant}
        />
        <div className="hidden md:grid md:grid-cols-3 md:h-16 md:gap-2 md:items-center">
          {logoSlot}
          <div className="min-w-0 flex items-center justify-center gap-x-2 overflow-hidden">
            {desktopTitleContent}
          </div>
          <div className="flex justify-end items-center shrink-0 min-w-0">
            {rightAddon ? (
              <div className="flex items-center gap-2 min-[481px]:gap-4 min-w-0 shrink-0">
                {rightAddon}
                {desktopIdentityBlock}
              </div>
            ) : (
              desktopIdentityBlock
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AudienceActivityContent({ children, className = '' }) {
  return (
    <div className={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} py-4 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function AudienceActivityCard({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-soft border border-neutral-200 p-4 sm:p-5 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
