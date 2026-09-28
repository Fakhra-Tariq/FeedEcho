import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Paperclip, Image as ImageIcon, FileText, Link as LinkIcon, X } from 'lucide-react';
import { useRtdbList } from '../../hooks/useRtdb';
import { spaceRacesAPI } from '../../services/api';
import { useHybridAlert } from '../../contexts/HybridAlertContext';
import { prepareChatImage } from '../../utils/compressChatImage';

const GALLERY_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const DOCUMENT_EXT = /\.(pdf|doc|docx|txt|ppt|pptx|xls|xlsx)$/i;
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const isPhoneImagePicker = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px), (hover: none) and (pointer: coarse)').matches;
};

const isAllowedImage = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('video/') || type === 'image/svg+xml') return false;
  if (IMAGE_EXT.test(file?.name || '')) return true;
  return type.startsWith('image/');
};

const isAllowedDocument = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/')) return false;
  return DOCUMENT_TYPES.has(type) || DOCUMENT_EXT.test(file?.name || '');
};

const readFileAsDataUrl = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

const detectMessageType = (text) => {
  const match = text.match(URL_REGEX);
  if (match && match[0]) return { type: 'link', url: match[0], text };
  return { type: 'text', url: '', text };
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const sortMessages = (items) =>
  [...items].sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

const messageKey = (msg) =>
  msg?.id || `${msg?.timestamp || ''}-${msg?.participantId || ''}-${msg?.text || ''}`;

const mergeMessages = (...groups) => {
  const byId = new Map();
  groups.flat().forEach((msg) => {
    if (!msg) return;
    const key = messageKey(msg);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, msg);
      return;
    }
    byId.set(key, {
      ...existing,
      ...msg,
      participantId: msg.participantId || existing.participantId,
      senderName: msg.senderName || existing.senderName,
    });
  });
  return sortMessages(Array.from(byId.values()));
};

const LinkPreview = ({ url, title }) => {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep raw url
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
    >
      <div className="flex items-center gap-2 text-primary text-sm font-medium">
        <LinkIcon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{title || hostname}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1 truncate">{url}</p>
    </a>
  );
};

export default function SpaceRaceTeamChat({
  raceId,
  teamId,
  participant,
  compactHeader = false,
  dockedEdge = false,
  hideSyncNotice = false,
  headerAction = null,
  isViewed = true,
  onUnreadCountChange = null,
}) {
  const { alert } = useHybridAlert();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [imageSourceOpen, setImageSourceOpen] = useState(false);
  const [apiMessages, setApiMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pastedImage, setPastedImage] = useState(null);
  const [selectedFileImage, setSelectedFileImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const listRef = useRef(null);
  const nearBottomRef = useRef(true);
  const lastMessageIdRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const forceScrollRef = useRef(false);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const uploadFilesRef = useRef(new Map());
  const previewUrlsRef = useRef(new Map());
  const attachmentArmedRef = useRef(false);
  const NEAR_BOTTOM_PX = 80;

  const normalizedTeamId = teamId != null ? String(teamId) : null;
  const chatPath =
    raceId && normalizedTeamId != null
      ? `space_race_team_messages/${raceId}/team_${normalizedTeamId}`
      : null;

  const { list: rtdbMessages, loading: rtdbLoading, error: rtdbError } = useRtdbList(
    chatPath,
    {
      enabled: Boolean(chatPath),
      sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
      empty: [],
    }
  );

  const useApiFallback = Boolean(chatPath) && Boolean(rtdbError);

  const fetchMessagesFromApi = useCallback(async () => {
    if (!raceId || normalizedTeamId == null) return;
    try {
      const response = await spaceRacesAPI.getTeamChatMessages(raceId, normalizedTeamId);
      if (response.data?.success) {
        setApiMessages(response.data.data || []);
      }
    } catch (error) {
      console.warn('Team chat API fetch failed:', error);
    }
  }, [raceId, normalizedTeamId]);

  useEffect(() => {
    if (!useApiFallback) {
      setApiMessages([]);
      return undefined;
    }

    fetchMessagesFromApi();
    const interval = setInterval(fetchMessagesFromApi, 2000);
    return () => clearInterval(interval);
  }, [fetchMessagesFromApi, useApiFallback]);

  const messages = useMemo(
    () => mergeMessages(rtdbMessages, apiMessages, pendingMessages),
    [rtdbMessages, apiMessages, pendingMessages]
  );

  const teamName = useMemo(() => `Team ${normalizedTeamId}`, [normalizedTeamId]);
  const currentParticipantId = participant?.id ? String(participant.id) : '';
  const lastSeenTimestampRef = useRef(null);
  const unreadHydratedRef = useRef(false);

  const scrollListToBottom = useCallback((behavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const stickToBottomIfNeeded = useCallback(() => {
    const el = listRef.current;
    if (!el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    didInitialScrollRef.current = false;
    lastMessageIdRef.current = null;
    lastMessageCountRef.current = 0;
    nearBottomRef.current = true;
    forceScrollRef.current = false;
  }, [chatPath]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;

    const onScroll = () => {
      nearBottomRef.current =
        el.scrollHeight - (el.scrollTop + el.clientHeight) <= NEAR_BOTTOM_PX;
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      if (didInitialScrollRef.current) return;
      if (el.clientHeight <= 0) return;
      if (rtdbLoading && messages.length === 0) return;
      didInitialScrollRef.current = true;
      nearBottomRef.current = true;
      el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [chatPath, rtdbLoading, messages.length]);

  useEffect(() => {
    if (!isViewed) return undefined;
    nearBottomRef.current = true;
    didInitialScrollRef.current = true;
    const frame = requestAnimationFrame(() => scrollListToBottom('auto'));
    return () => cancelAnimationFrame(frame);
  }, [isViewed, scrollListToBottom]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last ? messageKey(last) : null;
    const previousId = lastMessageIdRef.current;
    const previousCount = lastMessageCountRef.current;
    const hasNewTail =
      messages.length !== previousCount || (Boolean(lastId) && lastId !== previousId);
    lastMessageIdRef.current = lastId;
    lastMessageCountRef.current = messages.length;

    const sentByMe = forceScrollRef.current;
    if (sentByMe) forceScrollRef.current = false;

    if (!didInitialScrollRef.current) {
      const el = listRef.current;
      const listHidden = !el || el.clientHeight === 0;
      if ((rtdbLoading && messages.length === 0) || listHidden) {
        if (sentByMe) forceScrollRef.current = true;
        return undefined;
      }
      didInitialScrollRef.current = true;
      nearBottomRef.current = true;
      const frame = requestAnimationFrame(() => scrollListToBottom('auto'));
      return () => cancelAnimationFrame(frame);
    }

    if (!hasNewTail && !sentByMe) return undefined;
    if (!sentByMe && !nearBottomRef.current) return undefined;

    const frame = requestAnimationFrame(() => scrollListToBottom('auto'));
    return () => cancelAnimationFrame(frame);
  }, [messages, rtdbLoading, scrollListToBottom]);

  useEffect(() => {
    if (!onUnreadCountChange) return undefined;

    const viewedOnDesktop =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
    const latestTimestamp = messages[messages.length - 1]?.timestamp || '';

    if (!unreadHydratedRef.current) {
      lastSeenTimestampRef.current = latestTimestamp;
      if (messages.length > 0 || !rtdbLoading) {
        unreadHydratedRef.current = true;
        onUnreadCountChange(0);
      }
      return undefined;
    }

    if (isViewed || viewedOnDesktop) {
      lastSeenTimestampRef.current = latestTimestamp || lastSeenTimestampRef.current;
      onUnreadCountChange(0);
      return undefined;
    }

    const lastSeen = lastSeenTimestampRef.current;
    const unseen = messages.filter((msg) => {
      if (String(msg.participantId || '') === currentParticipantId) return false;
      return String(msg.timestamp || '') > String(lastSeen);
    }).length;
    onUnreadCountChange(unseen);
    return undefined;
  }, [messages, isViewed, onUnreadCountChange, currentParticipantId, rtdbLoading]);

  const sendMessagePayload = async (payload, optimisticId = null, options = {}) => {
    const { keepOnFailure = false, trackComposer = true, onUploadProgress } = options;
    if (!raceId || normalizedTeamId == null || !participant?.id) {
      console.error('Missing required data for sending message:', { raceId: !!raceId, teamId: normalizedTeamId, participantId: participant?.id });
      alert.toast.error('Cannot send message - missing required information');
      return null;
    }

    const dropOptimistic = () => {
      if (!optimisticId || keepOnFailure) return;
      setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    };

    try {
      if (trackComposer) setIsSending(true);
      console.log('Sending message payload:', payload);
      
      const response = await spaceRacesAPI.sendTeamChatMessage(raceId, {
        participantId: participant.id,
        teamId: normalizedTeamId,
        ...payload,
      }, onUploadProgress
        ? {
            onUploadProgress: (event) => {
              if (!event.total) return;
              onUploadProgress(event.loaded / event.total);
            },
          }
        : undefined);

      console.log('Message API response:', response.data);

      if (response.data?.success) {
        const sent = response.data.data;
        if (optimisticId) {
          setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        if (trackComposer) setIsSending(false);
        if (sent && useApiFallback) {
          setApiMessages((prev) => mergeMessages(prev, [sent]));
        }
        if (useApiFallback) {
          fetchMessagesFromApi(); // Don't await, let it run in background
        }
        return sent;
      }

      dropOptimistic();
      alert.toast.error(response.data?.error || 'Failed to send message');
      return null;
    } catch (error) {
      dropOptimistic();
      console.error('Failed to send team chat message:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      alert.toast.error(error.response?.data?.error || error.message || 'Failed to send message');
      return null;
    } finally {
      if (trackComposer) setIsSending(false);
    }
  };

  const pendingAttachment = pastedImage || selectedFileImage || selectedFile || null;
  const pendingAttachmentType = selectedFile && pendingAttachment === selectedFile ? 'file' : 'image';

  const clearPendingAttachment = () => {
    if (pastedImage?.previewUrl) URL.revokeObjectURL(pastedImage.previewUrl);
    if (selectedFileImage?.previewUrl) URL.revokeObjectURL(selectedFileImage.previewUrl);
    setPastedImage(null);
    setSelectedFileImage(null);
    setSelectedFile(null);
  };

  const handleSendText = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    const detected = detectMessageType(trimmed);
    const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMessage = {
      id: optimisticId,
      participantId: participant.id,
      senderName: participant.name || 'You',
      text: trimmed,
      type: detected.type,
      url: detected.url,
      linkTitle: detected.type === 'link' ? detected.url : '',
      timestamp: new Date().toISOString(),
      pending: true,
    };

    forceScrollRef.current = true;
    setPendingMessages((prev) => mergeMessages(prev, [optimisticMessage]));
    setMessage('');

    await sendMessagePayload(
      {
        text: trimmed,
        type: detected.type,
        url: detected.url,
        linkTitle: detected.type === 'link' ? detected.url : '',
      },
      optimisticId
    );
  };

  const patchPending = (id, patch) => {
    setPendingMessages((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.id !== id) return item;
        if (
          patch.uploadProgress != null &&
          patch.uploadProgress === item.uploadProgress &&
          patch.uploadState === item.uploadState
        ) {
          return item;
        }
        changed = true;
        return { ...item, ...patch };
      });
      return changed ? next : prev;
    });
  };

  const handleSendComposer = async () => {
    if (pendingAttachment?.file) {
      if (attachmentArmedRef.current) return;
      attachmentArmedRef.current = true;
      const caption = message.trim();
      const file = pendingAttachment.file;
      const type = pendingAttachmentType;
      setMessage('');
      clearPendingAttachment();
      uploadAttachment(file, type, caption);
      return;
    }

    await handleSendText();
  };

  useEffect(() => {
    if (!pendingAttachment) attachmentArmedRef.current = false;
  }, [pendingAttachment]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

  const uploadAttachment = async (file, type, caption = '', existingId = null) => {
    if (!file || !raceId || normalizedTeamId == null) {
      console.error('Missing required data for upload:', { file: !!file, raceId: !!raceId, teamId: normalizedTeamId });
      alert.toast.error('Missing required information for upload');
      return;
    }

    if (!participant?.id) {
      console.error('Missing participant ID for upload');
      alert.toast.error('You must be logged in to upload files');
      return;
    }

    const captionText = String(caption || '').trim();
    const fallbackText = type === 'image' ? 'Shared an image' : `Shared ${file.name}`;
    const messageText = captionText || fallbackText;
    const optimisticId = existingId || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const inFlight = uploadFilesRef.current.get(optimisticId);
    if (existingId && inFlight?.running) return;
    uploadFilesRef.current.set(optimisticId, { file, type, caption: captionText, running: true });

    if (!existingId) {
      const previewUrl = type === 'image' ? URL.createObjectURL(file) : '';
      if (previewUrl) previewUrlsRef.current.set(optimisticId, previewUrl);
      forceScrollRef.current = true;
      setPendingMessages((prev) =>
        mergeMessages(prev, [
          {
            id: optimisticId,
            participantId: participant.id,
            senderName: participant.name || 'You',
            text: messageText,
            type,
            url: previewUrl,
            fileName: file.name,
            timestamp: new Date().toISOString(),
            pending: true,
            uploadState: 'uploading',
            uploadProgress: 0,
          },
        ])
      );
    } else {
      patchPending(optimisticId, { uploadState: 'uploading', uploadProgress: 0, pending: true });
    }

    const markFailed = (error) => {
      patchPending(optimisticId, { uploadState: 'error', uploadProgress: null, pending: true });
      alert.toast.error(error?.message || 'Failed to upload file');
    };

    try {
      const prepared = type === 'image' ? await prepareChatImage(file) : file;
      if (prepared.size > MAX_ATTACHMENT_BYTES) {
        const maxSizeMB = (MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
        throw new Error(`${type === 'image' ? 'Image' : 'File'} too large. Maximum size is ${maxSizeMB}MB for chat. Please use a smaller ${type}.`);
      }

      const downloadUrl = await readFileAsDataUrl(prepared, (ratio) => {
        patchPending(optimisticId, {
          uploadState: 'uploading',
          uploadProgress: Math.round(ratio * 50),
        });
      });

      if (!downloadUrl || !String(downloadUrl).startsWith('data:')) {
        throw new Error('Failed to read file');
      }

      const result = await sendMessagePayload(
        {
          text: messageText,
          type,
          url: downloadUrl,
          fileName: prepared.name || file.name,
        },
        optimisticId,
        {
          keepOnFailure: true,
          trackComposer: false,
          onUploadProgress: (ratio) => {
            patchPending(optimisticId, {
              uploadState: 'uploading',
              uploadProgress: 50 + Math.round(ratio * 50),
            });
          },
        }
      );

      if (!result) {
        patchPending(optimisticId, { uploadState: 'error', uploadProgress: null, pending: true });
        return;
      }

      const previewUrl = previewUrlsRef.current.get(optimisticId);
      previewUrlsRef.current.delete(optimisticId);
      uploadFilesRef.current.delete(optimisticId);
      if (previewUrl) {
        setTimeout(() => URL.revokeObjectURL(previewUrl), 1500);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      markFailed(error);
    } finally {
      const current = uploadFilesRef.current.get(optimisticId);
      if (current) current.running = false;
    }
  };

  const retryUpload = (messageId) => {
    const saved = uploadFilesRef.current.get(messageId);
    if (!saved) return;
    uploadAttachment(saved.file, saved.type, saved.caption, messageId);
  };

  const rejectOversized = (file, label) => {
    if (file.size <= MAX_ATTACHMENT_BYTES) return false;
    const maxSizeMB = (MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
    alert.toast.error(`${label} too large. Maximum size is ${maxSizeMB}MB for chat. Please use a smaller ${label.toLowerCase()}.`);
    return true;
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isAllowedImage(file)) {
      alert.toast.error('Please choose an image.');
      return;
    }
    if (rejectOversized(file, 'Image')) return;
    const previewUrl = URL.createObjectURL(file);
    clearPendingAttachment();
    setSelectedFileImage({ file, previewUrl });
  };

  const handleDocumentSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isAllowedDocument(file)) {
      alert.toast.error('Please choose a document.');
      return;
    }
    if (rejectOversized(file, 'File')) return;
    clearPendingAttachment();
    setSelectedFile({ file });
  };

  const openImagePicker = () => {
    if (isPhoneImagePicker()) {
      setImageSourceOpen(true);
      return;
    }
    galleryInputRef.current?.click();
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) break;
        if (!isAllowedImage(file)) {
          alert.toast.error('Please choose an image.');
          break;
        }
        if (rejectOversized(file, 'Image')) break;
        const previewUrl = URL.createObjectURL(file);
        clearPendingAttachment();
        setPastedImage({ file, previewUrl });
        break;
      }
    }
  };

  const renderUploadStatus = (msg) => {
    if (msg.uploadState === 'uploading') {
      const percent = Math.max(0, Math.min(100, Math.round(msg.uploadProgress || 0)));
      return (
        <p className="text-xs mt-1 flex items-center gap-1">
          {msg.type !== 'file' ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : null}
          Uploading... {percent}%
        </p>
      );
    }
    if (msg.uploadState === 'error') {
      return (
        <p className="text-xs mt-1">
          Upload failed.{' '}
          <button
            type="button"
            className="underline font-medium"
            onClick={() => retryUpload(msg.id)}
          >
            Retry
          </button>
        </p>
      );
    }
    return null;
  };

  const renderMessageBody = (msg) => {
    if (msg.type === 'image' && (msg.url || msg.uploadState)) {
      const caption = String(msg.text || '').trim();
      return (
        <div>
          {msg.url ? (
            <img
              src={msg.url}
              alt={msg.fileName || 'Shared image'}
              className="block max-w-full h-auto rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setSelectedImage(msg.url)}
              onLoad={stickToBottomIfNeeded}
            />
          ) : null}
          {caption ? <p className="text-sm mt-1">{caption}</p> : null}
          {renderUploadStatus(msg)}
        </div>
      );
    }

    if (msg.type === 'file' && (msg.url || msg.fileName || msg.uploadState)) {
      const caption = String(msg.text || '').trim();
      const fileCard = (
        <span className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white text-sm text-primary">
          {msg.uploadState === 'uploading' ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span className="truncate">{msg.fileName || 'Download file'}</span>
        </span>
      );
      return (
        <div>
          {msg.url && msg.uploadState !== 'uploading' ? (
            <a
              href={msg.url}
              target="_blank"
              rel="noopener noreferrer"
              download={msg.fileName}
              className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-primary"
            >
              <FileText className="w-4 h-4" />
              <span className="truncate">{msg.fileName || 'Download file'}</span>
            </a>
          ) : (
            fileCard
          )}
          {caption ? <p className="text-sm mt-1">{caption}</p> : null}
          {renderUploadStatus(msg)}
        </div>
      );
    }

    if (msg.type === 'link' && msg.url) {
      const caption = String(msg.text || '').trim();
      return (
        <div>
          <LinkPreview url={msg.url} title={msg.linkTitle} />
          {caption ? <p className="text-sm mt-1">{caption}</p> : null}
        </div>
      );
    }

    const parts = String(msg.text || '').split(URL_REGEX);
    return (
      <p className="text-sm whitespace-pre-wrap break-words">
        {parts.map((part, i) =>
          /^https?:\/\//i.test(part) ? (
            <a
              key={`${msg.id}-link-${i}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {part}
            </a>
          ) : (
            part
          )
        )}
      </p>
    );
  };

  if (!raceId || normalizedTeamId == null) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-6 text-center text-gray-500">
        Join a team to use team chat
      </div>
    );
  }

  return (
    <div
      className={
        dockedEdge
          ? 'h-full flex flex-col overflow-hidden bg-white max-md:rounded-none max-md:shadow-none md:rounded-tl-[16px] md:rounded-bl-[16px] md:shadow-[-8px_0_20px_-6px_rgba(46,31,42,0.18)]'
          : 'h-full flex flex-col overflow-hidden bg-white border-l border-gray-200'
      }
    >
      <div
        className={
          dockedEdge
            ? 'flex-shrink-0 min-h-16 flex items-center justify-between gap-2 bg-primary px-4 py-2 text-white'
            : compactHeader
            ? 'flex-shrink-0 bg-primary px-4 py-2 text-white flex items-center justify-between gap-2'
            : 'flex-shrink-0 bg-primary px-4 py-3 text-white flex items-center justify-between gap-2'
        }
      >
        <div className="min-w-0">
          <h3 className={compactHeader ? 'font-semibold text-sm truncate' : 'font-semibold text-lg truncate'}>
            {teamName} Chat
          </h3>
          <p className={`${compactHeader ? 'text-white/80 text-xs' : 'text-white/80 text-sm'} truncate`}>
            Team chat - only your team members can see these messages
          </p>
        </div>
        {headerAction}
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2 bg-[#f0ebe8]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No messages yet. Say hello to your team!
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = String(msg.participantId || '') === currentParticipantId;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showSender =
              !isOwn &&
              String(prevMsg?.participantId || '') !== String(msg.participantId || '');

            return (
              <div
                key={messageKey(msg)}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                  {showSender && (
                    <p className="text-xs font-medium text-primary mb-1 px-1">
                      {msg.senderName || 'Teammate'}
                    </p>
                  )}
                  <div
                    className={`relative px-3 py-2 rounded-2xl shadow-sm ${
                      isOwn
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                    } ${msg.pending ? 'opacity-80' : ''}`}
                  >
                    {renderMessageBody(msg)}
                    <p
                      className={`text-[10px] mt-1 ${
                        isOwn ? 'text-white/70 text-right' : 'text-gray-400 text-right'
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!useApiFallback && rtdbLoading && messages.length === 0 && (
        <p className="px-4 py-1 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 text-center">
          Connecting to team chat...
        </p>
      )}

      {useApiFallback && !hideSyncNotice && (
        <p className="px-4 py-1 text-xs text-primary/80 bg-primary/5 border-t border-primary/10">
          Live sync limited — messages refresh every few seconds.
        </p>
      )}

      <div className="flex-shrink-0 p-3 md:p-4 bg-white border-t border-gray-200">
        {pendingAttachment && (
          <div className="mb-2">
            {pendingAttachmentType === 'image' && pendingAttachment.previewUrl ? (
              <div className="relative inline-block">
                <img
                  src={pendingAttachment.previewUrl}
                  alt="Attachment preview"
                  className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={clearPendingAttachment}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="relative inline-flex items-center gap-2 pl-2 pr-8 py-1.5 rounded-lg border border-gray-200 bg-gray-50 max-w-full">
                <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-700 truncate max-w-[180px]">
                  {pendingAttachment.file?.name || 'File'}
                </span>
                <button
                  type="button"
                  onClick={clearPendingAttachment}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <input
            ref={galleryInputRef}
            type="file"
            accept={GALLERY_ACCEPT}
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            onChange={handleDocumentSelect}
          />
          <button
            type="button"
            onClick={openImagePicker}
            disabled={isSending}
            className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500 hover:text-primary rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            title="Share image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500 hover:text-primary rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            title="Share file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendComposer();
              }
            }}
            onPaste={handlePaste}
            placeholder={pendingAttachment ? 'Add a caption...' : 'Message your team...'}
            className="flex-1 min-w-0 min-h-11 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text"
            disabled={isSending}
          />
          <button
            type="button"
            onClick={handleSendComposer}
            disabled={(!message.trim() && !pendingAttachment) || isSending}
            className="w-11 h-11 shrink-0 bg-primary rounded-full flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
        {isSending && (
          <p className="text-xs text-gray-500 mt-2">
            Sending...
          </p>
        )}
      </div>

      {imageSourceOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                aria-label="Close photo options"
                className="absolute inset-0 bg-black/40"
                onClick={() => setImageSourceOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Add photo"
                className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-8px_24px_-8px_rgba(46,31,42,0.28)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-neutral-300" />
                </div>
                <button
                  type="button"
                  className="w-full min-h-11 px-4 py-3 text-left text-base text-text hover:bg-gray-50"
                  onClick={() => {
                    setImageSourceOpen(false);
                    cameraInputRef.current?.click();
                  }}
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  className="w-full min-h-11 px-4 py-3 text-left text-base text-text hover:bg-gray-50"
                  onClick={() => {
                    setImageSourceOpen(false);
                    galleryInputRef.current?.click();
                  }}
                >
                  Choose from Gallery
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
