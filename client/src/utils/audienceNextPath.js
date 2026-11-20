export function safeAudienceNextPath(search) {
  const raw = new URLSearchParams(search || '').get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) {
    return null;
  }
  return raw;
}

export function chatLoginPath(sessionCode) {
  const code = String(sessionCode || '').trim().toUpperCase();
  const next = code ? `/audience/chat?code=${encodeURIComponent(code)}` : '/audience/chat';
  return `/join?next=${encodeURIComponent(next)}`;
}
