import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTeacherData } from '../contexts/TeacherDataContext';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { MessageSquare, Users, Settings, Trash2, Clock, CheckCircle, Copy, Check, AlertTriangle } from 'lucide-react';
import ChatCreatedModal from '../components/ChatCreatedModal';
import { useAuth } from '../contexts/AuthContext';
import { useRtdbList, useRtdbValue } from '../hooks/useRtdb';
import { anonymousChatAPI } from '../services/api';
import {
  NO_ACTIVE_SESSION_MESSAGE,
  requireActiveTeacherSession,
} from '../utils/requireActiveTeacherSession';

export default function TeacherAnonymousChat() {
  const { user, userProfile } = useAuth();
  const uid = userProfile?.uid || user?.uid;
  const { data, setData, addAnonymousChatSession, updateAnonymousChat, logActivity, toggleChatModeration } = useTeacherData();
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
      return selectedChatLive?.participants ?? 0;
    }
    return chat.participants ?? 0;
  };

  const selectedParticipantCount = selectedChatLive?.participants ?? 0;

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
    if (!shouldAutoScrollRef.current) return;
    scrollToBottom('auto');
  }, [selectedChat?.messages]);

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
    if (!createForm.title) return;

    const sessionCheck = requireActiveTeacherSession(data.activeSession);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Anonymous Chat</h1>
          <p className="text-text-light mt-1">Anonymous Q&A and feedback sessions</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleModeration}
            className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
              moderationMode 
                ? 'bg-[#6D415F] text-white hover:bg-[#5A344D]' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Settings className="w-4 h-4 mr-2" />
            {moderationMode ? 'Moderation ON' : 'Moderation OFF'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            New Chat
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-text mb-4">Active Chats</h3>
            <div className="space-y-2">
              {activeChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedChat?.id === chat.id
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-text">{chat.title}</h4>
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  </div>
                  <p className="text-sm text-text-light mb-2">{chat.description}</p>
                  <div className="flex items-center justify-between text-xs text-text-light mb-2">
                    <span>{getMessageCount(chat)} messages</span>
                    <span>{getParticipantCount(chat)} participants</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-text">
                        Code: {chat.joinCode}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyJoinCode(chat.joinCode);
                      }}
                      className="p-1 text-gray-400 hover:text-primary transition-colors"
                      title="Copy join code"
                    >
                      {copiedCode === chat.joinCode ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
              {activeChats.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No active chats</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-text mb-4">Past Chats</h3>
            <div className="space-y-2">
              {endedChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedChat?.id === chat.id
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-text">{chat.title}</h4>
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(chat.id);
                        }}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Delete chat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-light">
                    <span>{getMessageCount(chat)} messages</span>
                    <span>Ended {new Date(chat.endedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {endedChats.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No past chats</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedChat ? (
            <div className="bg-white rounded-lg border border-gray-200 h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-text">{selectedChat.title}</h3>
                    <p className="text-sm text-text-light">
                      {selectedChat.status === 'active' ? (
                        <span className="flex items-center">
                          <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                          Active • {selectedParticipantCount} participants
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 text-gray-400 mr-1" />
                          Ended • {new Date(selectedChat.endedAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  {selectedChat.status === 'active' && (
                    <button
                      onClick={handleEndChat}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
                    >
                      End Chat
                    </button>
                  )}
                </div>
                
                {/* Student Access Code - Prominently Displayed */}
                {selectedChat.status === 'active' && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-blue-700 mb-1">Student Access Code</p>
                        <div className="flex items-center space-x-2">
                          <span className="text-lg font-mono font-bold text-blue-900">
                            {selectedChat.joinCode}
                          </span>
                          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                            Share with students
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => copyJoinCode(selectedChat.joinCode)}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Copy access code"
                      >
                        {copiedCode === selectedChat.joinCode ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedChat.messages?.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-text-light">No messages yet. Share the access code with students to start receiving questions.</p>
                  </div>
                ) : (
                  selectedChat.messages.filter(msg => !msg.isTeacher).map(msg => (
                    <div
                      key={msg.id}
                      className="flex justify-start"
                    >
                      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.isHidden
                          ? 'bg-gray-200 text-gray-400 line-through'
                          : msg.isAnswered
                          ? 'bg-green-100 border border-green-200 text-text'
                          : 'bg-gray-100 text-text'
                      }`}>
                        <p className="text-sm">{msg.content || msg.message}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs opacity-70">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                          {msg.isAnswered && (
                            <span className="text-xs text-green-600 font-medium">
                              ✓ Answered
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 h-[600px] flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text mb-2">Select a chat</h3>
                <p className="text-text-light">Choose a chat from the sidebar to view and moderate messages</p>
              </div>
            </div>
          )}
        </div>
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
                  placeholder="Optional description for students"
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
                disabled={!createForm.title}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Chat
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
