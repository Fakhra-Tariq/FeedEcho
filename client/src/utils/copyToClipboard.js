export async function copyToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  // Synchronous copy works reliably inside click handlers (user activation).
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) return true;
  } catch {
    // fall through to Clipboard API
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
