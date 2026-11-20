import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, FolderOpen, X } from 'lucide-react';
import { anonymousChatAPI } from '../../services/api';
import { downloadLiveChatResource } from '../../utils/downloadLiveChatResource';
import { formatFileSize } from '../../constants/resourceAllowlist';

export default function HostChatResourcesPanel({ chat, open, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !chat?.id) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await anonymousChatAPI.listChatResources(chat.id);
        if (!cancelled) {
          setItems(response.data?.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || 'Failed to load resources');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, chat?.id]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-primary/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-text truncate">Resources</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-text-light hover:bg-primary/10"
          aria-label="Close resources"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
        {loading ? (
          <p className="text-sm text-text-light">Loading resources…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-light">Nothing has been shared in this chat yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isLink = item.type === 'link';
              const name = isLink ? item.linkTitle || item.linkDomain || item.url : item.fileName;
              const when = item.sharedAt ? new Date(item.sharedAt).toLocaleString() : '';
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-primary/15 bg-background p-3 min-w-0"
                >
                  <p className="text-sm font-medium text-text break-words">{name}</p>
                  <p className="text-[11px] text-text-light mt-0.5">
                    {isLink ? item.linkDomain || 'Link' : formatFileSize(item.size) || item.type}
                    {when ? ` • ${when}` : ''}
                  </p>
                  <div className="mt-2">
                    {isLink ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 px-3 rounded-lg bg-primary text-white text-xs font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => downloadLiveChatResource(chat.id, item.id, item.fileName)}
                        className="inline-flex min-h-9 items-center gap-1.5 px-3 rounded-lg bg-primary text-white text-xs font-medium"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
