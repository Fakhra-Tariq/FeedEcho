export const ACTIVE_PORTAL_KEY = 'feedEcho_active_portal';
/** Last host/audience login for a specific Firebase uid — survives tab close. */
export const LAST_PORTAL_USER_KEY = 'feedEcho_last_portal';

const readAuthUserUid = () => {
  try {
    const raw = localStorage.getItem('authUser');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.uid || null;
  } catch {
    return null;
  }
};

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
 * A uid-keyed localStorage copy survives tab close so reload uses THIS user's
 * most recent login, never another account's leftover portal.
 */
export const setActivePortal = (portal, uid = null) => {
  if (!portal) return;
  try {
    sessionStorage.setItem(ACTIVE_PORTAL_KEY, portal);
    // Drop unkeyed leftover so it cannot be reused as a stale role
    localStorage.removeItem(ACTIVE_PORTAL_KEY);
    const resolvedUid = uid || readAuthUserUid();
    if (resolvedUid) {
      localStorage.setItem(
        LAST_PORTAL_USER_KEY,
        JSON.stringify({ uid: resolvedUid, portal })
      );
    }
  } catch {
    // ignore storage errors
  }
};

export const getActivePortal = () => {
  try {
    const fromSession = sessionStorage.getItem(ACTIVE_PORTAL_KEY);
    if (fromSession === 'teacher' || fromSession === 'student') return fromSession;
  } catch {
    // ignore
  }
  return null;
};

/** Restore this tab's portal from the last login recorded for `uid`. */
export const restoreActivePortalForUser = (uid) => {
  if (!uid) return getActivePortal();
  try {
    const fromSession = sessionStorage.getItem(ACTIVE_PORTAL_KEY);
    const raw = localStorage.getItem(LAST_PORTAL_USER_KEY);
    let stored = null;
    if (raw) {
      try {
        stored = JSON.parse(raw);
      } catch {
        stored = null;
      }
    }
    if (stored?.uid && stored.uid !== uid) {
      localStorage.removeItem(LAST_PORTAL_USER_KEY);
      stored = null;
    }
    if (fromSession === 'teacher' || fromSession === 'student') {
      return fromSession;
    }
    if (stored?.portal === 'teacher' || stored?.portal === 'student') {
      sessionStorage.setItem(ACTIVE_PORTAL_KEY, stored.portal);
      return stored.portal;
    }
    localStorage.removeItem(ACTIVE_PORTAL_KEY);
  } catch {
    // ignore
  }
  return null;
};

export const clearActivePortal = () => {
  try {
    sessionStorage.removeItem(ACTIVE_PORTAL_KEY);
    localStorage.removeItem(ACTIVE_PORTAL_KEY);
    localStorage.removeItem(LAST_PORTAL_USER_KEY);
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
 * Logged-in host for this tab: last login was host, or a teacher-only profile
 * with no student portal selected. Unset portal after a closed tab is NOT
 * treated as host when the account also has a student role.
 */
export const isActiveHostTeacher = (userProfile, activePortal = null) => {
  if (!userProfile || !canAccessTeacherPortal(userProfile)) return false;
  const portal = activePortal || resolveActivePortal();
  if (portal === 'student') return false;
  if (portal === 'teacher') return true;
  return !hasUserRole(userProfile, 'student');
};

/**
 * Logged-in audience for this tab: last login was student, or a student-only
 * profile. Dual-role accounts follow the restored last-login portal.
 */
export const isActiveAudienceStudent = (userProfile, activePortal = null) => {
  if (!userProfile) return false;
  if (isActiveHostTeacher(userProfile, activePortal)) return false;
  const portal = activePortal || resolveActivePortal();
  if (portal === 'student') return true;
  return hasUserRole(userProfile, 'student') && !canAccessTeacherPortal(userProfile);
};
