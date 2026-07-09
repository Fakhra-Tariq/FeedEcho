import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip, Image as ImageIcon, FileText, Link as LinkIcon } from 'lucide-react';
import { useRtdbList } from '../../hooks/useRtdb';
import { spaceRacesAPI } from '../../services/api';
import { useHybridAlert } from '../../contexts/HybridAlertContext';

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
      className="block mt-2 p-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
    >
      <div className="flex items-center gap-2 text-primary text-sm font-medium">
        <LinkIcon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{title || hostname}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1 truncate">{url}</p>
    </a>
  );
};

export default function SpaceRaceTeamChat({ raceId, teamId, participant }) {
  const { alert } = useHybridAlert();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [apiMessages, setApiMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pastedImage, setPastedImage] = useState(null);
  const [selectedFileImage, setSelectedFileImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessagePayload = async (payload, optimisticId = null) => {
    if (!raceId || normalizedTeamId == null || !participant?.id) {
      console.error('Missing required data for sending message:', { raceId: !!raceId, teamId: normalizedTeamId, participantId: participant?.id });
      alert.toast.error('Cannot send message - missing required information');
      return null;
    }

    try {
      setIsSending(true);
      console.log('Sending message payload:', payload);
      
      const response = await spaceRacesAPI.sendTeamChatMessage(raceId, {
        participantId: participant.id,
        teamId: normalizedTeamId,
        ...payload,
      });

      console.log('Message API response:', response.data);

      if (response.data?.success) {
        const sent = response.data.data;
        if (optimisticId) {
          setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        // Clear sending state immediately after successful response
        setIsSending(false);
        if (sent && useApiFallback) {
          setApiMessages((prev) => mergeMessages(prev, [sent]));
        }
        if (useApiFallback) {
          fetchMessagesFromApi(); // Don't await, let it run in background
        }
        return sent;
      }

      if (optimisticId) {
        setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      alert.toast.error(response.data?.error || 'Failed to send message');
      return null;
    } catch (error) {
      if (optimisticId) {
        setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      console.error('Failed to send team chat message:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      alert.toast.error(error.response?.data?.error || error.message || 'Failed to send message');
      return null;
    } finally {
      setIsSending(false);
    }
  };

  const handleSendText = async () => {
    const trimmed = message.trim();
    if (!trimmed || isSending || isUploading) return;

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

  const uploadAttachment = async (file, type) => {
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

    try {
      setIsUploading(true);
      console.log('Starting upload:', { fileName: file.name, fileType: file.type, size: file.size, type });

      // Use base64 encoding for all types (more reliable without Firebase Storage)
      let downloadUrl = null;
      
      // Base64 encoding with size limits
      const maxSizeMap = {
        'image': 100 * 1024 * 1024, // 100MB for images
        'file': 100 * 1024 * 1024   // 100MB for files
      };
      
      const maxSize = maxSizeMap[type] || 5 * 1024 * 1024;
      
      console.log(`Encoding ${type} to base64...`);
      downloadUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} encoded, size:`, result.length);
          
          if (result.length > maxSize) {
            const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
            reject(new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} too large. Maximum size is ${maxSizeMB}MB for chat. Please use a smaller ${type}.`));
          } else {
            resolve(result);
          }
        };
        reader.onerror = (err) => {
          console.error('FileReader error:', err);
          reject(new Error(`Failed to read ${type} file`));
        };
        reader.readAsDataURL(file);
      });
      
      console.log('Base64 encoding completed, URL length:', downloadUrl?.length);
      
      if (!downloadUrl || !downloadUrl.startsWith('data:')) {
        throw new Error(`Failed to encode ${type} to base64`);
      }

      const optimisticId = `pending-${Date.now()}`;
      console.log('Adding optimistic message:', { optimisticId, type, fileName: file.name });
      
      setPendingMessages((prev) =>
        mergeMessages(prev, [
          {
            id: optimisticId,
            participantId: participant.id,
            senderName: participant.name || 'You',
            text: type === 'image' ? 'Shared an image' : `Shared ${file.name}`,
            type,
            url: downloadUrl,
            fileName: file.name,
            timestamp: new Date().toISOString(),
            pending: true,
          },
        ])
      );

      console.log('Sending message payload to server...');
      console.log('Payload:', {
        text: type === 'image' ? 'Shared an image' : `Shared ${file.name}`,
        type,
        urlLength: downloadUrl?.length,
        fileName: file.name,
      });
      
      const result = await sendMessagePayload(
        {
          text: type === 'image' ? 'Shared an image' : `Shared ${file.name}`,
          type,
          url: downloadUrl,
          fileName: file.name,
        },
        optimisticId
      );
      
      console.log('Message send result:', result);
      
      // Clear uploading state immediately after successful send
      setIsUploading(false);
      
      if (!result) {
        console.error('Failed to send message to server');
        throw new Error('Failed to send message to server. The file might be too large.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name
      });

      // Provide more specific error messages
      let errorMessage = 'Failed to upload file';
      if (error.message) {
        errorMessage = error.message;
      }

      alert.toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e, forcedType) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    console.log('File selected:', { name: file.name, type: file.type, size: file.size });

    // Check file size based on type
    const type = forcedType || (file.type.startsWith('image/') ? 'image' : 'file');
    const maxSizeMap = {
      'image': 100 * 1024 * 1024, // 100MB for images
      'file': 100 * 1024 * 1024   // 100MB for files
    };
    
    const maxSize = maxSizeMap[type] || 5 * 1024 * 1024;
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
    
    if (file.size > maxSize) {
      alert.toast.error(`${type.charAt(0).toUpperCase() + type.slice(1)} too large. Maximum size is ${maxSizeMB}MB for chat. Please use a smaller ${type}.`);
      return;
    }
    
    // For images, show preview before sending (like WhatsApp)
    if (type === 'image') {
      const previewUrl = URL.createObjectURL(file);
      setSelectedFileImage({ file, previewUrl });
      return;
    }

    // For files, show preview before sending
    if (type === 'file') {
      setSelectedFile({ file });
      return;
    }

    console.log('Starting upload with type:', type);

    try {
      await uploadAttachment(file, type);
    } catch (error) {
      console.error('Upload failed in handleFileSelect:', error);
      alert.toast.error(error.message || 'Failed to upload file');
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          console.log('Pasted image:', { name: file.name, type: file.type, size: file.size });
          
          // Check file size for images (max 5MB for base64)
          if (file.size > 5 * 1024 * 1024) {
            alert.toast.error('Image too large. Maximum size is 5MB for chat. Please use a smaller image.');
            return;
          }

          // Create preview URL
          const previewUrl = URL.createObjectURL(file);
          setPastedImage({ file, previewUrl });
        }
        break;
      }
    }
  };

  const sendPastedImage = async () => {
    if (!pastedImage) return;
    
    try {
      await uploadAttachment(pastedImage.file, 'image');
      setPastedImage(null);
    } catch (error) {
      console.error('Upload failed for pasted image:', error);
      alert.toast.error(error.message || 'Failed to upload pasted image');
    }
  };

  const cancelPastedImage = () => {
    if (pastedImage?.previewUrl) {
      URL.revokeObjectURL(pastedImage.previewUrl);
    }
    setPastedImage(null);
  };

  const sendSelectedFileImage = async () => {
    if (!selectedFileImage) return;
    
    try {
      await uploadAttachment(selectedFileImage.file, 'image');
      setSelectedFileImage(null);
    } catch (error) {
      console.error('Upload failed for selected image:', error);
      alert.toast.error(error.message || 'Failed to upload image');
    }
  };

  const cancelSelectedFileImage = () => {
    if (selectedFileImage?.previewUrl) {
      URL.revokeObjectURL(selectedFileImage.previewUrl);
    }
    setSelectedFileImage(null);
  };

  const sendSelectedFile = async () => {
    if (!selectedFile) return;

    console.log('sendSelectedFile called:', { file: selectedFile.file.name, size: selectedFile.file.size, type: selectedFile.file.type });

    try {
      await uploadAttachment(selectedFile.file, 'file');
      console.log('Upload completed successfully, clearing selectedFile');
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed for selected file:', error);
      alert.toast.error(error.message || 'Failed to upload file');
    }
  };

  const cancelSelectedFile = () => {
    setSelectedFile(null);
  };

  const renderMessageBody = (msg) => {
    if (msg.type === 'image' && msg.url) {
      return (
        <div>
          {msg.text && <p className="text-sm mb-2">{msg.text}</p>}
          <img
            src={msg.url}
            alt={msg.fileName || 'Shared image'}
            className="max-w-full rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setSelectedImage(msg.url)}
          />
        </div>
      );
    }

    if (msg.type === 'file' && msg.url) {
      return (
        <div>
          {msg.text && <p className="text-sm mb-2">{msg.text}</p>}
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
        </div>
      );
    }

    if (msg.type === 'link' && msg.url) {
      return (
        <div>
          {msg.text && <p className="text-sm mb-1">{msg.text}</p>}
          <LinkPreview url={msg.url} title={msg.linkTitle} />
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
    <div className="h-full flex flex-col overflow-hidden bg-white border-l border-gray-200">
      <div className="flex-shrink-0 bg-primary px-4 py-3 text-white">
        <h3 className="font-semibold text-lg">{teamName} Chat</h3>
        <p className="text-white/80 text-sm">Team chat - only your team members can see these messages</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 bg-[#f0ebe8]">
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
        <div ref={messagesEndRef} />
      </div>

      {!useApiFallback && rtdbLoading && messages.length === 0 && (
        <p className="px-4 py-1 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 text-center">
          Connecting to team chat...
        </p>
      )}

      {useApiFallback && (
        <p className="px-4 py-1 text-xs text-primary/80 bg-primary/5 border-t border-primary/10">
          Live sync limited — messages refresh every few seconds.
        </p>
      )}

      <div className="flex-shrink-0 p-4 bg-white border-t border-gray-200">
        <div className="flex items-center gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp"
            className="hidden"
            onChange={(e) => handleFileSelect(e, 'image')}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
            className="hidden"
            onChange={(e) => handleFileSelect(e, 'file')}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploading || isSending}
            className="p-2 text-gray-500 hover:text-primary rounded-lg hover:bg-gray-100 transition-colors"
            title="Share image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSending}
            className="p-2 text-gray-500 hover:text-primary rounded-lg hover:bg-gray-100 transition-colors"
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
                handleSendText();
              }
            }}
            onPaste={handlePaste}
            placeholder="Message your team..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text"
            disabled={isSending || isUploading}
          />
          <button
            type="button"
            onClick={handleSendText}
            disabled={!message.trim() || isSending || isUploading}
            className="w-11 h-11 bg-primary rounded-full flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
        {(isUploading || isSending) && (
          <p className="text-xs text-gray-500 mt-2">
            {isUploading ? 'Uploading...' : 'Sending...'}
          </p>
        )}
        
        {/* Pasted Image Preview */}
        {pastedImage && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-start gap-3">
              <img
                src={pastedImage.previewUrl}
                alt="Pasted image"
                className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Image ready to send</p>
                <p className="text-xs text-gray-500 mt-1">Size: {(pastedImage.file.size / 1024).toFixed(1)} KB</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={sendPastedImage}
                    disabled={isUploading}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={cancelPastedImage}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Selected File Image Preview */}
        {selectedFileImage && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-start gap-3">
              <img
                src={selectedFileImage.previewUrl}
                alt="Selected image"
                className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Image ready to send</p>
                <p className="text-xs text-gray-500 mt-1">Size: {(selectedFileImage.file.size / 1024).toFixed(1)} KB</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={sendSelectedFileImage}
                    disabled={isUploading}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={cancelSelectedFileImage}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selected File Preview */}
        {selectedFile && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-start gap-3">
              <div className="w-20 h-20 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">File ready to send</p>
                <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]">{selectedFile.file.name}</p>
                <p className="text-xs text-gray-500 mt-1">Size: {(selectedFile.file.size / 1024).toFixed(1)} KB</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={sendSelectedFile}
                    disabled={isUploading}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={cancelSelectedFile}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
