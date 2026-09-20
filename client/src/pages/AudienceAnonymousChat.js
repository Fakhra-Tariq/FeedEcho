import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, MessageSquare, Users, AlertCircle } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { anonymousChatAPI } from '../services/api';
import { useRtdbList, useRtdbValue, RTDB_EMPTY_LIST } from '../hooks/useRtdb';
import { toParticipantCount } from '../utils/toParticipantCount';
import ChatMessageBubble from '../components/Chat/ChatMessageBubble';

const getOrCreateChatParticipantId = (sessionCode) => {
  const storageKey = `chatParticipant_${sessionCode}`;
  let participantId = sessionStorage.getItem(storageKey);
  if (!participantId) {
    participantId = `student-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(storageKey, participantId);
  }
  return participantId;
};

const isChatSessionEnded = (session) =>
  Boolean(session && (session.status === 'ended' || session.isActive === false));

const AudienceAnonymousChat = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { alert } = useHybridAlert();
  const [sessionCode, setSessionCode] = useState('');
  const [message, setMessage] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [joinError, setJoinError] = useState('');
  const messagesEndRef = React.useRef(null);
  const lastAutoJoinCodeRef = React.useRef(null);
  const [isSending, setIsSending] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const sentMessageIdsRef = useRef(new Set());
  const [sentMessageVersion, setSentMessageVersion] = useState(0);

  useEffect(() => {
    const codeFromUrl = searchParams.get('code');
    if (!codeFromUrl) return;
    const normalized = String(codeFromUrl).trim().toUpperCase();
    if (!normalized) return;

    setSessionCode(normalized);

    if (lastAutoJoinCodeRef.current === normalized) return;
    lastAutoJoinCodeRef.current = normalized;

    handleJoinChat(normalized, { silentSuccess: false });
  }, [searchParams]);

  const normalizedCode = useMemo(() => sessionCode.trim().toUpperCase(), [sessionCode]);

  const { value: joinResolvedChatId } = useRtdbValue(
    normalizedCode ? `chat_join_codes/${normalizedCode}` : null,
    { enabled: Boolean(normalizedCode) }
  );

  useEffect(() => {
    if (!joinResolvedChatId) return;
    setChatId(String(joinResolvedChatId));
  }, [joinResolvedChatId]);

  const liveChatId = joinResolvedChatId ? String(joinResolvedChatId) : chatId;

  const { value: chatSession } = useRtdbValue(liveChatId ? `chat_sessions/${liveChatId}` : null, {
    enabled: Boolean(liveChatId),
  });

  const { list: messages } = useRtdbList(liveChatId ? `chat_messages/${liveChatId}` : null, {
    enabled: Boolean(liveChatId),
    sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
    empty: RTDB_EMPTY_LIST,
  });

  const isChatEnded = isChatSessionEnded(chatSession);
  const canSendMessages = Boolean(chatSession && !isChatEnded && chatSession?.settings?.moderationMode === true);
  const participantCount = toParticipantCount(chatSession?.participants);
  const visibleMessages = messages.filter((msg) => !msg.isHidden);
  const showActiveChat = Boolean(chatSession && !isChatEnded);

  const ownSentIds = useMemo(
    () => new Set(sentMessageIdsRef.current),
    [sentMessageVersion]
  );

  const isOwnStudentMessage = (msg) => {
    if (!msg || msg.isTeacher) return false;
    if (ownSentIds.has(msg.id)) return true;
    if (participantId && msg.participantId && String(msg.participantId) === String(participantId)) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!normalizedCode) return;
    setParticipantId(getOrCreateChatParticipantId(normalizedCode));
  }, [normalizedCode]);

  useEffect(() => {
    if (isChatEnded && chatSession) {
      setJoinError('This chat has ended and is no longer available.');
      setMessage('');
    }
  }, [isChatEnded, chatSession]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!showActiveChat || !liveChatId || !participantId) return undefined;

    const sendPresence = () => {
      anonymousChatAPI.presence(liveChatId, { participantId }).catch(() => {});
    };

    sendPresence();
    const intervalId = window.setInterval(sendPresence, 20000);

    const leaveChat = () => {
      anonymousChatAPI.leave(liveChatId, { participantId }).catch(() => {});
    };

    window.addEventListener('pagehide', leaveChat);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', leaveChat);
      leaveChat();
    };
  }, [showActiveChat, liveChatId, participantId]);

  const handleJoinChat = useCallback(async (overrideCode, opts = {}) => {
    const codeToUse = (overrideCode || normalizedCode || '').trim().toUpperCase();
    const silentSuccess = opts?.silentSuccess === true;

    if (!codeToUse) {
      alert.toast.error('Please enter a session code');
      return;
    }

    if (isJoining) return;
    setIsJoining(true);
    setJoinError('');

    try {
      const nextParticipantId = getOrCreateChatParticipantId(codeToUse);
      setParticipantId(nextParticipantId);

      const response = await anonymousChatAPI.getByCode(codeToUse, {
        participantId: nextParticipantId,
      });
      if (!response.data.success) throw new Error('Invalid or inactive chat session code');

      const chat = response.data.data;
      if (isChatSessionEnded(chat)) {
        setChatId(null);
        setJoinError('This chat has ended and is no longer available.');
        alert.toast.error('This chat has ended and is no longer available.');
        return;
      }

      setChatId(chat.id);
      if (!silentSuccess) {
        alert.toast.success('Joined chat session successfully');
      }
    } catch (error) {
      const messageText =
        error.response?.data?.error ||
        error.message ||
        'Invalid or inactive chat session code';
      setJoinError(messageText);
      setChatId(null);
      alert.toast.error(messageText);
    } finally {
      setIsJoining(false);
    }
  }, [alert.toast, normalizedCode, isJoining]);

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || !chatSession || isChatEnded) return;
    if (!canSendMessages || isSending) return;

    try {
      setIsSending(true);
      setMessage('');
      scrollToBottom();

      const response = await anonymousChatAPI.addMessage(chatSession.id, {
        message: trimmed,
        sender: 'Anonymous Audience',
        participantId: participantId || getOrCreateChatParticipantId(normalizedCode),
      });

      if (!response.data.success) {
        const errorText = response.data.error || 'Failed to send message';
        alert.toast.error(errorText);
      } else if (response.data.data?.id) {
        sentMessageIdsRef.current.add(response.data.data.id);
        setSentMessageVersion((n) => n + 1);
      }
    } catch (error) {
      const errorText =
        error.response?.data?.error ||
        error.message ||
        'Failed to send message';
      alert.toast.error(errorText);
    } finally {
      setIsSending(false);
    }
  };

  const showJoinForm = !showActiveChat;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/audience/join')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-text">Anonymous Chat</h1>
          </div>
          <div className="w-20" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {showJoinForm ? (
          <div className="w-full max-w-md">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-text mb-2">
                  {isChatEnded ? 'Chat Ended' : 'Join Anonymous Chat'}
                </h2>
                <p className="text-text-light">
                  {isChatEnded
                    ? 'This live chat has ended. Ask your host for a new session code if you still have questions.'
                    : 'Enter the session code to join the chat'}
                </p>
              </div>

              {joinError && (
                <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  {joinError}
                </div>
              )}

              {!isChatEnded && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-light mb-2">Session Code</label>
                    <input
                      type="text"
                      value={sessionCode}
                      onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                      placeholder="Enter 6-character code"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text font-mono text-center text-lg"
                      maxLength={6}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleJoinChat();
                        }
                      }}
                    />
                  </div>

                  <button
                    onClick={handleJoinChat}
                    disabled={!sessionCode.trim() || isJoining}
                    className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isJoining ? 'Joining...' : 'Join Chat'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg h-[600px] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-text">{chatSession.title}</h3>
                  <p className="text-sm text-text-light">
                    Session Code: <span className="font-mono font-bold">{chatSession.joinCode}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-text-light">{participantCount} participants</span>
                </div>
              </div>

              <div className="mt-3">
                {canSendMessages ? (
                  <div className="flex items-center space-x-2 text-green-600 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Chat is active - You can send messages</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-orange-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Waiting for host to enable chat...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {visibleMessages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-text-light">
                    {canSendMessages
                      ? 'Be the first to send a message!'
                      : 'Waiting for host to enable chat...'}
                  </p>
                </div>
              ) : (
                visibleMessages.map((msg) => {
                  const isOwn = isOwnStudentMessage(msg);
                  const fromTeacher = Boolean(msg.isTeacher);
                  return (
                    <ChatMessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={isOwn}
                      label={isOwn ? 'You' : fromTeacher ? 'Host' : 'Audience'}
                      showStudentDot={!isOwn && !fromTeacher}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {canSendMessages ? (
              <div className="p-4 border-t border-gray-200">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSending}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 border-t border-gray-200">
                <div className="text-center text-gray-500 text-sm">
                  <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                  <p>Waiting for host to enable chat...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudienceAnonymousChat;
