import React from 'react';
import { Users } from 'lucide-react';
import AudienceAvatar from '../AudienceAvatar';
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
  compactMobileZones = false,
  trueCenterTitle = false,
  leftAlignMobileTitle = false,
}) {
  const { userProfile } = useAuth();
  const session = getStoredAudienceSession();
  const isLoggedInAudience = Boolean(
    (userProfile?.uid && userProfile?.email) || (session?.uid && session?.email)
  );

  const logo = (
    <img
      src="/FeedEcho-logo.png.png"
      alt="FeedEcho"
      className="h-40 w-auto max-w-[min(11rem,calc(100vw-8rem))] max-md:max-w-[min(9.5rem,calc(100vw-11rem))] object-contain object-left mix-blend-multiply"
    />
  );

  const logoShell = (
    <div className="relative flex h-16 shrink-0 items-center overflow-hidden">
      {logo}
    </div>
  );

  const desktopIdentity = (
    <div className="hidden md:flex items-center gap-1 text-text-light min-w-0">
      <Users className="w-4 h-4 shrink-0" />
      <span className="text-sm truncate">{participantName}</span>
    </div>
  );

  const mobileIdentity = isLoggedInAudience ? (
    <div className="md:hidden flex items-center justify-end shrink-0">
      <AudienceAvatar
        name={participantName}
        className="w-8 h-8"
        textClassName="text-sm"
      />
    </div>
  ) : (
    <div className="md:hidden flex items-center justify-end min-w-0 max-w-[6.5rem]">
      <span className="text-xs text-text-light truncate text-right">{participantName}</span>
    </div>
  );

  const identity = (
    <>
      {mobileIdentity}
      {desktopIdentity}
    </>
  );

  const titleContent = (
    <>
      {titleIcon}
      <h1 className="font-bold text-gray-900 text-center leading-tight truncate whitespace-nowrap text-sm sm:text-base">
        {title}
      </h1>
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

  const clusterTitleLeft = trueCenterTitle && leftAlignMobileTitle;
  const logoSlot = (
    <div className={`${trueCenterTitle && !clusterTitleLeft ? 'relative z-10 ' : ''}flex justify-start shrink-0`}>
      {onLogoClick ? (
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Leave"
          className="relative flex h-16 shrink-0 items-center overflow-hidden cursor-pointer"
        >
          {logo}
        </button>
      ) : (
        logoShell
      )}
    </div>
  );

  return (
    <div className={`bg-white border-b border-neutral-200 ${className}`.trim()}>
      <div className={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} ${compactMobileZones ? 'max-md:!px-3' : ''}`.trim()}>
        <div
          className={
            clusterTitleLeft
              ? 'flex items-center gap-x-1 h-16 min-h-16 py-0 md:grid md:grid-cols-3 md:gap-2'
              : trueCenterTitle
              ? 'relative flex items-center min-h-16 py-0 md:grid md:grid-cols-3 md:h-16 md:gap-2'
              : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 min-h-16 py-0 md:grid-cols-3 md:h-16 md:gap-2'
          }
        >
          {logoSlot}
          {clusterTitleLeft ? (
            <div className="min-w-0 flex flex-1 items-center gap-x-1 overflow-hidden max-md:[&_h1]:text-left [&_h1]:min-w-0 md:justify-center md:gap-x-2">
              {titleContent}
            </div>
          ) : trueCenterTitle ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center min-w-0 md:pointer-events-auto md:static md:inset-auto md:flex md:items-center md:justify-center md:overflow-hidden">
              <div className="pointer-events-auto min-w-0 max-w-[calc(100%-11rem)] flex items-center justify-center gap-x-1 overflow-hidden md:max-w-none md:gap-x-2">
                {titleContent}
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex items-center justify-center gap-x-1 overflow-hidden md:gap-x-2">
              {titleContent}
            </div>
          )}
          <div className={`flex justify-end items-center shrink-0 min-w-0 ${trueCenterTitle ? 'relative z-10 ml-auto md:ml-0' : ''}`}>
            {rightAddon ? (
              <div className="flex items-center gap-2 min-[481px]:gap-4 min-w-0">
                {rightAddon}
                {identity}
              </div>
            ) : (
              identity
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
