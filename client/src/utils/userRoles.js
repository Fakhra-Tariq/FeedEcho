export const ACTIVE_PORTAL_KEY = 'feedEcho_active_portal';

export const getUserRoles = (profile) => {
  if (!profile) return [];
  if (Array.isArray(profile.roles) && profile.roles.length > 0) {
    return profile.roles;
  }
  if (profile.role) return [profile.role];
  return [];
};

export const hasUserRole = (profile, role) => getUserRoles(profile).includes(role);

// Role values 'teacher' / 'student' are stored in Firebase/user profiles — do not rename.
export const canAccessTeacherPortal = (profile) =>
  hasUserRole(profile, 'teacher') || hasUserRole(profile, 'admin');

export const canAccessStudentPortal = (profile) =>
  hasUserRole(profile, 'student') || hasUserRole(profile, 'teacher') || hasUserRole(profile, 'admin');

/**
 * Active portal is stored in sessionStorage so host vs audience is per-tab.
 * Same email can be host in one tab and audience in another without conflating.
 * (Firebase auth is still shared; portal selection is what drives UI destinations.)
 */
export const setActivePortal = (portal) => {
  if (!portal) return;
  try {
    sessionStorage.setItem(ACTIVE_PORTAL_KEY, portal);
    // Drop legacy localStorage copy so other tabs don't inherit this portal
    localStorage.removeItem(ACTIVE_PORTAL_KEY);
  } catch {
    // ignore storage errors
  }
};

export const getActivePortal = () => {
  try {
    const fromSession = sessionStorage.getItem(ACTIVE_PORTAL_KEY);
    if (fromSession) return fromSession;

    // One-time migrate legacy localStorage portal into this tab
    const fromLocal = localStorage.getItem(ACTIVE_PORTAL_KEY);
    if (fromLocal) {
      sessionStorage.setItem(ACTIVE_PORTAL_KEY, fromLocal);
      localStorage.removeItem(ACTIVE_PORTAL_KEY);
      return fromLocal;
    }
  } catch {
    // ignore
  }
  return null;
};

export const clearActivePortal = () => {
  try {
    sessionStorage.removeItem(ACTIVE_PORTAL_KEY);
    localStorage.removeItem(ACTIVE_PORTAL_KEY);
  } catch {
    // ignore
  }
};

/**
 * Resolve which portal session is active for this tab.
 * Prefer explicit portal key; fall back to audience session presence only when
 * portal is unset (never assume host just because profile.role is teacher).
 */
export const resolveActivePortal = () => {
  const portal = getActivePortal();
  if (portal === 'teacher' || portal === 'student') return portal;

  try {
    // Legacy audience session keys (do not rename — stored contract)
    if (
      sessionStorage.getItem('loggedInStudent') ||
      sessionStorage.getItem('loggedInAudience') ||
      localStorage.getItem('loggedInStudent') ||
      localStorage.getItem('loggedInAudience')
    ) {
      return 'student';
    }
  } catch {
    // ignore
  }

  return null;
};

/**
 * Logged-in host for this tab: teacher/admin profile and not in an audience session.
 * Portal may be unset after a closed tab; do not treat that as a student.
 */
export const isActiveHostTeacher = (userProfile, activePortal = null) => {
  if (!userProfile || !canAccessTeacherPortal(userProfile)) return false;
  const portal = activePortal || resolveActivePortal();
  return portal !== 'student';
};

/**
 * Logged-in audience for this tab: student-only profile, or anyone already in
 * the student portal. Never true for a host teacher (portal may be unset after
 * a closed tab — that still counts as host, not student).
 */
export const isActiveAudienceStudent = (userProfile, activePortal = null) => {
  if (!userProfile) return false;
  if (isActiveHostTeacher(userProfile, activePortal)) return false;
  const portal = activePortal || resolveActivePortal();
  if (portal === 'student') return true;
  return hasUserRole(userProfile, 'student') && !canAccessTeacherPortal(userProfile);
};
