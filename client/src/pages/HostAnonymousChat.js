import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHostData } from '../contexts/HostDataContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import {
  MessageSquare,
  Users,
  Settings,
  Trash2,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  Send,
  ArrowDown,
} from 'lucide-react';
import clsx from 'clsx';
import ChatCreatedModal from '../components/ChatCreatedModal';
import { useAuth } from '../contexts/AuthContext';
import { useRtdbList, useRtdbValue } from '../hooks/useRtdb';
import { anonymousChatAPI } from '../services/api';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  requireActiveHostSession,
} from '../utils/requireActiveHostSession';
import InfoRecap from '../components/Host/InfoRecap';
import SessionLaunchBanner from '../components/Host/SessionLaunchBanner';
import PageHeaderCard from '../components/Host/PageHeaderCard';
import ChatMessageBubble from '../components/Chat/ChatMessageBubble';
import { toParticipantCount } from '../utils/toParticipantCount';

export default function HostAnonymousChat() {
  const { user, userProfile } = useAuth();
  const uid = userProfile?.uid || user?.uid;
  const { data, setData, addAnonymousChatSession, updateAnonymousChat, logActivity, toggleChatModeration } = useHostData();
  const { alert } = useHybridAlert();
  const { list: anonymousChats } = useRtdbList('chat_sessions', {
    enabled: true,
    // Some older chats may have missing createdBy (auth optional on create).
    // Prefer showing the teacher's own chats; fall back to including legacy null-createdBy chats.
    filter: (c) => {
      if (!uid) return true;
      return c?.createdBy === uid || c?.createdBy == null;
    },
    sort: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  });
  const [selectedChat, setSelectedChat] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showChatCreated, setShowChatCreated] = useState(false);
  const [createdChatCode, setCreatedChatCode] = useState('');
  const [deleteConfirmChat, setDeleteConfirmChat] = useState(null);
  const [moderationMode, setModerationMode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [apiChats, setApiChats] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [hasUnseenIncoming, setHasUnseenIncoming] = useState(false);
  const [readCounts, setReadCounts] = useState({});
  const messagesContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
  });

  const isChatActive = (chat) => {
    if (!chat) return false;
    return chat.status === 'active' || (chat.status == null && chat.isActive !== false);
  };

  // RTDB live selected chat session + messages
  const selectedChatId = selectedChat?.id;
  const { value: selectedChatLive } = useRtdbValue(
    selectedChatId ? `chat_sessions/${selectedChatId}` : null,
    { enabled: Boolean(selectedChatId) }
  );
  const { list: selectedChatMessages } = useRtdbList(
    selectedChatId ? `chat_messages/${selectedChatId}` : null,
    {
      enabled: Boolean(selectedChatId),
      sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
    }
  );

  const getMessageCount = (chat) => {
    if (chat.id === selectedChatId) {
      return selectedChatMessages.length;
    }
    return chat.messageCount ?? 0;
  };

  const getParticipantCount = (chat) => {
    if (chat.id === selectedChatId) {
      return toParticipantCount(selectedChatLive?.participants);
    }
    return toParticipantCount(chat.participants);
  };

  const selectedParticipantCount = toParticipantCount(selectedChatLive?.participants);

  useEffect(() => {
    if (!selectedChatId) return;
    if (!selectedChatLive) return;
    setSelectedChat((prev) => ({
      ...(prev || {}),
      ...selectedChatLive,
      id: selectedChatId,
      messages: selectedChatMessages,
    }));
    setModerationMode(selectedChatLive?.settings?.moderationMode || false);
  }, [selectedChatId, selectedChatLive, selectedChatMessages]);

  const sidebarChats = (anonymousChats && anonymousChats.length > 0) ? anonymousChats : apiChats;

  const activeChats = (sidebarChats || []).filter((chat) => isChatActive(chat));
  const endedChats = (sidebarChats || []).filter(
    (chat) => chat.status === 'ended' || chat.isActive === false
  );

  const chatIdsForStatsSync = useMemo(
    () => [...activeChats, ...endedChats].map((chat) => chat.id).filter(Boolean).sort().join('|'),
    [activeChats, endedChats]
  );
  const syncedStatsRef = useRef(new Set());

  useEffect(() => {
    if (!chatIdsForStatsSync) return;
    chatIdsForStatsSync.split('|').forEach((id) => {
      if (syncedStatsRef.current.has(id)) return;
      syncedStatsRef.current.add(id);
      anonymousChatAPI.syncStats(id).catch(() => {});
    });
  }, [chatIdsForStatsSync]);

  const scrollToBottom = (behavior = 'auto') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Scroll *inside* the messages pane so the whole page doesn't jump.
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 120;
      shouldAutoScrollRef.current = nearBottom;
      if (nearBottom) setHasUnseenIncoming(false);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [selectedChatId]);

  useEffect(() => {
    const messageCount = selectedChat?.messages?.length || 0;
    const isNewMessage = messageCount > lastMessageCountRef.current;
    lastMessageCountRef.current = messageCount;

    if (!isNewMessage) return;
    if (!shouldAutoScrollRef.current) {
      // Teacher is reading earlier messages — offer a jump instead of yanking the view down.
      setHasUnseenIncoming(true);
      return;
    }
    scrollToBottom('auto');
  }, [selectedChat?.messages]);

  // Switching chats starts a fresh thread view
  useEffect(() => {
    lastMessageCountRef.current = 0;
    shouldAutoScrollRef.current = true;
    setHasUnseenIncoming(false);
    setMessageDraft('');
  }, [selectedChatId]);

  // Unread tracking: chats already listed when the page loads start as read,
  // so only messages that arrive while the teacher is here light up.
  useEffect(() => {
    const list = sidebarChats || [];
    if (list.length === 0) return;
    setReadCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      list.forEach((chat) => {
        if (!chat?.id || next[chat.id] !== undefined) return;
        next[chat.id] = chat.messageCount ?? 0;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [sidebarChats]);

  // Whatever is open is being read
  useEffect(() => {
    if (!selectedChatId) return;
    const count = selectedChatMessages.length;
    setReadCounts((prev) =>
      prev[selectedChatId] === count ? prev : { ...prev, [selectedChatId]: count }
    );
  }, [selectedChatId, selectedChatMessages.length]);

  const getUnreadCount = (chat) => {
    const read = readCounts[chat.id];
    if (read === undefined) return 0;
    return Math.max(0, getMessageCount(chat) - read);
  };

  const getChatPreview = (chat) => {
    if (chat.id === selectedChatId && selectedChatMessages.length > 0) {
      const last = selectedChatMessages[selectedChatMessages.length - 1];
      const text = (last?.content || last?.message || '').trim();
      if (text) return last?.isTeacher ? `You: ${text}` : text;
    }
    return chat.description || '';
  };

  const handleSendMessage = async (event) => {
    event?.preventDefault?.();
    const trimmed = messageDraft.trim();
    if (!trimmed || !selectedChat?.id || isSendingMessage) return;

    try {
      setIsSendingMessage(true);
      const response = await anonymousChatAPI.addTeacherMessage(selectedChat.id, {
        message: trimmed,
      });
      if (!response.data?.success) {
        alert.toast.error(response.data?.error || 'Failed to send message');
        return;
      }
      // RTDB listeners append the message; just keep the view pinned to the bottom.
      setMessageDraft('');
      shouldAutoScrollRef.current = true;
      setHasUnseenIncoming(false);
    } catch (error) {
      console.error('Error sending message:', error);
      alert.toast.error(error?.response?.data?.error || 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const jumpToLatest = () => {
    shouldAutoScrollRef.current = true;
    setHasUnseenIncoming(false);
    scrollToBottom('smooth');
  };

  // Real-time updates are handled by RTDB listeners (no simulation / polling)
  const loadChatsFromApi = async () => {
    try {
      const response = await anonymousChatAPI.getAll();
      if (response.data?.success) {
        setApiChats(response.data.data || []);
      }
    } catch (error) {
      // Keep RTDB list working even if API call fails.
      console.error('Failed to load chats from API:', error);
    }
  };

  useEffect(() => {
    if (!uid) return;
    loadChatsFromApi();
  }, [uid]);

  const handleCreate = async () => {
    if (!createForm.title || isCreating) return;

    const sessionCheck = requireActiveHostSession(data.activeSession);
    if (!sessionCheck.ok) {
      alert.toast.error(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    // Check if there's already an active chat
    const sidebarChats = (anonymousChats && anonymousChats.length > 0) ? anonymousChats : apiChats;
    const existingActiveChat = (sidebarChats || []).find((chat) => isChatActive(chat));
    if (existingActiveChat) {
      alert.toast.error('You already have an active chat. Please end the current chat before creating a new one.');
      return;
    }
    
    try {
      setIsCreating(true);
      // Create chat with default settings
      const chatPayload = {
        title: createForm.title,
        description: createForm.description,
        allowQuestions: true,        // Default: students can send questions
        profanityFilter: true,       // Default: profanity filter ON
      };
      
      const chat = await addAnonymousChatSession(chatPayload);
      logActivity({ type: 'anonymousChat', title: `Created anonymous chat: ${chat.title}` });
      
      // Reset form and show success modal
      setCreateForm({
        title: '',
        description: '',
      });
      setShowCreate(false);
      setCreatedChatCode(chat.joinCode);
      setShowChatCreated(true);
      
      // Store the created chat reference for immediate selection
      setSelectedChat(chat);
      
      // Update moderation mode state to match backend
      setModerationMode(chat.moderationMode || false);
      loadChatsFromApi();
    } catch (error) {
      console.error('Error creating chat:', error);
      const errorMessage = error?.response?.data?.error || 'Failed to create chat. Please try again.';
      alert.toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseChatCreated = () => {
    setShowChatCreated(false);
    setCreatedChatCode('');
  };

  const copyJoinCode = async (joinCode) => {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopiedCode(joinCode);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const toggleModeration = async () => {
    if (!selectedChat) return;
    
    try {
      const newMode = !moderationMode;
      await toggleChatModeration(selectedChat.id, newMode);
      setModerationMode(newMode);
    } catch (error) {
      console.error('Error toggling moderation:', error);
      alert.toast.error('Failed to toggle moderation mode. Please try again.');
    }
  };

  const handleEndChat = async () => {
    if (!selectedChat) return;

    try {
      await updateAnonymousChat(selectedChat.id, {
        status: 'ended',
        isActive: false,
        endedAt: new Date().toISOString(),
      });

      logActivity({ type: 'anonymousChat', title: `Ended chat: ${selectedChat.title}` });
      setSelectedChat(null);
      lastMessageCountRef.current = 0;
      shouldAutoScrollRef.current = true;
      await loadChatsFromApi();
    } catch (error) {
      console.error('Error ending chat:', error);
      alert.toast.error(error?.response?.data?.error || 'Failed to end chat');
    }
  };

  const handleDeleteChat = (chatId) => {
    // Set chat for deletion confirmation
    setDeleteConfirmChat(chatId);
  };

  const confirmDeleteChat = async () => {
    if (deleteConfirmChat) {
      try {
        // Delete via backend; RTDB listeners will update UI
        await updateAnonymousChat(deleteConfirmChat, { __delete: true });

        logActivity({ type: 'anonymousChat', title: `Deleted chat` });
        
        // Clear selected chat if it was the deleted one
        if (selectedChat?.id === deleteConfirmChat) {
          setSelectedChat(null);
        }
        
        setDeleteConfirmChat(null);
        
        // Show success toast (same style as quiz updates)
        setTimeout(() => {
          alert.toast.success('Chat deleted successfully');
        }, 100);
        await loadChatsFromApi();
      } catch (error) {
        console.error('Error deleting chat:', error);
        alert.toast.error(error?.response?.data?.error || 'Failed to delete chat');
      }
    }
  };

  const cancelDeleteChat = () => {
    setDeleteConfirmChat(null);
  };

  const renderChatItem = (chat) => {
    const isSelected = selectedChat?.id === chat.id;
    const ended = !isChatActive(chat);
    const unread = getUnreadCount(chat);
    const preview = getChatPreview(chat);

    return (
      <div
        key={chat.id}
        onClick={() => setSelectedChat(chat)}
        className={clsx(
          'px-3 py-3 rounded-xl border cursor-pointer transition-colors',
          isSelected
            ? 'bg-primary/10 border-primary/30'
            : 'bg-white border-primary/10 hover:bg-background'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                ended ? 'bg-text-light/40' : 'bg-emerald-500'
              )}
            />
            <h4 className="font-medium text-text text-sm truncate">{chat.title}</h4>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {unread > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-semibold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            {ended && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
                className="p-1 text-text-light hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {preview && <p className="text-xs text-text-light mt-1.5 truncate">{preview}</p>}

        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="inline-flex items-center gap-2 text-[11px] text-text-light">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {getMessageCount(chat)}
            </span>
            {ended ? (
              <span>Ended {chat.endedAt ? new Date(chat.endedAt).toLocaleDateString() : ''}</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {getParticipantCount(chat)}
              </span>
            )}
          </span>

          {!ended && (
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] font-mono bg-background px-1.5 py-0.5 rounded text-text">
                Code: {chat.joinCode}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyJoinCode(chat.joinCode);
                }}
                className="p-1 text-text-light hover:text-primary transition-colors"
                title="Copy join code"
              >
                {copiedCode === chat.joinCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </span>
          )}
        </div>
      </div>
    );
  };

  const selectedMessages = selectedChat?.messages || [];

  return (
    <div className="px-6 -mt-4 lg:-mt-5 flex flex-col gap-3 overflow-hidden min-h-[450px] h-[calc(100dvh-8.75rem)] lg:h-[calc(100dvh-5.75rem)] max-h-[calc(100dvh-8.75rem)] lg:max-h-[calc(100dvh-5.75rem)]">
      <div className="shrink-0">
        <SessionLaunchBanner className="!mt-0" />
      </div>

      <div className="shrink-0">
        <PageHeaderCard
        compact
        title="Anonymous Chat"
        titleAccessory={
          <InfoRecap
            variant="onDark"
            steps={[
              'Create a new chat with a title and description',
              'Launching requires an active session',
              'The audience sends anonymous messages/questions',
              'You respond verbally in class; there\'s no written reply sent back through the app. Use Moderation ON/OFF to control the chat.',
            ]}
          />
        }
        subtitle="Anonymous Q&A and feedback sessions"
        actions={
          <>
            <button
              onClick={toggleModeration}
              className={clsx(
                'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                moderationMode
                  ? 'bg-white/25 border-white/60 text-white hover:bg-white/35'
                  : 'bg-white/10 border-white/30 text-white/90 hover:bg-white/20'
              )}
            >
              <Settings className="w-4 h-4 mr-2" />
              {moderationMode ? 'Moderation ON' : 'Moderation OFF'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center px-4 py-2 bg-white text-primary text-sm font-medium rounded-lg hover:bg-white/90 transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              New Chat
            </button>
          </>
        }
      />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
        <aside className="w-full lg:w-[300px] shrink-0 min-h-0 bg-white rounded-2xl border border-primary/15 shadow-sm p-3 space-y-5 overflow-y-auto max-h-[360px] lg:max-h-none lg:h-full">
          <div>
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-light mb-2">Active Chats</h3>
            <div className="space-y-2">
              {activeChats.map((chat) => renderChatItem(chat))}
              {activeChats.length === 0 && (
                <div className="flex flex-col items-center text-center py-6 px-3">
                  <MessageSquare className="w-6 h-6 text-primary/30 mb-2" />
                  <p className="text-xs text-text-light">No active chats</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-light mb-2">Past Chats</h3>
            <div className="space-y-2">
              {endedChats.map((chat) => renderChatItem(chat))}
              {endedChats.length === 0 && (
                <div className="flex flex-col items-center text-center py-6 px-3">
                  <Clock className="w-6 h-6 text-primary/30 mb-2" />
                  <p className="text-xs text-text-light">No past chats</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-white rounded-2xl border border-primary/15 shadow-sm h-full">
          {selectedChat ? (
            <>
              <div className="px-5 py-3 border-b border-primary/10 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-text truncate">{selectedChat.title}</h3>
                    <span className="inline-flex items-center gap-1 text-sm text-text-light shrink-0">
                      <Users className="w-4 h-4" />
                      {selectedParticipantCount} participants
                    </span>
                    {selectedChat.status !== 'active' && (
                      <span className="inline-flex items-center text-sm text-text-light shrink-0">
                        <Clock className="w-4 h-4 mr-1" />
                        Ended{selectedChat.endedAt ? ` • ${new Date(selectedChat.endedAt).toLocaleDateString()}` : ''}
                      </span>
                    )}
                  </div>

                  {selectedChat.status === 'active' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 bg-background border border-primary/15 rounded-xl pl-3 pr-1.5 py-1.5">
                        <span className="text-[11px] font-medium text-text-light whitespace-nowrap">Access Code</span>
                        <span className="text-sm font-mono font-bold text-primary">
                          {selectedChat.joinCode}
                        </span>
                        <button
                          onClick={() => copyJoinCode(selectedChat.joinCode)}
                          className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Copy access code"
                        >
                          {copiedCode === selectedChat.joinCode ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <button
                        onClick={handleEndChat}
                        className="px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
                      >
                        End Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  ref={messagesContainerRef}
                  className="chat-messages-scroll flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3"
                >
                  {selectedMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <MessageSquare className="w-6 h-6 text-primary/60" />
                      </div>
                      <p className="text-sm text-text-light max-w-sm">
                        No messages yet. Share the access code with the audience to start receiving questions.
                      </p>
                    </div>
                  ) : (
                    selectedMessages.map((msg) => {
                      const fromTeacher = Boolean(msg.isTeacher);
                      return (
                        <ChatMessageBubble
                          key={msg.id}
                          message={msg}
                          isOwn={fromTeacher}
                          label={fromTeacher ? 'You' : 'Audience'}
                          showStudentDot={!fromTeacher}
                        />
                      );
                    })
                  )}
                </div>

                {hasUnseenIncoming && (
                  <button
                    onClick={jumpToLatest}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                    New message
                  </button>
                )}
              </div>

              {isChatActive(selectedChat) && (
                <form onSubmit={handleSendMessage} className="px-5 py-3 border-t border-primary/10 shrink-0">
                  <div className="flex items-center gap-2 bg-background border border-primary/15 rounded-full pl-4 pr-1.5 py-1.5 transition-colors focus-within:border-primary/40">
                    <input
                      type="text"
                      value={messageDraft}
                      onChange={(e) => setMessageDraft(e.target.value)}
                      placeholder="Message audience…"
                      className="flex-1 bg-transparent text-sm text-text placeholder-text-light focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!messageDraft.trim() || isSendingMessage}
                      className="p-2 rounded-full bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 min-h-0">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 text-primary/60" />
                </div>
                <h3 className="text-base font-medium text-text mb-1">Select a chat</h3>
                <p className="text-sm text-text-light">
                  Choose a chat from the sidebar to view and moderate messages
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-text">Create Anonymous Chat</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">Chat Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                  placeholder="e.g., Weekly Q&A Session"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                  rows={3}
                  placeholder="Optional description for the audience"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-light bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.title || isCreating}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? 'Creating…' : 'Create Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Created Success Modal */}
      <ChatCreatedModal
        isOpen={showChatCreated}
        onClose={handleCloseChatCreated}
        accessCode={createdChatCode}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDeleteChat}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Chat</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this chat? This action cannot be undone.
            </p>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={cancelDeleteChat}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteChat}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
