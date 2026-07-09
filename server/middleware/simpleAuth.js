// Simple session-based auth for development
// In production, replace with proper Firebase auth

const users = new Map(); // In-memory user store for development

const simpleAuth = (req, res, next) => {
  // Get user ID from session or create a new one
  let userId = req.headers['x-user-id'];
  
  if (!userId) {
    // For development, create a consistent user ID based on session
    userId = req.session?.userId || 'dev-user-' + Math.random().toString(36).substring(2, 15);
    
    // Store in session for consistency
    if (req.session) {
      req.session.userId = userId;
    }
  }
  
  // Set user object
  req.user = {
    uid: userId,
    role: 'teacher' // Default to teacher for development
  };
  
  req.userRole = 'teacher';
  
  next();
};

module.exports = { simpleAuth };
