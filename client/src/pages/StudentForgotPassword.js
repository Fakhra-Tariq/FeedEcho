import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const StudentForgotPassword = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setError('');
    setMessage('');

    const result = await resetPassword(email.trim());
    if (result?.success) {
      setMessage('Password reset email sent. Check your inbox.');
    } else {
      setError(result?.error || 'Failed to send reset email.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 bg-background">
      <div className="w-full max-w-md mb-4">
        <Link
          to="/student/auth"
          className="inline-flex items-center text-sm text-text-light hover:text-primary transition-colors"
        >
          Back to Login
        </Link>
      </div>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Reset Password</h1>
        <p className="text-text-light mb-6">Enter your email and we will send you a reset link.</p>

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-600">{message}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-light mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentForgotPassword;
