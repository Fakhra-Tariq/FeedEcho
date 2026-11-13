import React, { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../../contexts/AuthContext';
import { mapAuthError } from '../../utils/emailAuth';

const COOLDOWN_SEC = 60;

export default function VerifyEmailScreen() {
  const { user, logout, refreshAuthUser } = useAuth();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SEC);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setInterval(() => {
      setCooldown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const onContinue = async () => {
    setError('');
    setStatus('');
    setChecking(true);
    try {
      const verified = await refreshAuthUser();
      if (!verified) {
        setStatus('Not verified yet');
      }
    } catch (err) {
      setError(mapAuthError(err, { context: 'signup' }));
    } finally {
      setChecking(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0 || !user) return;
    setError('');
    setStatus('');
    setResending(true);
    try {
      const continueUrl = `${window.location.origin}/join`;
      await sendEmailVerification(user, { url: continueUrl });
      setStatus('Verification email sent.');
      setCooldown(COOLDOWN_SEC);
    } catch (err) {
      setError(mapAuthError(err, { context: 'signup' }));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 bg-background overflow-x-hidden max-w-full">
      <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Verify your email</h1>
        <p className="text-text-light mb-6 break-words">
          We sent a verification link to <span className="font-medium text-text">{user?.email}</span>
          . Open it, then come back.
        </p>

        <div className="space-y-2" aria-live="polite">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
          {status ? (
            <p className="text-sm text-text-light">{status}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={checking}
          className="mt-4 w-full min-h-11 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium py-3 rounded-lg"
        >
          {checking ? 'Checking…' : "I've verified, continue"}
        </button>

        <button
          type="button"
          onClick={onResend}
          disabled={resending || cooldown > 0}
          className="mt-3 w-full min-h-11 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-text font-medium py-3 rounded-lg"
        >
          {cooldown > 0 ? `Resend email (${cooldown}s)` : resending ? 'Sending…' : 'Resend email'}
        </button>

        <button
          type="button"
          onClick={() => logout()}
          className="mt-6 w-full min-h-11 text-sm text-primary hover:text-primary-dark font-medium"
        >
          Wrong email? Sign out
        </button>
      </div>
    </div>
  );
}
