/**
 * Coerce Firebase participant fields to a safe numeric count for JSX.
 * RTDB sometimes stores participants as a push-ID map instead of a number.
 */
export function toParticipantCount(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
  }
  return 0;
}
