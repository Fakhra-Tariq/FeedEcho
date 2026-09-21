import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, MessageSquare, Users, AlertCircle } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { anonymousChatAPI } from '../services/api';
import { useRtdbList, useRtdbValue, RTDB_EMPTY_LIST } from '../hooks/useRtdb';
import { toParticipantCount } from '../utils/toParticipantCount';
import { getStoredAudienceSession } from '../utils/audienceSession';
import ChatMessageBubble from '../components/Chat/ChatMessageBubble';
import GuestProgressLoginBanner, {
  GUEST_LOGIN_BANNER_BG_CLASS,
} from '../components/Audience/GuestProgressLoginBanner';
import {
  AudienceActivityHeader,
  AudienceActivityContent,
  AudienceActivityCard,
  AUDIENCE_ACTIVITY_PAGE_WIDTH,
} from '../components/Audience/AudienceActivityLayout';

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
  const participantDisplayName =
    (typeof window !== 'undefined' ? (sessionStorage.getItem('studentName') || '').trim() : '') ||
    getStoredAudienceSession()?.name ||
    'Audience';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <AudienceActivityHeader
        title={showActiveChat && chatSession?.title ? chatSession.title : 'Anonymous Chat'}
        titleIcon={<MessageSquare className="w-4 h-4 shrink-0 text-[#6D415F]" />}
        participantName={participantDisplayName}
      />

      <GuestProgressLoginBanner
        contentClassName={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} py-2 flex items-center justify-between gap-3`}
      />

      <AudienceActivityContent>
        {showJoinForm ? (
          <AudienceActivityCard>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-text">
                {isChatEnded ? 'Chat Ended' : 'Join Anonymous Chat'}
              </h2>
              <p className="mt-2 text-text-light">
                {isChatEnded
                  ? 'This live chat has ended. Ask your host for a new session code if you still have questions.'
                  : 'Enter the session code to join the chat'}
              </p>
            </div>

            {joinError && (
              <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                {joinError}
              </div>
            )}

            {!isChatEnded && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-text-light">Session Code</label>
                <input
                  type="text"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-character code"
                  className="mt-2 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-text font-mono text-center text-lg"
                  maxLength={6}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleJoinChat();
                    }
                  }}
                />
                <button
                  onClick={handleJoinChat}
                  disabled={!sessionCode.trim() || isJoining}
                  className="mt-4 w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isJoining ? 'Joining...' : 'Join Chat'}
                </button>
              </div>
            )}
          </AudienceActivityCard>
        ) : (
          <AudienceActivityCard className="flex flex-col min-h-[28rem] h-[min(600px,calc(100vh-11rem))]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-text-light">{participantCount} participants</span>
              </div>
              {canSendMessages ? (
                <div className={`inline-flex items-center space-x-2 ${GUEST_LOGIN_BANNER_BG_CLASS} text-primary text-sm rounded-full px-2.5`}>
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <span>Chat is active - You can send messages</span>
                </div>
              ) : (
                <div className={`inline-flex items-center space-x-2 ${GUEST_LOGIN_BANNER_BG_CLASS} text-primary text-sm rounded-full px-2.5`}>
                  <AlertCircle className="w-4 h-4" />
                  <span>Waiting for host to enable chat...</span>
                </div>
              )}
            </div>

            <div className="chat-messages-scroll mt-4 flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-3">
              {visibleMessages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  {canSendMessages ? (
                    <p className="text-text-light">Be the first to send a message!</p>
                  ) : null}
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
              <div className="mt-4 flex space-x-2">
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
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    !message.trim() || isSending
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      : 'bg-[#6D415F] text-white hover:bg-[#5c3650]'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            ) : null}
          </AudienceActivityCard>
        )}
      </AudienceActivityContent>
    </div>
  );
};

export default AudienceAnonymousChat;
