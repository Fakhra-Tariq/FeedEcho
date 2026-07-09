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

export const canAccessTeacherPortal = (profile) =>
  hasUserRole(profile, 'teacher') || hasUserRole(profile, 'admin');

export const canAccessStudentPortal = (profile) =>
  hasUserRole(profile, 'student') || hasUserRole(profile, 'teacher') || hasUserRole(profile, 'admin');

export const setActivePortal = (portal) => {
  if (portal) localStorage.setItem(ACTIVE_PORTAL_KEY, portal);
};

export const getActivePortal = () => localStorage.getItem(ACTIVE_PORTAL_KEY);

export const clearActivePortal = () => localStorage.removeItem(ACTIVE_PORTAL_KEY);
