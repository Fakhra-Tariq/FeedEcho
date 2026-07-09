const express = require('express');
const { auth, db } = require('../config/firebase');
const {
  VALID_ROLES,
  normalizeRoles,
  formatUser,
  buildInitialRoles,
} = require('../utils/userRoles');

const router = express.Router();

const userRef = (uid) => db.ref(`users/${uid}`);

const buildProfilePayload = ({ uid, decodedToken, role, firstName, lastName }) => {
  const roles = buildInitialRoles(role);
  const displayName =
    decodedToken.name ||
    `${firstName || ''} ${lastName || ''}`.trim() ||
    decodedToken.email ||
    'User';

  return {
    uid,
    email: decodedToken.email || null,
    firstName: firstName || '',
    lastName: lastName || '',
    displayName,
    role: roles[0],
    roles,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    profileImage: decodedToken.picture || null,
    bio: '',
    preferences: {
      notifications: true,
      emailUpdates: true,
      theme: 'light',
    },
  };
};

// Ensure user profile exists; optionally merge an additional role (signup / student portal)
router.post('/ensure-profile', async (req, res) => {
  try {
    const { idToken, role, firstName, lastName, mergeRole = false } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userSnap = await userRef(uid).get();
    if (userSnap.exists()) {
      const existing = userSnap.val() || {};
      const currentRoles = normalizeRoles(existing);

      if (mergeRole) {
        const rolesToAdd = role === 'teacher' ? buildInitialRoles('teacher') : [role];
        const mergedRoles = [...new Set([...currentRoles, ...rolesToAdd])];

        if (mergedRoles.length !== currentRoles.length) {
          const updateData = {
            roles: mergedRoles,
            updatedAt: new Date().toISOString(),
          };
          if (firstName) updateData.firstName = firstName;
          if (lastName) updateData.lastName = lastName;
          if (firstName || lastName) {
            updateData.displayName = `${firstName || existing.firstName || ''} ${lastName || existing.lastName || ''}`.trim();
          }
          await userRef(uid).update(updateData);
        }
      }

      const refreshedSnap = await userRef(uid).get();
      const refreshed = refreshedSnap.val() || existing;
      return res.json({
        message: mergeRole ? 'Profile updated' : 'Profile already exists',
        user: formatUser(uid, refreshed),
      });
    }

    const userProfile = buildProfilePayload({
      uid,
      decodedToken,
      role,
      firstName,
      lastName,
    });

    await userRef(uid).set(userProfile);

    return res.status(201).json({
      message: 'Profile created successfully',
      user: formatUser(uid, userProfile),
    });
  } catch (error) {
    console.error('Ensure profile error:', error);
    return res.status(500).json({ error: 'Error ensuring user profile' });
  }
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    const roles = buildInitialRoles(role);
    const userProfile = {
      uid: userRecord.uid,
      email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      role: roles[0],
      roles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      profileImage: null,
      bio: '',
      preferences: {
        notifications: true,
        emailUpdates: true,
        theme: 'light',
      },
    };

    await userRef(userRecord.uid).set(userProfile);

    res.status(201).json({
      message: 'User created successfully',
      user: formatUser(userRecord.uid, userProfile),
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Error creating user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const userSnap = await userRef(decodedToken.uid).get();

    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userSnap.val();

    if (!userData.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    res.json({
      message: 'Login successful',
      user: formatUser(decodedToken.uid, userData),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userSnap = await userRef(decodedToken.uid).get();

    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = userSnap.val() || {};
    res.json({ user: formatUser(decodedToken.uid, profile) });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const {
      firstName,
      lastName,
      bio,
      preferences,
      university,
      location,
      phone,
      profileImage,
      school,
      subject,
      experience,
    } = req.body;

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (firstName) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (firstName || lastName !== undefined) {
      const existingSnap = await userRef(decodedToken.uid).get();
      const existing = existingSnap.val() || {};
      const nextFirst = firstName || existing.firstName || '';
      const nextLast = lastName !== undefined ? lastName : existing.lastName || '';
      updateData.displayName = `${nextFirst} ${nextLast}`.trim();
    }
    if (bio !== undefined) updateData.bio = bio;
    if (university !== undefined) updateData.university = university;
    if (location !== undefined) updateData.location = location;
    if (phone !== undefined) updateData.phone = phone;
    if (school !== undefined) updateData.school = school;
    if (subject !== undefined) updateData.subject = subject;
    if (experience !== undefined) updateData.experience = experience;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (preferences) updateData.preferences = { ...preferences };

    await userRef(decodedToken.uid).update(updateData);
    const updatedUserSnap = await userRef(decodedToken.uid).get();
    const updated = updatedUserSnap.val() || {};
    res.json({
      message: 'Profile updated successfully',
      user: formatUser(decodedToken.uid, updated),
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Error updating profile' });
  }
});

module.exports = router;
