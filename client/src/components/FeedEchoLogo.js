import React from 'react';
import { Link } from 'react-router-dom';

export const FEED_ECHO_LOGO_SRC = '/FeedEcho-logo.png.png';

/**
 * Phone (<768px): same rendered size as /audience/home —
 * 10rem-tall image clipped to a 4rem header strip, no max-width shrink.
 * md+: pass desktopImgClassName / wrapClassName to keep each page's current size.
 */
export default function FeedEchoLogo({
  to = null,
  onClick = null,
  ariaLabel = null,
  desktopImgClassName = '',
  wrapClassName = '',
  buttonClassName = '',
  linkClassName = '',
}) {
  const img = (
    <img
      src={FEED_ECHO_LOGO_SRC}
      alt="FeedEcho"
      className={`feed-echo-logo-img w-auto object-contain object-left mix-blend-multiply shrink-0 max-md:!h-[var(--logo-height-phone)] max-md:!max-w-none ${desktopImgClassName}`.trim()}
    />
  );

  const clipped = (
    <div
      className={`feed-echo-logo-clip relative flex items-center max-md:h-[var(--logo-clip-height-phone)] max-md:overflow-hidden max-md:shrink-0 ${wrapClassName}`.trim()}
    >
      {img}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={`flex items-center max-md:shrink-0 ${linkClassName}`.trim()}>
        {clipped}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || 'Leave'}
        className={`max-md:shrink-0 ${buttonClassName}`.trim()}
      >
        {clipped}
      </button>
    );
  }

  return clipped;
}
