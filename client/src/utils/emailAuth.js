/**
 * Email/password signup helpers (Web).
 *
 * EMAIL_VERIFICATION_REQUIRED_FROM: email/password accounts whose Firebase
 * metadata.creationTime is on or after this instant must verify email before
 * using dashboards. Older unverified accounts are grandfathered.
 * Change this ISO timestamp if you need a different cutoff.
 */
export const EMAIL_VERIFICATION_REQUIRED_FROM = '2026-11-12T06:15:00.000Z';

export const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
];

const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|~`]/;
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isEmailFormatValid(email) {
  return EMAIL_FORMAT_RE.test(normalizeEmail(email));
}

export function isDisposableEmail(email) {
  const normalized = normalizeEmail(email);
  const domain = normalized.split('@')[1] || '';
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

export function getPasswordRuleStatus(password) {
  const value = String(password || '');
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    special: SPECIAL_CHAR_RE.test(value),
  };
}

export function isPasswordValid(password) {
  const rules = getPasswordRuleStatus(password);
  return rules.minLength && rules.uppercase && rules.lowercase && rules.special;
}

export function getPasswordRuleError(password) {
  if (isPasswordValid(password)) return '';
  return 'Password is too weak. Follow the rules below.';
}

function hasGoogleProvider(user) {
  return Boolean(user?.providerData?.some((p) => p.providerId === 'google.com'));
}

function hasPasswordProvider(user) {
  return Boolean(user?.providerData?.some((p) => p.providerId === 'password'));
}

/**
 * Google-only users skip the gate. Email/password users created at/after the
 * cutoff must verify. Legacy accounts keep working.
 */
export function needsEmailVerification(user) {
  if (!user) return false;
  if (user.emailVerified) return false;
  if (hasGoogleProvider(user) && !hasPasswordProvider(user)) return false;
  if (!hasPasswordProvider(user)) return false;
  const created = user.metadata?.creationTime;
  if (!created) return false;
  const createdMs = Date.parse(created);
  const cutoffMs = Date.parse(EMAIL_VERIFICATION_REQUIRED_FROM);
  if (!Number.isFinite(createdMs) || !Number.isFinite(cutoffMs)) return false;
  if (createdMs < cutoffMs) return false;
  return true;
}

export function mapAuthError(error, { context = 'login' } = {}) {
  const code = error?.code || '';
  if (code && code !== 'auth/email-already-in-use' && context === 'signup') {
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/user-not-found'
    ) {
      console.error('Unexpected Auth error on signup:', code, error);
      return 'Something went wrong. Please try again.';
    }
  }

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try logging in.';
    case 'auth/disposable-email':
      return 'Please use a permanent email address.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Follow the rules below.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a bit and try again.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      if (context === 'login') return 'Incorrect email or password.';
      console.error('Unexpected Auth error:', code, error);
      return 'Something went wrong. Please try again.';
    default:
      if (code) console.error('Auth error:', code, error);
      else if (error) console.error('Auth error:', error);
      return 'Something went wrong. Please try again.';
  }
}
