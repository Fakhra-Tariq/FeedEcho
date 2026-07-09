const LOGGED_IN_KEY = 'loggedInStudent';

export const profileToStudentSession = (profile) => {
  if (!profile) return null;
  const displayName =
    profile.displayName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.email?.split('@')[0] ||
    'Student';

  return {
    uid: profile.uid,
    name: displayName,
    email: profile.email || '',
    username: profile.email || displayName,
    role: profile.role || 'student',
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
  };
};

export const persistStudentSession = (profile) => {
  const session = profileToStudentSession(profile);
  if (!session) return null;
  localStorage.setItem(LOGGED_IN_KEY, JSON.stringify(session));
  localStorage.setItem('feedecho_name', session.name);
  if (session.email) {
    localStorage.setItem('feedecho_email', session.email);
  }
  return session;
};

export const getStoredStudentSession = () => {
  try {
    const raw = localStorage.getItem(LOGGED_IN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearStudentSession = () => {
  localStorage.removeItem(LOGGED_IN_KEY);
};

export { getStudentQueryParams } from './studentIdentifiers';
