import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronDown,
  LogOut,
  Trash2,
  Lock,
  Camera,
  Pencil,
  Calendar,
  GraduationCap,
  MapPin,
  Building2,
  Phone,
  Award,
  TrendingUp,
  Target,
  Home,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { getStoredAudienceSession, persistAudienceSession, clearAudienceSession } from '../utils/audienceSession';
import { useAudienceQuizStats } from '../hooks/useAudienceQuizStats';
import { useClickOutside } from '../hooks/useClickOutside';
import AudienceAvatar from '../components/AudienceAvatar';
import ProfileStatsRow from '../components/ProfileStatsRow';

const mapUserToProfile = (user = {}, session = {}) => {
  const fullName =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    session.name ||
    'Student';

  const roleLabel = (user.role || session.role || 'student').replace(/^\w/, (c) => c.toUpperCase());

  return {
    fullName,
    email: user.email || session.email || '',
    bio: user.bio || '',
    university: user.university || '',
    location: user.location || '',
    phone: user.phone || '',
    roleLabel,
    joinedDate: user.createdAt || null,
    profileImage: user.profileImage || null,
  };
};

const SettingsRow = ({ icon: Icon, label, onClick, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${
      danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <Icon className={`w-5 h-5 shrink-0 ${danger ? 'text-red-600' : 'text-primary'}`} />
      <span className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-900'}`}>{label}</span>
    </div>
    {!danger && <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />}
  </button>
);

export default function AudienceProfile() {
  const navigate = useNavigate();
  const { audienceLogout, updateUserProfile, changeUserPassword, userProfile } = useAuth();
  const [student, setStudent] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef(null);
  const closeProfileDropdown = useCallback(() => {
    setShowProfileDropdown(false);
  }, []);
  useClickOutside(profileDropdownRef, closeProfileDropdown, showProfileDropdown);

  const { stats: quizStats, loading: loadingQuizStats } = useAudienceQuizStats(student);

  const statItems = useMemo(
    () => [
      { icon: Award, value: quizStats.totalQuizzes, label: 'Quizzes taken' },
      { icon: TrendingUp, value: `${quizStats.averageScore.toFixed(1)}%`, label: 'Average score' },
      { icon: Target, value: `${Math.round(quizStats.bestScore)}%`, label: 'Best score' },
    ],
    [quizStats]
  );

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setUploadingAvatar(true);
      try {
        const result = await updateUserProfile({ profileImage: base64 });
        if (result?.success && result.user) {
          setProfile(mapUserToProfile(result.user, getStoredAudienceSession()));
        }
      } catch (error) {
        console.error('Failed to update profile image:', error);
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const [editForm, setEditForm] = useState({
    fullName: '',
    bio: '',
    university: '',
    location: '',
    phone: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const session = getStoredAudienceSession();
    if (!session) {
      navigate('/join');
      return;
    }

    setStudent(session);

    const applyProfile = (user) => {
      setProfile(mapUserToProfile(user, session));
      setLoadingProfile(false);
    };

    if (userProfile?.uid) {
      applyProfile(userProfile);
      return;
    }

    const loadProfile = async () => {
      setLoadingProfile(true);
      let user = {};

      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await authAPI.getProfile(token);
          user = response.data?.user || {};
        }
      } catch (error) {
        console.error('Failed to load student profile from backend:', error);
      }

      applyProfile(user);
    };

    loadProfile();
  }, [navigate, userProfile]);

  const handleEditSave = async () => {
    const nameParts = editForm.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    setSavingProfile(true);
    try {
      const result = await updateUserProfile({
        firstName,
        lastName,
        bio: editForm.bio,
        university: editForm.university.trim(),
        location: editForm.location.trim(),
        phone: editForm.phone.trim(),
      });
      if (result?.success && result.user) {
        setProfile(mapUserToProfile(result.user, getStoredAudienceSession()));
      } else {
        setProfile((prev) => ({
          ...prev,
          fullName: editForm.fullName,
          bio: editForm.bio,
          university: editForm.university.trim(),
          location: editForm.location.trim(),
          phone: editForm.phone.trim(),
        }));
      }
    } catch (error) {
      console.error('Failed to update profile on backend:', error);
    } finally {
      setSavingProfile(false);
    }

    localStorage.setItem('feedecho_name', editForm.fullName);
    localStorage.setItem('feedecho_bio', editForm.bio);
    persistAudienceSession({
      uid: getStoredAudienceSession()?.uid,
      email: profile.email,
      firstName,
      lastName,
      displayName: editForm.fullName,
      role: 'student',
    });
    setShowEditModal(false);
  };

  const handlePasswordSave = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.current) {
      setPasswordError('Current password is required');
      return;
    }
    if (passwordForm.new.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordSaving(true);
    const result = await changeUserPassword(passwordForm.current, passwordForm.new);
    setPasswordSaving(false);

    if (!result?.success) {
      setPasswordError(result?.error || 'Failed to update password');
      return;
    }

    setPasswordSuccess('Password updated!');
    setPasswordForm({ current: '', new: '', confirm: '' });
    setTimeout(() => {
      setPasswordSuccess('');
      setShowPasswordModal(false);
    }, 1500);
  };

  const handleLogout = async () => {
    await audienceLogout();
    clearAudienceSession();
    window.location.href = '/';
  };

  const handleDeleteAccount = async () => {
    localStorage.removeItem('feedecho_student_profile');
    await audienceLogout();
    clearAudienceSession();
    window.location.href = '/';
  };

  const formatDate = (iso) => {
    if (!iso) return 'Unknown';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const navDisplayName = profile?.fullName || student?.name || 'Student';
  const navDisplayEmail = profile?.email || student?.email || '';

  const studentNavbar = (
    <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <img
              src="/FeedEcho-logo.png.png"
              alt="FeedEcho"
              className="h-32 w-auto object-contain mix-blend-mode: multiply"
            />
          </div>

          <div className="hidden md:flex items-center space-x-6">
            <a href="/audience/home" className="flex items-center space-x-2 text-gray-700 hover:text-primary transition-colors">
              <Home className="w-4 h-4" />
              <span className="font-medium">Home</span>
            </a>
            <Link to="/audience/progress" className="flex items-center space-x-2 text-gray-700 hover:text-primary transition-colors">
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Progress</span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <AudienceAvatar name={navDisplayName} />
                <span className="font-medium text-text">{navDisplayName.split(' ')[0] || 'Student'}</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-3 border-b border-gray-200">
                    <p className="font-medium text-text">{navDisplayName}</p>
                    <p className="text-sm text-gray-600">{navDisplayEmail}</p>
                  </div>
                  <div className="py-2">
                    <Link to="/audience/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>Profile</span>
                      </div>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                    >
                      <div className="flex items-center space-x-2">
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );

  if (loadingProfile || !profile) {
    return (
      <div className="min-h-screen bg-background">
        {studentNavbar}
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-500">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      {studentNavbar}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Audience profile</h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">Manage your profile and account</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditForm({
                fullName: profile.fullName,
                bio: profile.bio,
                university: profile.university,
                location: profile.location,
                phone: profile.phone,
              });
              setShowEditModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shrink-0"
          >
            <Pencil className="w-4 h-4" />
            Edit profile
          </button>
        </div>

        {/* Profile card */}
        <div
          className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden"
          style={{ border: '0.5px solid #E8E0F0' }}
        >
          <div className="p-6">
            <div className="flex items-center gap-4 mb-5">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className="relative shrink-0 cursor-pointer disabled:opacity-70"
              >
                <AudienceAvatar
                  name={profile.fullName}
                  className="w-16 h-16"
                  textClassName="text-2xl"
                />
                <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-900 truncate">{profile.fullName}</h2>
                <p className="text-sm text-gray-500 truncate">{profile.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                <Calendar className="w-3.5 h-3.5" />
                Joined {formatDate(profile.joinedDate)}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                <GraduationCap className="w-3.5 h-3.5" />
                {profile.roleLabel}
              </span>
            </div>

            <ProfileStatsRow items={statItems} loading={loadingQuizStats} />

            {profile.bio && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Bio</p>
                <p className="text-sm text-gray-800 leading-relaxed">{profile.bio}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">University</p>
                  <p className="text-sm text-gray-900">{profile.university || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Location</p>
                  <p className="text-sm text-gray-900">{profile.location || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Phone</p>
                  <p className="text-sm text-gray-900">{profile.phone || 'Not set'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings card */}
        <div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          style={{ border: '0.5px solid #E8E0F0' }}
        >
          <div className="px-4 pt-4 pb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Security</p>
          </div>
          <SettingsRow
            icon={Lock}
            label="Change password"
            onClick={() => {
              setPasswordForm({ current: '', new: '', confirm: '' });
              setPasswordError('');
              setPasswordSuccess('');
              setShowPasswordModal(true);
            }}
          />

          <div style={{ borderTop: '0.5px solid #E8E0F0' }} className="mt-1">
            <div className="px-4 pt-4 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</p>
            </div>
            <SettingsRow icon={LogOut} label="Log out" onClick={handleLogout} />
          </div>

          <div
            className="mt-2 mx-4 mb-4 p-4 rounded-lg"
            style={{ border: '0.5px solid #FECACA', backgroundColor: '#FEF2F2' }}
          >
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete account
            </button>
            <p className="text-xs text-red-500/80 text-center mt-2">
              This action is permanent and cannot be undone.
            </p>
          </div>
        </div>

        {/* Edit Profile Modal */}
        {showEditModal && (
          <div
            role="presentation"
            onClick={() => setShowEditModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-md shadow-xl"
              style={{ border: '0.5px solid #E8E0F0' }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Edit profile</h2>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Full name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">University</label>
                <input
                  type="text"
                  value={editForm.university}
                  onChange={(e) => setEditForm({ ...editForm, university: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Bio</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E8E0F0' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={savingProfile}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {showPasswordModal && (
          <div
            role="presentation"
            onClick={() => setShowPasswordModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-md shadow-xl"
              style={{ border: '0.5px solid #E8E0F0' }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Change password</h2>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Current password</label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">New password</label>
                <input
                  type="password"
                  value={passwordForm.new}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Confirm new password</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              {passwordError && <p className="text-xs text-red-600 mb-4">{passwordError}</p>}
              {passwordSuccess && <p className="text-xs text-primary mb-4">{passwordSuccess}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E8E0F0' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasswordSave}
                  disabled={passwordSaving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {passwordSaving ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Account Confirmation Modal */}
        {showDeleteConfirm && (
          <div
            role="presentation"
            onClick={() => setShowDeleteConfirm(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-md shadow-xl"
              style={{ border: '0.5px solid #E8E0F0' }}
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Delete account?</h2>
              <p className="text-sm text-gray-500 mb-6">
                This will permanently remove your profile, preferences, and local account. This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E8E0F0' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
