import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PasswordRulesChecklist from '../components/Auth/PasswordRulesChecklist';
import {
  isDisposableEmail,
  isEmailFormatValid,
  isPasswordValid,
  normalizeEmail,
} from '../utils/emailAuth';

const AudienceSignup = () => {
  const navigate = useNavigate();
  const { audienceSignUp, audienceSignInWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const emailOk = isEmailFormatValid(email) && !isDisposableEmail(email);
  const passwordOk = isPasswordValid(password);
  const canSubmit = emailOk && passwordOk && fullName.trim();

  const validateForm = () => {
    const newErrors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!isEmailFormatValid(email)) {
      newErrors.email = 'Please enter a valid email address.';
    } else if (isDisposableEmail(email)) {
      newErrors.email = 'Please use a permanent email address.';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (!isPasswordValid(password)) {
      newErrors.password = 'Password is too weak. Follow the rules below.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || !validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    try {
      const result = await audienceSignUp({
        firstName,
        lastName,
        email: normalizeEmail(email),
        password,
      });

      if (!result?.success) {
        setErrors({ general: result?.error || 'Something went wrong. Please try again.' });
      }
    } catch (error) {
      setErrors({ general: 'Something went wrong. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogle = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setGoogleLoading(true);
    setErrors({});

    try {
      const result = await audienceSignInWithGoogle();
      if (result?.success) {
        navigate('/audience/home');
      } else {
        setErrors({ general: result?.error || 'Google sign-in failed. Please try again.' });
      }
    } catch (error) {
      setErrors({ general: 'Google sign-in failed. Please try again.' });
    } finally {
      setGoogleLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 bg-background overflow-x-hidden max-w-full">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Audience Sign Up</h1>
        <p className="text-text-light mb-6">Create your audience account.</p>

        {errors.general && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" aria-live="polite">
            <p className="text-sm text-red-600">{errors.general}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="audience-full-name" className="block text-sm font-medium text-text-light mb-2">
              Full Name
            </label>
            <input
              id="audience-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your full name"
              required
            />
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
            )}
          </div>

          <div>
            <label htmlFor="audience-signup-email" className="block text-sm font-medium text-text-light mb-2">
              Email
            </label>
            <input
              id="audience-signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your email"
              required
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="audience-signup-password" className="block text-sm font-medium text-text-light mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="audience-signup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full min-h-11 px-3 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Create a password"
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
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label htmlFor="audience-signup-confirm" className="block text-sm font-medium text-text-light mb-2">
              Confirm Password
            </label>
            <input
              id="audience-signup-confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full min-h-11 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Confirm your password"
              required
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="w-full min-h-11 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors duration-200 flex items-center justify-center"
          >
            {isSubmitting && !googleLoading ? 'Creating account...' : 'Create Account'}
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
          disabled={googleLoading || isSubmitting}
          className="w-full min-h-11 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-text font-medium py-3 rounded-lg transition-colors duration-200 flex items-center justify-center"
        >
          {googleLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="mt-4 text-center text-sm">
          Already have an account?{' '}
          <Link to="/join" className="text-primary hover:text-primary-dark font-medium">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AudienceSignup;
