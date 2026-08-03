import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  Camera,
  ChevronRight,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { useTeacherProfileStats } from '../hooks/useTeacherProfileStats';
import ProfileStatsRow from '../components/ProfileStatsRow';

const mapUserToProfile = (user = {}) => {
  const fullName =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    'Teacher';

  return {
    fullName,
    email: user.email || '',
    bio: user.bio || '',
    school: user.school || '',
    subject: user.subject || '',
    experience: user.experience || '',
    location: user.location || '',
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

const getInitials = (name) => {
  if (!name) return 'T';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export default function TeacherProfile() {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile, changeUserPassword, logout } = useAuth();
  const { stats, loading: loadingStats } = useTeacherProfileStats();

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  const [editForm, setEditForm] = useState({
    fullName: '',
    bio: '',
    school: '',
    subject: '',
    experience: '',
    location: '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const statItems = useMemo(
    () => [
      { icon: BookOpen, value: stats.totalQuizzes, label: 'Quizzes created' },
      { icon: Users, value: stats.totalParticipants, label: 'Total participants' },
      { icon: TrendingUp, value: `${stats.avgScore}%`, label: 'Average score' },
    ],
    [stats]
  );

  useEffect(() => {
    const applyProfile = (user) => {
      setProfile(mapUserToProfile(user));
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
        console.error('Failed to load teacher profile from backend:', error);
      }
      applyProfile(user);
    };

    loadProfile();
  }, [userProfile]);

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
          setProfile(mapUserToProfile(result.user));
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
        school: editForm.school.trim(),
        subject: editForm.subject.trim(),
        experience: editForm.experience.trim(),
        location: editForm.location.trim(),
      });
      if (result?.success && result.user) {
        setProfile(mapUserToProfile(result.user));
      } else if (result?.success) {
        setProfile((prev) => ({
          ...prev,
          fullName: editForm.fullName,
          bio: editForm.bio,
          school: editForm.school.trim(),
          subject: editForm.subject.trim(),
          experience: editForm.experience.trim(),
          location: editForm.location.trim(),
        }));
      }
    } catch (error) {
      console.error('Failed to update teacher profile:', error);
    } finally {
      setSavingProfile(false);
    }

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
    await logout();
    navigate('/teacher/signin');
  };

  const handleDeleteAccount = async () => {
    await logout();
    window.location.href = '/teacher/signin';
  };

  const formatDate = (iso) => {
    if (!iso) return 'Unknown';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const avatarUrl = userProfile?.profileImage || profile?.profileImage;

  if (loadingProfile || !profile) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="font-sans">
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Teacher profile</h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">Manage your profile and account</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditForm({
                fullName: profile.fullName,
                bio: profile.bio,
                school: profile.school,
                subject: profile.subject,
                experience: profile.experience,
                location: profile.location,
              });
              setShowEditModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shrink-0"
          >
            <Pencil className="w-4 h-4" />
            Edit profile
          </button>
        </div>

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
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
                    {getInitials(profile.fullName)}
                  </div>
                )}
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
              {profile.experience && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  <Award className="w-3.5 h-3.5" />
                  {profile.experience} experience
                </span>
              )}
            </div>

            <ProfileStatsRow items={statItems} loading={loadingStats} />

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
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">School</p>
                  <p className="text-sm text-gray-900">{profile.school || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Subject</p>
                  <p className="text-sm text-gray-900">{profile.subject || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Award className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Experience</p>
                  <p className="text-sm text-gray-900">{profile.experience || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Location</p>
                  <p className="text-sm text-gray-900">{profile.location || 'Not set'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

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
              className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
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
                <label className="text-xs font-semibold text-gray-500 mb-2 block">School</label>
                <input
                  type="text"
                  value={editForm.school}
                  onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Subject</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ border: '1px solid #E8E0F0' }}
                />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 mb-2 block">Experience</label>
                <input
                  type="text"
                  value={editForm.experience}
                  onChange={(e) => setEditForm({ ...editForm, experience: e.target.value })}
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
