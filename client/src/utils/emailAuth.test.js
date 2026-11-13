import {
  getPasswordRuleStatus,
  isDisposableEmail,
  isPasswordValid,
  mapAuthError,
  needsEmailVerification,
  EMAIL_VERIFICATION_REQUIRED_FROM,
} from './emailAuth';

describe('password rules', () => {
  it('requires 8 chars, upper, lower, and a listed special character', () => {
    expect(isPasswordValid('Abcdef1')).toBe(false);
    expect(isPasswordValid('abcdefgh!')).toBe(false);
    expect(isPasswordValid('ABCDEFGH!')).toBe(false);
    expect(isPasswordValid('Abcdefgh ')).toBe(false);
    expect(isPasswordValid('Abcdefg!')).toBe(true);
  });

  it('treats space as not special', () => {
    expect(getPasswordRuleStatus('Abcdefg ').special).toBe(false);
  });
});

describe('disposable email', () => {
  it('flags known throwaway domains', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@gmail.com')).toBe(false);
  });
});

describe('mapAuthError', () => {
  it('never uses incorrect password on signup', () => {
    expect(mapAuthError({ code: 'auth/wrong-password' }, { context: 'signup' })).not.toMatch(
      /incorrect password/i
    );
    expect(mapAuthError({ code: 'auth/email-already-in-use' }, { context: 'signup' })).toBe(
      'An account with this email already exists. Try logging in.'
    );
    expect(mapAuthError({ code: 'auth/network-request-failed' }, { context: 'signup' })).toBe(
      'Network problem. Check your connection and try again.'
    );
  });

  it('uses a generic login message', () => {
    expect(mapAuthError({ code: 'auth/invalid-credential' }, { context: 'login' })).toBe(
      'Incorrect email or password.'
    );
  });
});

describe('needsEmailVerification', () => {
  it('grandfathers accounts created before the cutoff', () => {
    const user = {
      emailVerified: false,
      providerData: [{ providerId: 'password' }],
      metadata: { creationTime: '2020-01-01T00:00:00.000Z' },
    };
    expect(needsEmailVerification(user)).toBe(false);
  });

  it('requires verification for new password users after the cutoff', () => {
    expect(EMAIL_VERIFICATION_REQUIRED_FROM).toBe('2026-11-12T06:15:00.000Z');
    const user = {
      emailVerified: false,
      providerData: [{ providerId: 'password' }],
      metadata: { creationTime: '2026-11-12T07:00:00.000Z' },
    };
    expect(needsEmailVerification(user)).toBe(true);
  });

  it('skips Google-only users', () => {
    const user = {
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
      metadata: { creationTime: '2026-11-12T07:00:00.000Z' },
    };
    expect(needsEmailVerification(user)).toBe(false);
  });
});
