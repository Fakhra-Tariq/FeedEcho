const STORAGE_KEY = 'feedecho_device_id';
const COOKIE_NAME = 'feedecho_device_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function mintDeviceId() {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `dev-${uuid}`;
}

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return '';
}

function writeCookie(id) {
  if (typeof document === 'undefined' || !id) return;
  const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

function readLocal() {
  try {
    return String(localStorage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function writeLocal(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / private-mode
  }
}

function isValidDeviceId(value) {
  return /^dev-[0-9a-f-]{8,}$/i.test(String(value || '').trim());
}

/** One stable per-browser id. Restores localStorage from the cookie (and vice versa). */
export function getAudienceDeviceId() {
  const fromLocal = readLocal();
  const fromCookie = readCookie(COOKIE_NAME);
  let id = '';
  if (isValidDeviceId(fromLocal)) id = fromLocal;
  else if (isValidDeviceId(fromCookie)) id = fromCookie;
  else id = mintDeviceId();

  if (fromLocal !== id) writeLocal(id);
  if (fromCookie !== id) writeCookie(id);
  return id;
}

export const AUDIENCE_DEVICE_ID_STORAGE_KEY = STORAGE_KEY;
export const AUDIENCE_DEVICE_ID_COOKIE = COOKIE_NAME;
