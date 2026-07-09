import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ClipLoader } from 'react-spinners';
import { canAccessTeacherPortal } from '../../utils/userRoles';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <ClipLoader color="#7C3AED" size={50} />
          <p className="mt-4 text-text-light">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to="/login" replace />;
  }

  const isAllowed =
    !requiredRole ||
    (requiredRole === 'teacher'
      ? canAccessTeacherPortal(userProfile)
      : userProfile.role === requiredRole || userProfile.role === 'admin');

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-white rounded-2xl shadow-soft-lg max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Access Denied</h2>
          <p className="text-text-light mb-6">
            You don't have permission to access this page. This area requires {requiredRole} privileges.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
