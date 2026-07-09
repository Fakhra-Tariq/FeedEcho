const VALID_ROLES = ['student', 'teacher', 'admin'];

const normalizeRoles = (user = {}) => {
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return [...new Set(user.roles.filter((r) => VALID_ROLES.includes(r)))];
  }
  if (user.role && VALID_ROLES.includes(user.role)) {
    return [user.role];
  }
  return [];
};

const hasRole = (user, role) => normalizeRoles(user).includes(role);

const formatUser = (uid, user = {}) => {
  const roles = normalizeRoles(user);
  return {
    uid,
    ...user,
    roles,
    role: user.role || roles[0] || null,
  };
};

const buildInitialRoles = (role) => {
  if (role === 'teacher') return ['teacher', 'student'];
  return [role];
};

module.exports = {
  VALID_ROLES,
  normalizeRoles,
  hasRole,
  formatUser,
  buildInitialRoles,
};
