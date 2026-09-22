import React from 'react';
import { Users } from 'lucide-react';

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
}) {
  const logo = (
    <img
      src="/FeedEcho-logo.png.png"
      alt="FeedEcho"
      className="h-40 w-auto max-w-[min(11rem,calc(100vw-8rem))] object-contain object-left mix-blend-multiply"
    />
  );

  return (
    <div className="bg-white border-b border-neutral-200">
      <div className={AUDIENCE_ACTIVITY_PAGE_WIDTH}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-h-16 py-2 max-[480px]:py-2 min-[481px]:grid min-[481px]:grid-cols-3 min-[481px]:items-center min-[481px]:h-16 min-[481px]:py-0 min-[481px]:gap-2">
          <div className="flex justify-start min-w-0 order-1">
            {onLogoClick ? (
              <button
                type="button"
                onClick={onLogoClick}
                aria-label="Leave"
                className="relative flex h-16 shrink-0 items-center cursor-pointer"
              >
                {logo}
              </button>
            ) : (
              <div className="relative flex h-16 shrink-0 items-center">
                {logo}
              </div>
            )}
          </div>
          <div className="min-w-0 w-full max-[480px]:w-full flex flex-wrap items-center justify-center gap-x-2 gap-y-1 order-3 min-[481px]:order-2 min-[481px]:w-auto">
            {titleIcon}
            <h1 className="text-sm sm:text-base font-bold text-gray-900 text-center leading-tight break-words">
              {title}
            </h1>
            {badge ? (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap text-rose-purple"
                style={{ backgroundColor: '#F1E5EB', color: '#6D415F' }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <div className="flex justify-end min-w-0 order-2 min-[481px]:order-3">
            {rightAddon ? (
              <div className="flex items-center gap-4 min-w-0">
                {rightAddon}
                <div className="flex items-center gap-1.5 text-text-light min-w-0">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="text-sm truncate">{participantName}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-text-light min-w-0">
                <Users className="w-4 h-4 shrink-0" />
                <span className="text-sm truncate">{participantName}</span>
              </div>
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
