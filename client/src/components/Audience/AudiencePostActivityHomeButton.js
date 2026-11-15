import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredAudienceSession } from '../../utils/audienceSession';
import { getAudiencePostActivityHomeLabel } from '../../utils/audiencePostActivityHomeLabel';

export { getAudiencePostActivityHomeLabel } from '../../utils/audiencePostActivityHomeLabel';

/**
 * Post-quiz / post-race leave button label. Destinations stay with the caller.
 */
export default function AudiencePostActivityHomeButton({ onClick, className }) {
  const { loading } = useAuth();
  const label = getAudiencePostActivityHomeLabel(getStoredAudienceSession(), loading);

  if (!label) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        aria-label="Loading"
        className={className}
      >
        <span className="inline-block min-h-[1.25em] w-44 max-w-full rounded bg-white/25 animate-pulse align-middle" />
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {label}
    </button>
  );
}
