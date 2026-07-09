/**
 * Standardized Session Code Generator (Client-side)
 * Generates 6-character uppercase alphanumeric codes (A-Z, 0-9)
 * Used across all activities: Quiz, SpaceRace, Exit Ticket
 */

/**
 * Generate a 6-character session code
 * @returns {string} 6-character uppercase alphanumeric code
 */
export const generateSessionCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

/**
 * Validate a session code format
 * @param {string} code - The code to validate
 * @returns {boolean} True if valid (6 uppercase alphanumeric characters)
 */
export const validateSessionCode = (code) => {
  return /^[A-Z0-9]{6}$/.test(code);
};

/**
 * Normalize a session code (convert to uppercase and validate)
 * @param {string} code - The code to normalize
 * @returns {string|null} Normalized code or null if invalid
 */
export const normalizeSessionCode = (code) => {
  if (!code) return null;
  const normalized = code.toUpperCase().trim();
  return validateSessionCode(normalized) ? normalized : null;
};
