// Stored session key — keep legacy name to avoid breaking existing logins
const LOGGED_IN_KEY = 'loggedInStudent';
const LOGGED_IN_KEY_ALT = 'loggedInAudience';

const readRawSession = () => {
  try {
    const fromSession =
      sessionStorage.getItem(LOGGED_IN_KEY) ||
      sessionStorage.getItem(LOGGED_IN_KEY_ALT);
    if (fromSession) return fromSession;

    // Migrate legacy localStorage session into this tab only
    const fromLocal =
      localStorage.getItem(LOGGED_IN_KEY) ||
      localStorage.getItem(LOGGED_IN_KEY_ALT);
    if (fromLocal) {
      sessionStorage.setItem(LOGGED_IN_KEY, fromLocal);
      localStorage.removeItem(LOGGED_IN_KEY);
      localStorage.removeItem(LOGGED_IN_KEY_ALT);
      return fromLocal;
    }
  } catch {
    // ignore
  }
  return null;
};

export const profileToAudienceSession = (profile) => {
  if (!profile) return null;
  const displayName =
    profile.displayName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.email?.split('@')[0] ||
    'Audience';

  return {
    uid: profile.uid,
    name: displayName,
    email: profile.email || '',
    username: profile.email || displayName,
    // role value 'student' is stored in Firebase profiles — do not rename
    role: profile.role || 'student',
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
  };
};

export const persistAudienceSession = (profile) => {
  const session = profileToAudienceSession(profile);
  if (!session) return null;
  const raw = JSON.stringify(session);
  try {
    // Tab-scoped so host login in another tab does not wipe audience session
    sessionStorage.setItem(LOGGED_IN_KEY, raw);
    localStorage.removeItem(LOGGED_IN_KEY);
    localStorage.removeItem(LOGGED_IN_KEY_ALT);
  } catch {
    // ignore
  }
  localStorage.setItem('feedecho_name', session.name);
  if (session.email) {
    localStorage.setItem('feedecho_email', session.email);
  }
  return session;
};

export const getStoredAudienceSession = () => {
  try {
    const raw = readRawSession();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearAudienceSession = () => {
  try {
    sessionStorage.removeItem(LOGGED_IN_KEY);
    sessionStorage.removeItem(LOGGED_IN_KEY_ALT);
    localStorage.removeItem(LOGGED_IN_KEY);
    localStorage.removeItem(LOGGED_IN_KEY_ALT);
  } catch {
    // ignore
  }
};

export { getStudentQueryParams } from './audienceIdentifiers';
