import React from 'react';
import clsx from 'clsx';

/**
 * Shared plum gradient header card for host pages (Explore, Sessions, Library…).
 *
 * Use `compact` for feature pages that keep the card to a single title/action row
 * (Space Race, Exit Ticket, Create Quiz).
 *
 * @param {React.ComponentType} [icon] - Lucide icon shown in the circular badge
 * @param {React.ReactNode} title - Page title
 * @param {React.ReactNode} [titleAccessory] - Inline element next to the title (e.g. InfoRecap)
 * @param {React.ReactNode} [subtitle] - Supporting line under the title
 * @param {React.ReactNode} [actions] - Action button(s) rendered at the right of the card
 * @param {React.ReactNode} [children] - Optional content below the title row (e.g. a stats row)
 * @param {boolean} [compact] - Tighter padding and title size
 * @param {string} [className] - Optional wrapper classes
 */
export default function PageHeaderCard({
  icon: Icon,
  title,
  titleAccessory,
  subtitle,
  actions,
  children,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={clsx(
        'bg-gradient-to-br from-[#6D415F] via-[#6D415F]/90 to-[#3A2E2A] border border-[#6D415F]/30 shadow-xl',
        compact ? 'rounded-2xl p-6' : 'rounded-3xl p-8',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className={clsx(
                'font-bold text-white',
                compact ? 'text-2xl' : 'text-4xl md:text-5xl mb-3'
              )}
            >
              {title}
            </h1>
            {titleAccessory}
          </div>
          {subtitle && (
            <p className={clsx('text-white/90 max-w-3xl', compact ? 'text-sm mt-1' : 'text-lg')}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {actions}
          {Icon && (
            <div className="hidden md:block">
              <div
                className={clsx(
                  'bg-gradient-to-br from-[#6D415F] to-[#8B5A7C] rounded-full flex items-center justify-center shadow-lg',
                  compact ? 'w-10 h-10' : 'w-16 h-16'
                )}
              >
                <Icon className={clsx('text-white', compact ? 'w-5 h-5' : 'w-8 h-8')} />
              </div>
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
