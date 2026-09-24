import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  isActiveAudienceStudent,
  isActiveHostTeacher,
  setActivePortal,
} from '../../utils/userRoles';
import { persistAudienceSession } from '../../utils/audienceSession';

const HOST_HOME = '/host/explore';
const AUDIENCE_HOME = '/audience/home';

const restoreStudentSession = (userProfile) => {
  setActivePortal('student', userProfile?.uid);
  persistAudienceSession(userProfile);
};

/**
 * Sends a logged-in host away from public entry pages (landing, host auth, join).
 * When redirectStudent is set, also sends a logged-in student to /audience/home.
 * Activity/join routes omit that flag so students can still join sessions.
 * Uses replace so Back cannot return here.
 */
export default function RedirectIfHostTeacher({ children, redirectStudent = false }) {
  const { userProfile, activePortal, loading } = useAuth();
  const isHost = !loading && isActiveHostTeacher(userProfile, activePortal);
  const isStudent = !loading && isActiveAudienceStudent(userProfile, activePortal);

  useEffect(() => {
    if (isHost) {
      setActivePortal('teacher', userProfile?.uid);
    } else if (redirectStudent && isStudent) {
      restoreStudentSession(userProfile);
    }
  }, [isHost, isStudent, redirectStudent, userProfile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (isHost) {
    return <Navigate to={HOST_HOME} replace />;
  }

  if (redirectStudent && isStudent) {
    restoreStudentSession(userProfile);
    return <Navigate to={AUDIENCE_HOME} replace />;
  }

  return children;
}
