import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const TeacherForgotPassword = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await resetPassword(email.trim());
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Reset Password</h1>
        <p className="text-text-light mb-6">We will send a reset link to your email.</p>

        <form onSubmit={onSubmit} className="space-y-4">
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
            {loading ? 'Sending...' : 'Send reset email'}
          </button>
        </form>

        <div className="mt-4 text-sm">
          <Link to="/teacher/signin" className="text-primary hover:text-primary-dark font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TeacherForgotPassword;
