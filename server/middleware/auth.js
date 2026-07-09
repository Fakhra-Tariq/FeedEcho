const { auth } = require('../config/firebase');
const jwt = require('jsonwebtoken');

// Middleware to verify Firebase ID token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check user role
const checkRole = (roles) => {
  return async (req, res, next) => {
    try {
      const { db } = require('../config/firebase');
      const userSnap = await db.ref(`users/${req.user.uid}`).get();
      
      if (!userSnap.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userSnap.val();
      
      if (!roles.includes(userData.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.userRole = userData.role;
      req.userProfile = userData;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ error: 'Error checking user role' });
    }
  };
};

// Middleware to check if user owns the resource
const checkOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const { db } = require('../config/firebase');
      const resourceId = req.params.id;
      const userId = req.user.uid;

      let resourceSnap;
      switch (resourceType) {
        case 'course':
          resourceSnap = await db.ref(`courses/${resourceId}`).get();
          break;
        case 'assignment':
          resourceSnap = await db.ref(`assignments/${resourceId}`).get();
          break;
        default:
          return res.status(400).json({ error: 'Invalid resource type' });
      }

      if (!resourceSnap.exists()) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      const resourceData = resourceSnap.val();
      
      if (resourceData.createdBy !== userId && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      req.resource = resourceData;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ error: 'Error checking ownership' });
    }
  };
};

module.exports = {
  verifyFirebaseToken,
  checkRole,
  checkOwnership
};
