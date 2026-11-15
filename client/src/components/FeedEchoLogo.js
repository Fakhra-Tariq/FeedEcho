import React from 'react';
import { Link } from 'react-router-dom';

export const FEED_ECHO_LOGO_SRC = '/FeedEcho-logo.png.png';

/**
 * Shared header logo. Phone size/nudge live on --logo-*-phone in index.css.
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
      className={`feed-echo-logo-img w-auto object-contain object-left mix-blend-multiply shrink-0 ${desktopImgClassName}`.trim()}
    />
  );

  const clipped = (
    <div className={`feed-echo-logo-clip relative flex items-center ${wrapClassName}`.trim()}>
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
