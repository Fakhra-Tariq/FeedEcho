import { anonymousChatAPI } from '../services/api';

async function readBlobError(blob) {
  try {
    const parsed = JSON.parse(await blob.text());
    return parsed.error || 'Download failed';
  } catch {
    return 'Download failed';
  }
}

export async function downloadLiveChatResource(chatId, resourceId, fileName) {
  try {
    const response = await anonymousChatAPI.downloadResource(chatId, resourceId);
    const blob = response.data;
    if (blob && blob.type && String(blob.type).includes('application/json')) {
      throw new Error(await readBlobError(blob));
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    const data = error.response?.data;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      throw new Error(await readBlobError(data));
    }
    const message =
      error.response?.data?.error || error.message || 'Download failed';
    throw new Error(message);
  }
}
