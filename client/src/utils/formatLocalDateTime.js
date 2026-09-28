/**
 * Parse a stored timestamp as UTC, then let the caller format it in the
 * viewer's local timezone. ISO strings from the server include "Z".
 * A datetime with no zone suffix is also UTC (not local).
 */
export const parseUtcTimestamp = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw);
  const normalized = isDateTime && !hasZone ? `${raw}Z` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Same date/time parts the Space Race History page shows. */
export const formatSessionDate = (iso) => {
  const d = parseUtcTimestamp(iso);
  if (!d) return { date: '—', time: '—', timestamp: null };
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    timestamp: d,
  };
};
