/**
 * Normalize sessions/{id}.currentActivity (string or legacy object) for UI.
 * @returns {string|null} quiz | spacerace | exitticket | livechat
 */
export function normalizeSessionCurrentActivity(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value.type) {
    const t = String(value.type).toLowerCase().replace(/_/g, '');
    if (t === 'quiz') return 'quiz';
    if (t === 'spacerace') return 'spacerace';
    if (t === 'exitticket') return 'exitticket';
    if (t === 'livechat' || t === 'anonymouschat') return 'livechat';
    return t || null;
  }
  const s = String(value).toLowerCase().replace(/_/g, '');
  return s || null;
}

/**
 * Human-readable label for the Explore session bar.
 * @returns {string|null} e.g. "Quiz Active", or null when idle
 */
export function getSessionActivityLabel(currentActivity) {
  const kind = normalizeSessionCurrentActivity(currentActivity);
  if (!kind) return null;

  switch (kind) {
    case 'quiz':
      return 'Quiz Active';
    case 'spacerace':
      return 'Space Race Active';
    case 'exitticket':
      return 'Exit Ticket Active';
    case 'livechat':
      return 'Live Chat Active';
    default:
      return null;
  }
}

const ACTIVITY_HISTORY_TYPE_LABELS = {
  quiz: 'Quiz',
  spacerace: 'Space Race',
  exitticket: 'Exit Ticket',
  livechat: 'Live Chat',
};

/**
 * Display line for session history, e.g. "Quiz: Maths Chapter 3"
 */
export function formatSessionActivityHistoryLine(entry) {
  if (!entry) return '';
  const kind =
    normalizeSessionCurrentActivity(entry.type) ||
    String(entry.type || '').toLowerCase().replace(/_/g, '');
  const label = ACTIVITY_HISTORY_TYPE_LABELS[kind] || 'Activity';
  const name = String(entry.name || '').trim() || 'Untitled';
  return `${label}: ${name}`;
}

export function parseSessionActivities(session) {
  const raw = session?.activities ?? session?.activityHistory;
  if (!raw || typeof raw !== 'object') return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) =>
      String(b.launchedAt || '').localeCompare(String(a.launchedAt || ''))
    );
}
