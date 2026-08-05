import React from 'react';

/**
 * Shared marketing surface card (Home / About).
 * Gradient + hover lift live in `.surface-card` (index.css).
 */
export function SurfaceCard({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`group surface-card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

/** Icon badge that stays distinct on the soft gradient card. */
export function SurfaceCardIcon({ children, className = '', ...rest }) {
  return (
    <div className={`surface-card-icon ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

/** Hero: modest top gap under navbar; moderate bottom before next content. */
export const marketingHeroClass =
  'relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12 pb-10 sm:pb-12 lg:pb-14';

/** Major content sections — consistent vertical rhythm on Home & About. */
export const marketingSectionClass =
  'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24';

/** Bottom padding only (e.g. last section or hero-adjacent card row). */
export const marketingSectionBottomClass =
  'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-24';
