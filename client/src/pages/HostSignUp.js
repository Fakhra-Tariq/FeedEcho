import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import PasswordRulesChecklist from '../components/Auth/PasswordRulesChecklist';
import {
  isDisposableEmail,
  isEmailFormatValid,
  isPasswordValid,
  normalizeEmail,
} from '../utils/emailAuth';

const HostSignUp = () => {
  const navigate = useNavigate();
  const { hostSignUp, hostSignInWithGoogle } = useAuth();
  const { alert } = useHybridAlert();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const emailOk = isEmailFormatValid(email) && !isDisposableEmail(email);
  const passwordOk = isPasswordValid(password);
  const canSubmit = emailOk && passwordOk && firstName.trim() && lastName.trim();

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!isEmailFormatValid(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (isDisposableEmail(email)) {
      setFormError('Please use a permanent email address.');
      return;
    }
    if (!isPasswordValid(password)) {
      setFormError('Password is too weak. Follow the rules below.');
      return;
    }
    if (password !== confirmPassword) {
      alert.error('Passwords do not match');
      return;
    }

    setLoading(true);
    const result = await hostSignUp({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizeEmail(email),
      password,
    });
    setLoading(false);
    if (result?.success) {
      return;
    }
    setFormError(result?.error || 'Something went wrong. Please try again.');
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    const result = await hostSignInWithGoogle();
    setGoogleLoading(false);
    if (result?.success) navigate('/host');
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 bg-background overflow-x-hidden max-w-full">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Host Sign Up</h1>
        <p className="text-text-light mb-6">Create your host account to continue.</p>

        {formError ? (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" aria-live="polite">
            <p className="text-sm text-red-600">{formError}</p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="host-first-name" className="block text-sm font-medium text-text-light mb-2">
                First name
              </label>
              <input
                id="host-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="host-last-name" className="block text-sm font-medium text-text-light mb-2">
                Last name
              </label>
              <input
                id="host-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="host-signup-email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="host-signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label htmlFor="host-signup-password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="host-signup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full min-h-11 px-3 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordRulesChecklist password={password} />
          </div>

          <div>
            <label htmlFor="host-signup-confirm" className="block text-sm font-medium text-gray-700 mb-2">
              Re-enter password
            </label>
            <input
              id="host-signup-confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full min-h-11 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium py-3 rounded-lg"
          >
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-text-light">OR</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={googleLoading}
          className="w-full min-h-11 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-text font-medium py-3 rounded-lg"
        >
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="mt-4 text-sm">
          <Link to="/host/signin" className="inline-flex items-center min-h-11 text-primary hover:text-primary-dark font-medium">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HostSignUp;
