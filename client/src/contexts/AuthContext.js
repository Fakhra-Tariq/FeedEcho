import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { appToast as toast } from './HybridAlertContext';
import { authAPI } from '../services/api';
import { persistStudentSession, clearStudentSession, getStoredStudentSession } from '../utils/studentSession';
import { schedulePendingQuizSubmissionSync } from '../utils/quizSubmissionSync';
import {
  canAccessStudentPortal,
  canAccessTeacherPortal,
  setActivePortal,
  clearActivePortal,
  getActivePortal,
} from '../utils/userRoles';

const isFirebaseOnly = process.env.REACT_APP_FIREBASE_ONLY === 'true';

const ROLE_STORAGE_KEY = 'feedEcho_role';
const LEGACY_ROLE_STORAGE_KEY = 'learneXa_role';

const readStoredRole = () =>
  localStorage.getItem(ROLE_STORAGE_KEY) ||
  localStorage.getItem(LEGACY_ROLE_STORAGE_KEY) ||
  'student';

const persistRole = (role) => {
  if (role) localStorage.setItem(ROLE_STORAGE_KEY, role);
};

const buildProfileFromFirebase = (firebaseUser, roleFallback = 'student') => {
  const displayName = firebaseUser?.displayName || '';
  const [firstName, ...rest] = displayName.split(' ').filter(Boolean);
  const lastName = rest.join(' ');
  return {
    uid: firebaseUser?.uid,
    email: firebaseUser?.email || '',
    firstName: firstName || firebaseUser?.email?.split('@')[0] || 'User',
    lastName: lastName || '',
    role: roleFallback,
  };
};

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('token', token);
          if (isFirebaseOnly) {
            // In Firebase-only mode, synthesize profile directly
            const role = readStoredRole();
            setUserProfile(buildProfileFromFirebase(firebaseUser, role));
          } else {
            // Get user profile from backend
            const profileResponse = await authAPI.getProfile(token);
            const profile = profileResponse.data.user;
            setUserProfile({
              ...profile,
              uid: profile?.uid || firebaseUser.uid,
            });
            
            // Store user profile in localStorage for API access
            localStorage.setItem('authUser', JSON.stringify({
              uid: profile.uid || firebaseUser.uid,
              email: profile.email || firebaseUser.email
            }));

            if (canAccessStudentPortal(profile) && (getActivePortal() === 'student' || getStoredStudentSession())) {
              persistStudentSession(profile);
              schedulePendingQuizSubmissionSync();
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const token = await result.user.getIdToken();
      localStorage.setItem('token', token);
      if (isFirebaseOnly) {
        const role = readStoredRole();
        const profile = buildProfileFromFirebase(result.user, role);
        setUserProfile(profile);
        
        // Store user profile in localStorage for API access
        localStorage.setItem('authUser', JSON.stringify({
          uid: result.user.uid,
          email: result.user.email
        }));
        
        toast.success('Welcome back to FeedEcho!');
        return { success: true, user: profile };
      }

      const profileResponse = await authAPI.login(token);
      const loggedIn = profileResponse.data.user;
      setUserProfile({
        ...loggedIn,
        uid: loggedIn?.uid || result.user.uid,
      });
      
      toast.success('Welcome back to FeedEcho!');
      const normalizedLogin = { ...loggedIn, uid: loggedIn?.uid || result.user.uid };
      return { success: true, user: normalizedLogin };
    } catch (error) {
      let errorMessage = 'Login failed';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Account has been disabled';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        default:
          errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const syncProfileFromBackend = async (firebaseUser, role, firstName, lastName, { mergeRole = false } = {}) => {
    const token = await firebaseUser.getIdToken();
    localStorage.setItem('token', token);

    if (isFirebaseOnly) {
      const profile = buildProfileFromFirebase(firebaseUser, role || 'student');
      setUserProfile(profile);
      persistRole(profile.role);
      return profile;
    }

    try {
      await authAPI.ensureProfile({
        idToken: token,
        role,
        firstName,
        lastName,
        mergeRole,
      });
      const loginResponse = await authAPI.login(token);
      const u = loginResponse.data.user;
      const normalized = { ...u, uid: u?.uid || firebaseUser.uid };
      setUserProfile(normalized);
      return normalized;
    } catch (error) {
      console.error('Backend sync error:', error);

      if (error.code === 'NETWORK_ERROR' || !error.response) {
        console.warn('Backend unavailable, using Firebase-only mode');
        const profile = buildProfileFromFirebase(firebaseUser, role || 'student');
        setUserProfile(profile);
        persistRole(profile.role);
        return profile;
      }

      throw error;
    }
  };

  const createAccountOrSignIn = async (email, password, displayName) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }
      return result.user;
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
      }
      throw error;
    }
  };

  const teacherSignIn = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const profile = await syncProfileFromBackend(result.user, 'teacher', undefined, undefined, {
        mergeRole: false,
      });

      if (!canAccessTeacherPortal(profile)) {
        await signOut(auth);
        localStorage.removeItem('token');
        localStorage.removeItem('authUser');
        const errorMessage =
          'This account does not have teacher access. Sign up as a teacher or use the student login.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('teacher');
      clearStudentSession();
      toast.success('Welcome back!');
      return { success: true, user: profile };
    } catch (error) {
      let errorMessage = 'Login failed';
      
      // Handle Firebase auth errors
      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address';
            break;
          case 'auth/user-disabled':
            errorMessage = 'Account has been disabled';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection';
            break;
          default:
            errorMessage = error.message || 'Login failed';
        }
      } else if (error.request && !error.response) {
        // Network error (no response received)
        errorMessage = 'Server is not responding. Please check your internet connection.';
      } else {
        errorMessage = error?.message || 'Login failed';
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const teacherSignUp = async ({ firstName, lastName, email, password }) => {
    try {
      const firebaseUser = await createAccountOrSignIn(
        email,
        password,
        `${firstName} ${lastName}`.trim()
      );
      const profile = await syncProfileFromBackend(
        firebaseUser,
        'teacher',
        firstName,
        lastName,
        { mergeRole: true }
      );

      if (!canAccessTeacherPortal(profile)) {
        const errorMessage = 'Could not enable teacher access for this account.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('teacher');
      clearStudentSession();
      toast.success('Account created successfully');
      return { success: true, user: profile };
    } catch (error) {
      const errorMessage = error?.message || 'Signup failed';
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const studentSignIn = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const profile = await syncProfileFromBackend(result.user, 'student', undefined, undefined, {
        mergeRole: true,
      });

      if (!canAccessStudentPortal(profile)) {
        await signOut(auth);
        localStorage.removeItem('token');
        localStorage.removeItem('authUser');
        const errorMessage =
          'This account does not have student access. Sign up as a student first.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('student');
      persistRole('student');
      persistStudentSession(profile);
      toast.success('Welcome back!');
      return { success: true, user: profile };
    } catch (error) {
      let errorMessage = 'Login failed';

      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address';
            break;
          case 'auth/user-disabled':
            errorMessage = 'Account has been disabled';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection';
            break;
          default:
            errorMessage = error.message || 'Login failed';
        }
      } else if (error.request && !error.response) {
        errorMessage = 'Server is not responding. Please check your internet connection.';
      } else {
        errorMessage = error?.message || 'Login failed';
      }

      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const studentSignUp = async ({ firstName, lastName, email, password }) => {
    try {
      const firebaseUser = await createAccountOrSignIn(
        email,
        password,
        `${firstName} ${lastName}`.trim()
      );
      const profile = await syncProfileFromBackend(
        firebaseUser,
        'student',
        firstName,
        lastName,
        { mergeRole: true }
      );

      if (!canAccessStudentPortal(profile)) {
        const errorMessage = 'Could not enable student access for this account.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('student');
      persistRole('student');
      persistStudentSession(profile);
      toast.success('Account created successfully');
      return { success: true, user: profile };
    } catch (error) {
      const errorMessage = error?.message || 'Signup failed';
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const studentLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      localStorage.removeItem('token');
      localStorage.removeItem('authUser');
      clearStudentSession();
      clearActivePortal();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Error logging out');
      console.error('Student logout error:', error);
    }
  };

  const teacherSignInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const profile = await syncProfileFromBackend(result.user, 'teacher', undefined, undefined, {
        mergeRole: true,
      });

      if (!canAccessTeacherPortal(profile)) {
        const errorMessage = 'This Google account does not have teacher access.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('teacher');
      clearStudentSession();
      toast.success('Signed in with Google');
      return { success: true, user: profile };
    } catch (error) {
      let errorMessage = 'Google sign-in failed';
      
      // Handle Firebase auth errors
      if (error.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'Sign-in popup was closed';
            break;
          case 'auth/popup-blocked':
            errorMessage = 'Sign-in popup was blocked by the browser';
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = 'Sign-in was cancelled';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection';
            break;
          default:
            errorMessage = error.message || 'Google sign-in failed';
        }
      } else if (error.request && !error.response) {
        // Network error (no response received)
        errorMessage = 'Server is not responding. Please check your internet connection.';
      } else {
        errorMessage = error?.message || 'Google sign-in failed';
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const studentSignInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const profile = await syncProfileFromBackend(result.user, 'student', undefined, undefined, {
        mergeRole: true,
      });

      if (!canAccessStudentPortal(profile)) {
        const errorMessage = 'This Google account does not have student access.';
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      setActivePortal('student');
      persistRole('student');
      persistStudentSession(profile);
      toast.success('Signed in with Google');
      return { success: true, user: profile };
    } catch (error) {
      let errorMessage = 'Google sign-in failed';

      if (error.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'Sign-in popup was closed';
            break;
          case 'auth/popup-blocked':
            errorMessage = 'Sign-in popup was blocked by the browser';
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = 'Sign-in was cancelled';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection';
            break;
          default:
            errorMessage = error.message || 'Google sign-in failed';
        }
      } else if (error.request && !error.response) {
        errorMessage = 'Server is not responding. Please check your internet connection.';
      } else {
        errorMessage = error?.message || 'Google sign-in failed';
      }

      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const register = async (userData) => {
    try {
      const { email, password, firstName, lastName, role } = userData;
      
      // Create user in Firebase Auth
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update display name
      await updateProfile(result.user, {
        displayName: `${firstName} ${lastName}`
      });

      // Register user in backend
      const token = await result.user.getIdToken();
      localStorage.setItem('token', token);
      const response = await authAPI.register({
        email,
        password,
        firstName,
        lastName,
        role
      });

      const created = response.data.user;
      const normalized = { ...created, uid: created?.uid || result.user.uid };
      setUserProfile(normalized);
      toast.success('Account created successfully!');
      return { success: true, user: normalized };
    } catch (error) {
      let errorMessage = 'Registration failed';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email already registered';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        default:
          errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      localStorage.removeItem('token');
      localStorage.removeItem('authUser');
      clearActivePortal();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Error logging out');
      console.error('Logout error:', error);
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent');
      return { success: true };
    } catch (error) {
      let errorMessage = 'Failed to send reset email';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        default:
          errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const updateUserProfile = async (updateData) => {
    try {
      if (!user) throw new Error('No authenticated user');

      const token = await user.getIdToken();
      const response = await authAPI.updateProfile(updateData, token);
      const updated = response.data?.user;
      if (!updated) {
        throw new Error('Profile update response missing user data');
      }

      setUserProfile({
        ...updated,
        uid: updated?.uid || user.uid,
      });

      // Firebase Auth profile sync is best-effort — RTDB is the source of truth.
      try {
        const firebaseProfileUpdate = {};
        if (updateData.firstName || updateData.lastName !== undefined) {
          const displayName = `${updateData.firstName || userProfile?.firstName || ''} ${updateData.lastName ?? userProfile?.lastName ?? ''}`.trim();
          if (displayName) firebaseProfileUpdate.displayName = displayName;
        }
        const image = updateData.profileImage;
        if (image !== undefined && image && !String(image).startsWith('data:')) {
          firebaseProfileUpdate.photoURL = image;
        } else if (image === '') {
          firebaseProfileUpdate.photoURL = null;
        }
        if (Object.keys(firebaseProfileUpdate).length > 0 && auth.currentUser) {
          await updateProfile(auth.currentUser, firebaseProfileUpdate);
        }
      } catch (syncError) {
        console.warn('Firebase Auth profile sync skipped:', syncError);
      }

      toast.success('Profile updated successfully');
      return { success: true, user: { ...updated, uid: updated?.uid || user.uid } };
    } catch (error) {
      toast.error('Failed to update profile');
      return { success: false, error: error.message };
    }
  };

  const changeUserPassword = async (currentPassword, newPassword) => {
    try {
      if (!user) throw new Error('No authenticated user');

      const hasPasswordProvider = user.providerData?.some(
        (provider) => provider.providerId === 'password'
      );
      if (!hasPasswordProvider) {
        return {
          success: false,
          error: 'Password change is not available for accounts signed in with Google.',
        };
      }

      if (!user.email) {
        return { success: false, error: 'No email associated with this account.' };
      }

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      toast.success('Password updated successfully');
      return { success: true };
    } catch (error) {
      let errorMessage = 'Failed to update password';
      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Current password is incorrect';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password must be at least 8 characters';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many attempts. Please try again later.';
          break;
        default:
          errorMessage = error.message || errorMessage;
      }
      return { success: false, error: errorMessage };
    }
  };

  const value = {
    user,
    userProfile,
    loading,
    login,
    register,
    teacherSignIn,
    teacherSignUp,
    teacherSignInWithGoogle,
    studentSignIn,
    studentSignUp,
    studentSignInWithGoogle,
    studentLogout,
    logout,
    resetPassword,
    updateUserProfile,
    changeUserPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
