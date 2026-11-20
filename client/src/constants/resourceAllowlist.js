/**
 * Keep in sync with Web/server/utils/resourceAllowlist.js
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_LABEL = '5 MB';
export const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
];

export const ACCEPT_FILE_TYPES = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
