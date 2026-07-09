const express = require('express');
const { db, auth } = require('../config/firebase');
const { verifyFirebaseToken, checkRole } = require('../middleware/auth');
const router = express.Router();

const usersRef = () => db.ref('users');
const userRef = (uid) => db.ref(`users/${uid}`);

async function getRequesterRole(uid) {
  const snap = await userRef(uid).get();
  return snap.exists() ? (snap.val()?.role || null) : null;
}

// Get all users (admin/teacher only)
router.get('/', verifyFirebaseToken, checkRole(['admin', 'teacher']), async (req, res) => {
  try {
    const { role, limit = 20, offset = 0 } = req.query;
    const snap = await usersRef().get();
    const all = snap.exists() ? snap.val() : {};

    let users = Object.entries(all || {}).map(([id, data]) => ({ id, ...(data || {}) }));
    if (role) {
      users = users.filter((u) => u.role === role);
    }

    // Sort newest first if createdAt exists
    users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const lim = Math.max(0, parseInt(limit, 10) || 0);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    users = users.slice(off, lim ? off + lim : undefined);

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Get user by ID
router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await userRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = snap.val() || {};
    
    // Return public profile information only
    const publicProfile = {
      id,
      displayName: userData.displayName,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      bio: userData.bio,
      profileImage: userData.profileImage,
      createdAt: userData.createdAt
    };

    // If user is requesting their own profile or is admin/teacher, return more info
    const requesterRole = await getRequesterRole(req.user.uid);
    if (req.user.uid === id || ['admin', 'teacher'].includes(requesterRole)) {
      publicProfile.email = userData.email;
      publicProfile.isActive = userData.isActive;
      publicProfile.preferences = userData.preferences;
    }

    res.json({ user: publicProfile });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Error fetching user' });
  }
});

// Update user (admin only or own profile)
router.put('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive, ...updateData } = req.body;

    const requesterRole = await getRequesterRole(req.user.uid);

    // Check if user is updating their own profile or is admin
    if (req.user.uid !== id && requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Only admins can change role and isActive status
    if (requesterRole !== 'admin' && (role !== undefined || isActive !== undefined)) {
      return res.status(403).json({ error: 'Only admins can change role and status' });
    }

    const snap = await userRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateFields = {
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    if (role !== undefined) updateFields.role = role;
    if (isActive !== undefined) updateFields.isActive = isActive;

    await userRef(id).update(updateFields);
    const updatedUserSnap = await userRef(id).get();
    res.json({
      message: 'User updated successfully',
      user: updatedUserSnap.val()
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Error updating user' });
  }
});

// Delete user (admin only)
router.delete('/:id', verifyFirebaseToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.uid === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const snap = await userRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user from Firebase Auth
    await auth.deleteUser(id);

    // Delete user profile from Realtime Database
    await userRef(id).remove();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Error deleting user' });
  }
});

// Get user statistics (teacher/admin only)
router.get('/:id/stats', verifyFirebaseToken, checkRole(['admin', 'teacher']), async (req, res) => {
  try {
    const { id } = req.params;
    const userSnap = await userRef(id).get();
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userSnap.val() || {};
    const stats = {
      coursesCreated: 0,
      coursesEnrolled: 0,
      assignmentsCompleted: 0,
      totalSubmissions: 0
    };

    if (userData.role === 'teacher') {
      // Get courses created by teacher
      const coursesSnap = await db.ref('courses').orderByChild('createdBy').equalTo(id).get();
      if (coursesSnap.exists()) {
        const courses = coursesSnap.val() || {};
        stats.coursesCreated = Object.keys(courses).length;
      }
    } else if (userData.role === 'student') {
      // Get courses enrolled by student
      const enrollSnap = await db.ref('enrollments').orderByChild('studentId').equalTo(id).get();
      stats.coursesEnrolled = enrollSnap.exists() ? Object.keys(enrollSnap.val() || {}).length : 0;

      const submissionsSnap = await db.ref('submissions').orderByChild('studentId').equalTo(id).get();
      if (submissionsSnap.exists()) {
        const subs = submissionsSnap.val() || {};
        const allSubs = Object.values(subs);
        const submitted = allSubs.filter((s) => s && s.status === 'submitted');
        stats.assignmentsCompleted = submitted.length;
        stats.totalSubmissions = allSubs.length;
      }
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Error fetching user statistics' });
  }
});

module.exports = router;
