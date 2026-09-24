import React from 'react';
import { Users } from 'lucide-react';
import AudienceAvatar from '../AudienceAvatar';

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
}) {
  const logo = (
    <img
      src="/FeedEcho-logo.png.png"
      alt="FeedEcho"
      className={`w-auto object-contain object-left mix-blend-multiply ${
        compactMobileZones
          ? 'h-8 max-md:max-w-[5.75rem] md:h-40 md:max-w-[min(11rem,calc(100vw-8rem))]'
          : 'h-40 max-w-[min(11rem,calc(100vw-8rem))] max-[480px]:max-w-[8.5rem]'
      }`}
    />
  );

  const desktopNameLabel = (
    <span className="text-sm truncate max-[480px]:text-[11px] max-[375px]:hidden max-[480px]:max-w-[4.5rem] min-[481px]:max-w-none">
      {participantName}
    </span>
  );

  const usersIdentity = (
    <div className="flex items-center gap-1 max-[480px]:gap-0.5 text-text-light min-w-0">
      <Users className="w-4 h-4 shrink-0 max-[480px]:w-3.5 max-[480px]:h-3.5" />
      {desktopNameLabel}
    </div>
  );

  const identity =
    showAvatar || compactMobileZones ? (
      <>
        <div className="md:hidden flex items-center justify-end gap-1.5 min-w-0">
          <AudienceAvatar
            name={participantName}
            className="w-6 h-6"
            textClassName="text-[10px]"
          />
          <span className="text-xs truncate min-w-0">{participantName}</span>
        </div>
        <div className="hidden md:flex min-w-0">{usersIdentity}</div>
      </>
    ) : (
      usersIdentity
    );

  return (
    <div className={`bg-white border-b border-neutral-200 ${className}`.trim()}>
      <div className={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} ${compactMobileZones ? 'max-md:!px-3' : ''}`.trim()}>
        <div
          className={
            compactMobileZones
              ? 'grid grid-cols-3 items-center gap-x-2 min-h-14 py-1.5 md:grid-cols-3 md:h-16 md:py-0 md:gap-2'
              : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 min-h-12 py-1 min-[481px]:grid-cols-3 min-[481px]:h-16 min-[481px]:py-0 min-[481px]:gap-2'
          }
        >
          <div className="flex justify-start min-w-0">
            {onLogoClick ? (
              <button
                type="button"
                onClick={onLogoClick}
                aria-label="Leave"
                className={`relative flex shrink-0 items-center overflow-hidden cursor-pointer ${
                  compactMobileZones
                    ? 'h-8 md:h-16'
                    : 'h-12 max-[359px]:h-9 min-[481px]:h-16'
                }`}
              >
                {logo}
              </button>
            ) : (
              <div
                className={`relative flex shrink-0 items-center overflow-hidden ${
                  compactMobileZones
                    ? 'h-8 md:h-16'
                    : 'h-12 max-[359px]:h-9 min-[481px]:h-16'
                }`}
              >
                {logo}
              </div>
            )}
          </div>
          <div
            className={`min-w-0 flex items-center justify-center gap-x-1 overflow-hidden ${
              compactMobileZones
                ? 'md:gap-x-2'
                : 'min-[481px]:gap-x-2 max-[480px]:[&_svg]:h-3.5 max-[480px]:[&_svg]:w-3.5 max-[375px]:[&_svg]:hidden'
            }`}
          >
            {titleIcon}
            <h1
              className={`font-bold text-gray-900 text-center leading-tight truncate whitespace-nowrap ${
                compactMobileZones
                  ? 'text-sm md:text-base'
                  : 'text-sm sm:text-base max-[480px]:text-[11px]'
              }`}
            >
              {title}
            </h1>
            {badge ? (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap text-rose-purple shrink-0 max-[480px]:px-1.5 max-[480px]:text-[10px] max-[375px]:hidden"
                style={{ backgroundColor: '#F1E5EB', color: '#6D415F' }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <div className="flex justify-end min-w-0">
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
