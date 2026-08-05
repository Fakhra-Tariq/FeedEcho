import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';

const HostSignUp = () => {
  const navigate = useNavigate();
  const { hostSignUp, hostSignInWithGoogle } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert.toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    const result = await hostSignUp({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password
    });
    setLoading(false);
    if (result?.success) navigate('/host');
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    const result = await hostSignInWithGoogle();
    setGoogleLoading(false);
    if (result?.success) navigate('/host');
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Host Sign Up</h1>
        <p className="text-text-light mb-6">Create your host account to continue.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-light mb-2">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-light mb-2">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Re-enter password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
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
          className="w-full border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-text font-medium py-2.5 rounded-lg"
        >
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="mt-4 text-sm">
          <Link to="/host/signin" className="text-primary hover:text-primary-dark font-medium">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HostSignUp;
