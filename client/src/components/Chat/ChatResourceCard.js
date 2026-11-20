import React, { useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import { formatFileSize } from '../../constants/resourceAllowlist';

function resourceKind(message) {
  return message?.resourceKind || message?.type || '';
}

function FileTypeIcon({ message }) {
  const kind = resourceKind(message);
  if (kind === 'link') return <LinkIcon className="w-4 h-4 text-primary shrink-0" />;
  const name = String(message?.fileName || '').toLowerCase();
  if (kind === 'image' || /\.(png|jpe?g|webp)$/.test(name)) {
    return <ImageIcon className="w-4 h-4 text-primary shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-primary shrink-0" />;
}

export default function ChatResourceCard({
  message,
  onDownload,
  isGuest = false,
  variant = 'default',
}) {
  const [busy, setBusy] = useState(false);
  const kind = resourceKind(message);
  const isLink = kind === 'link';
  const title = isLink
    ? message.linkTitle || message.linkDomain || 'Shared link'
    : message.fileName || 'Shared file';
  const domain = message.linkDomain || '';
  const sizeLabel = !isLink ? formatFileSize(message.fileSize) : '';
  const own = variant === 'own';

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDownload?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 w-full max-w-[260px] sm:max-w-[300px]">
      <div
        className={`rounded-xl border p-3 min-w-0 ${
          own ? 'border-white/25 bg-white/10' : 'border-primary/15 bg-white'
        }`}
      >
        <div className="flex items-start gap-2 min-w-0">
          <div
            className={`mt-0.5 w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ${
              own ? 'bg-white/15' : 'bg-primary/10'
            }`}
          >
            <FileTypeIcon message={message} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium break-words ${own ? 'text-white' : 'text-text'}`}>
              {title}
            </p>
            <p className={`text-[11px] mt-0.5 ${own ? 'text-white/80' : 'text-text-light'}`}>
              {isLink ? domain : sizeLabel || 'File'}
            </p>
          </div>
        </div>
        <div className="mt-2">
          {isLink ? (
            <a
              href={message.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-9 items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium ${
                own
                  ? 'bg-white text-primary'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy}
              className={`inline-flex min-h-9 items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium disabled:opacity-60 ${
                own
                  ? 'bg-white text-primary'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {busy ? 'Downloading…' : isGuest ? 'Download' : 'Download'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
