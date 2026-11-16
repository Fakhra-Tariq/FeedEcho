import { ACTIVITY_IN_USE_MESSAGE } from './requireActiveHostSession';

const BLOCKED_NEEDLE = 'another activity is already active';

/** Display names used in the blocked-launch toast, matching the session banner. */
export const ACTIVITY_KIND_LABELS = {
  quiz: 'Quiz',
  spacerace: 'Space Race',
  exitticket: 'Exit Ticket',
  livechat: 'Live Chat',
  anonymouschat: 'Live Chat',
};

function normalizeKind(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_\s-]/g, '');
}

export function labelForActivityKind(kind) {
  return ACTIVITY_KIND_LABELS[normalizeKind(kind)] || null;
}

export function formatActiveActivityBlockedMessage(activityName) {
  const label = String(activityName || '').trim();
  if (!label) return ACTIVITY_IN_USE_MESSAGE;
  return `Another activity is already active (${label}). Please finish the current activity before launching a new one.`;
}

export function getLaunchErrorRawMessage(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  return String(
    error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      ''
  );
}

export function extractActiveActivityName(error) {
  const data = typeof error === 'object' && error ? error.response?.data : null;
  const fromField =
    data?.activeActivityType ||
    data?.activeActivity ||
    data?.currentActivityType ||
    (typeof data?.currentActivity === 'object' ? data.currentActivity?.type : data?.currentActivity);
  const labeled = labelForActivityKind(fromField);
  if (labeled) return labeled;

  const raw = getLaunchErrorRawMessage(error);
  const bracket = raw.match(/another activity is already active\s*\(([^)]+)\)/i);
  if (bracket) {
    const inner = bracket[1].trim();
    return labelForActivityKind(inner) || inner;
  }
  return null;
}

export function isActiveActivityBlockedError(error) {
  const data = typeof error === 'object' && error ? error.response?.data : null;
  const code = data?.code || data?.errorCode;
  if (code && /activity/i.test(String(code)) && /active|in[_-]?use/i.test(String(code))) {
    return true;
  }
  return getLaunchErrorRawMessage(error).toLowerCase().includes(BLOCKED_NEEDLE);
}

export function getActiveActivityBlockedMessage(error) {
  return formatActiveActivityBlockedMessage(extractActiveActivityName(error));
}

/**
 * Toast copy for a failed host launch.
 * Blocked-by-another-activity always uses the Quiz Library sentence (no Error: prefix).
 */
export function getLaunchErrorToastMessage(error, fallback = 'Failed to launch activity', options = {}) {
  if (isActiveActivityBlockedError(error)) {
    return getActiveActivityBlockedMessage(error);
  }
  const raw = getLaunchErrorRawMessage(error) || fallback;
  if (options.crashStyle) {
    return `Error: ${raw}\n\nCheck browser console for more details.`;
  }
  if (options.prefix) {
    return `${options.prefix}${raw}`;
  }
  return raw;
}

/** @returns {boolean} true when this was the one-activity-at-a-time block */
export function showHostLaunchErrorToast(toast, error, options = {}) {
  const blocked = isActiveActivityBlockedError(error);
  toast.error(getLaunchErrorToastMessage(error, options.fallback, options));
  return blocked;
}
