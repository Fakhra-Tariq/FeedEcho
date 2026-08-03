import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Rocket, Pencil, Clipboard, LogOut, Briefcase, Users, GraduationCap, X, ArrowRight, Bot, ChevronDown, ChevronLeft, ChevronRight, User, Home, TrendingUp, Trash2, PenSquare
} from 'lucide-react';
import { appToast } from '../contexts/HybridAlertContext';
import { useAuth } from '../contexts/AuthContext';
import { getStoredStudentSession } from '../utils/studentSession';
import StudentAvatar from '../components/StudentAvatar';
import { useStudentLiveActivity } from '../hooks/useStudentLiveActivity';
import { useClickOutside } from '../hooks/useClickOutside';
import { joinSessionByCode } from '../utils/joinSessionFlow';
import { schedulePendingQuizSubmissionSync } from '../utils/quizSubmissionSync';
import { studyAssistantAPI, studyAssistantConversationsAPI } from '../services/api';

const MIN_PANEL_WIDTH = 320;
const DEFAULT_PANEL_WIDTH = 380;
const EXPANDED_PANEL_WIDTH = 520;
const CURRENT_CHAT_ID = 'chat-current';
const STUDY_ASSISTANT_ERROR_MESSAGE = 'Something went wrong, please try again.';

const logStudyAssistantChatError = (error, context = 'chat') => {
  console.error(`[study-assistant] ${context} failed`, {
    message: error?.message,
    code: error?.code,
    status: error?.response?.status,
    statusText: error?.response?.statusText,
    data: error?.response?.data,
    isAxiosError: Boolean(error?.isAxiosError),
    stack: error?.stack,
  });
};

const getStudyAssistantErrorMessage = (error) => {
  const serverMessage = error?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage.trim();
  }

  const status = error?.response?.status;
  if (status === 429) {
    return 'AI is busy right now. Please wait a moment and try again.';
  }
  if (status === 503 || status === 502 || status === 504) {
    return 'AI service is temporarily unavailable. Please try again shortly.';
  }
  if (error?.code === 'ECONNABORTED') {
    return 'AI is taking too long to respond. Please try again.';
  }
  if (error?.code === 'NETWORK_ERROR' || (!error?.response && error?.request)) {
    return 'Network error. Check your connection and try again.';
  }

  return STUDY_ASSISTANT_ERROR_MESSAGE;
};

const notifyStudyAssistantError = (error) => {
  appToast.error(getStudyAssistantErrorMessage(error));
};

const getStudyAssistantStudentId = (student) =>
  String(student?.uid || student?.email || '').trim();

const getMaxPanelWidth = () => Math.floor(window.innerWidth * 0.6);

const clampPanelWidth = (width) =>
  Math.min(getMaxPanelWidth(), Math.max(MIN_PANEL_WIDTH, width));

const formatMessageTime = () =>
  new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const createWelcomeMessage = () => ({
  id: `welcome-${Date.now()}`,
  text: "Hi Student! I'm your AI Study Assistant. I can help you with practice questions, explain topics you missed, or help you prepare for quizzes. What would you like to work on today?",
  sender: 'ai',
  timestamp: formatMessageTime(),
});

const formatHistoryDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (diffDays < 14) return 'Last week';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const truncateTitle = (text, max = 30) => {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

const formatMessageTimeFromIso = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatMessageTime();
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const mapApiMessageToUi = (message, index = 0) => ({
  id: `msg-${index}-${message.timestamp || Date.now()}`,
  text: message.text,
  sender: message.role === 'assistant' ? 'ai' : 'user',
  timestamp: formatMessageTimeFromIso(message.timestamp),
});

const buildNewChat = () => ({
  id: CURRENT_CHAT_ID,
  title: 'New conversation',
  updatedAt: new Date().toISOString(),
  messages: [createWelcomeMessage()],
});

const buildInitialChats = () => [buildNewChat()];

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div
      className="px-4 py-3 rounded-lg bg-white border border-gray-200"
      aria-label="Assistant is typing"
      role="status"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  </div>
);

const StudentHome = () => {
  const navigate = useNavigate();
  const { studentLogout } = useAuth();
  const [student, setStudent] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [classCode, setClassCode] = useState(['', '', '', '', '', '']);
  
  // New state variables for navbar features
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef(null);
  const closeProfileDropdown = useCallback(() => {
    setShowProfileDropdown(false);
  }, []);
  useClickOutside(profileDropdownRef, closeProfileDropdown, showProfileDropdown);
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const chatPanelWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const messagesEndRef = useRef(null);

  const [chats, setChats] = useState(buildInitialChats);
  const [activeChatId, setActiveChatId] = useState(CURRENT_CHAT_ID);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [historyConversations, setHistoryConversations] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const { items: recentActivity, loading: loadingActivity } = useStudentLiveActivity(student, 5);
  const [isJoining, setIsJoining] = useState(false);
  const joinInProgressRef = useRef(false);
  const prevCodeLengthRef = useRef(0);

  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const activeMessages = activeChat?.messages ?? [];

  const upsertConversationChat = useCallback((conversationId, { title, messages, updatedAt }) => {
    setChats((prev) => {
      const draftChat = prev.find((chat) => chat.id === CURRENT_CHAT_ID) || buildNewChat();
      const otherChats = prev.filter(
        (chat) => chat.id !== CURRENT_CHAT_ID && chat.id !== conversationId
      );
      const conversationChat = {
        id: conversationId,
        title: title || 'Conversation',
        updatedAt: updatedAt || new Date().toISOString(),
        messages,
      };

      return [draftChat, conversationChat, ...otherChats];
    });
  }, []);

  const loadHistoryConversations = useCallback(async () => {
    const studentId = getStudyAssistantStudentId(student);
    if (!studentId) {
      console.error('[study-assistant] History load skipped: missing student id', { student });
      return;
    }

    setIsLoadingHistory(true);
    try {
      const response = await studyAssistantConversationsAPI.list(studentId);
      const items = Array.isArray(response.data?.data) ? response.data.data : [];
      setHistoryConversations(
        items.map((item) => ({
          conversationId: item.conversationId,
          title: item.title || 'Conversation',
          lastMessageAt: item.lastMessageAt || null,
        }))
      );
    } catch (error) {
      console.error('[study-assistant] Failed to load history:', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        studentId,
      });
      notifyStudyAssistantError();
    } finally {
      setIsLoadingHistory(false);
    }
  }, [student]);

  const handleStartNewChat = () => {
    if (isSendingChat) return;

    setActiveTab('chat');
    setActiveConversationId(null);
    setActiveChatId(CURRENT_CHAT_ID);
    setChatInput('');

    setChats((prev) => {
      const preserved = prev.filter((chat) => chat.id !== CURRENT_CHAT_ID);
      return [buildNewChat(), ...preserved];
    });
  };

  const handleSendMessage = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !activeChatId || isSendingChat) return;

    if (!student?.uid) {
      appToast.error('Please sign in again to use the study assistant.');
      return;
    }

    const sendingChatId = activeChatId;
    const isNewConversation = !activeConversationId;
    const newUserMessage = {
      id: `user-${Date.now()}`,
      text: trimmed,
      sender: 'user',
      timestamp: formatMessageTime(),
    };

    setChatInput('');

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== sendingChatId) return chat;
        return {
          ...chat,
          updatedAt: new Date().toISOString(),
          messages: [...chat.messages, newUserMessage],
        };
      })
    );

    setIsSendingChat(true);

    try {
      const payload = {
        studentId: student.uid,
        message: trimmed,
      };
      if (activeConversationId) {
        payload.conversationId = activeConversationId;
      }

      const response = await studyAssistantAPI.chat(payload);
      const { conversationId, reply, title } = response.data?.data || {};

      if (!reply) {
        throw new Error('No assistant reply received');
      }

      const aiResponse = {
        id: `ai-${Date.now()}`,
        text: reply,
        sender: 'ai',
        timestamp: formatMessageTime(),
      };

      const resolvedConversationId = conversationId || activeConversationId;

      setChats((prev) =>
        prev.map((chat) => {
          const isActiveChat =
            chat.id === sendingChatId ||
            (resolvedConversationId && chat.id === resolvedConversationId);
          if (!isActiveChat) return chat;

          return {
            ...chat,
            id: resolvedConversationId || chat.id,
            title:
              isNewConversation && title
                ? title
                : chat.title === 'New conversation'
                ? truncateTitle(trimmed)
                : chat.title,
            updatedAt: new Date().toISOString(),
            messages: [...chat.messages, aiResponse],
          };
        })
      );

      if (resolvedConversationId) {
        setActiveConversationId(resolvedConversationId);
        setActiveChatId(resolvedConversationId);
      }

      if (activeTab === 'history') {
        void loadHistoryConversations();
      }
    } catch (error) {
      logStudyAssistantChatError(error, 'send-message');
      notifyStudyAssistantError(error);

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== sendingChatId) return chat;
          const messages = [...chat.messages];
          if (messages.length && messages[messages.length - 1]?.id === newUserMessage.id) {
            messages.pop();
          }
          return { ...chat, messages };
        })
      );
      setChatInput(trimmed);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleSelectHistoryChat = async (conversationId) => {
    if (!student?.uid) return;

    setActiveTab('chat');
    setActiveConversationId(conversationId);
    setActiveChatId(conversationId);
    setLoadingConversationId(conversationId);

    try {
      const response = await studyAssistantConversationsAPI.getById(conversationId, student.uid);
      const data = response.data?.data;
      const messages = (data?.messages || []).map((message, index) =>
        mapApiMessageToUi(message, index)
      );
      const lastMessageAt =
        data?.messages?.[data.messages.length - 1]?.timestamp || new Date().toISOString();

      upsertConversationChat(conversationId, {
        title: data?.title,
        messages,
        updatedAt: lastMessageAt,
      });
    } catch (error) {
      console.error('Failed to load study assistant conversation:', error);
      notifyStudyAssistantError();
    } finally {
      setLoadingConversationId(null);
    }
  };

  const handleDeleteChatCancel = () => {
    setChatToDelete(null);
  };

  const handleDeleteChatConfirm = async () => {
    if (!chatToDelete || isDeletingConversation) return;

    const deletedId = chatToDelete.conversationId || chatToDelete.id;
    const wasActive =
      deletedId === activeChatId || deletedId === activeConversationId;

    setChatToDelete(null);

    if (!student?.uid || deletedId === CURRENT_CHAT_ID) {
      return;
    }

    setIsDeletingConversation(true);

    try {
      await studyAssistantConversationsAPI.delete(deletedId, student.uid);

      setHistoryConversations((prev) =>
        prev.filter((item) => item.conversationId !== deletedId)
      );

      setChats((prev) => {
        const remaining = prev.filter((chat) => chat.id !== deletedId);
        if (wasActive) {
          if (remaining.some((chat) => chat.id === CURRENT_CHAT_ID)) {
            return remaining;
          }
          return [buildNewChat(), ...remaining];
        }
        return remaining.length ? remaining : [buildNewChat()];
      });

      if (wasActive) {
        setActiveChatId(CURRENT_CHAT_ID);
        setActiveConversationId(null);
        setActiveTab('chat');
      }
    } catch (error) {
      console.error('Failed to delete study assistant conversation:', error);
      notifyStudyAssistantError();
      await loadHistoryConversations();
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  useEffect(() => {
    const loggedInStudent = getStoredStudentSession();
    if (!loggedInStudent) {
      navigate('/student/auth');
      return;
    }

    setStudent(loggedInStudent);
    schedulePendingQuizSubmissionSync();

    // Set dynamic greeting based on time of day
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting('Good morning');
    } else if (hour >= 12 && hour < 17) {
      setGreeting('Good afternoon');
    } else if (hour >= 17 && hour < 21) {
      setGreeting('Good evening');
    } else {
      setGreeting('Good night');
    }

    // Set current date
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(today.toLocaleDateString('en-US', options));
  }, [navigate]);

  useEffect(() => {
    const handleWindowResize = () => {
      setChatPanelWidth((prev) => clampPanelWidth(prev));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (!isDraggingPanel) return undefined;

    const handleMouseMove = (e) => {
      const delta = dragStartXRef.current - e.clientX;
      const nextWidth = clampPanelWidth(dragStartWidthRef.current + delta);
      chatPanelWidthRef.current = nextWidth;
      setChatPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsPanelExpanded(
        chatPanelWidthRef.current >= (MIN_PANEL_WIDTH + EXPANDED_PANEL_WIDTH) / 2
      );
      setIsDraggingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingPanel]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChatId, activeMessages.length, activeTab, isSendingChat]);

  useEffect(() => {
    if (showChatbot && activeTab === 'history') {
      loadHistoryConversations();
    }
  }, [showChatbot, activeTab, loadHistoryConversations]);

  const handlePanelResizeStart = (e) => {
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = chatPanelWidth;
    setIsDraggingPanel(true);
  };

  const handleTogglePanelWidth = () => {
    if (isPanelExpanded) {
      setChatPanelWidth(MIN_PANEL_WIDTH);
      setIsPanelExpanded(false);
      return;
    }

    setChatPanelWidth(clampPanelWidth(EXPANDED_PANEL_WIDTH));
    setIsPanelExpanded(true);
  };

  const handleCodeInput = (index, value) => {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const newCode = [...classCode];
    newCode[index] = char;
    setClassCode(newCode);

    if (char && index < 5) {
      setTimeout(() => {
        document.getElementById(`code-input-${index + 1}`)?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newCode = [...classCode];

      if (newCode[index]) {
        newCode[index] = '';
        setClassCode(newCode);
        return;
      }

      if (index > 0) {
        newCode[index - 1] = '';
        setClassCode(newCode);
        document.getElementById(`code-input-${index - 1}`)?.focus();
      }
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      document.getElementById(`code-input-${index - 1}`)?.focus();
      return;
    }

    if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      document.getElementById(`code-input-${index + 1}`)?.focus();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleJoinSession();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);

    if (!pastedText) return;

    const newCode = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedText.length && i < 6; i += 1) {
      newCode[i] = pastedText[i];
    }

    setClassCode(newCode);

    const focusIndex = Math.min(pastedText.length, 5);
    setTimeout(() => {
      document.getElementById(`code-input-${focusIndex}`)?.focus();
    }, 0);
  };

  const executeJoin = async (code) => {
    if (joinInProgressRef.current || !student) return;
    if (code.length !== 6) {
      appToast.error('Please enter a valid 6-digit code');
      return;
    }

    joinInProgressRef.current = true;
    setIsJoining(true);
    try {
      const result = await joinSessionByCode({
        code,
        studentName: student.name,
        loggedInStudent: student,
        navigate,
        onError: (message) => appToast.error(message),
        onTeamSelectionRequired: (payload) => {
          navigate('/student/join', {
            state: {
              sessionCode: payload.sessionCode,
              studentName: payload.studentName,
              raceData: payload.raceData,
              teamSelectionOnly: true,
            },
          });
        },
      });

      if (result.needsTeamSelection) return;
    } finally {
      joinInProgressRef.current = false;
      setIsJoining(false);
    }
  };

  useEffect(() => {
    const code = classCode.join('');
    const len = code.length;
    if (len === 6 && prevCodeLengthRef.current < 6 && student && !joinInProgressRef.current) {
      executeJoin(code);
    }
    prevCodeLengthRef.current = len;
  }, [classCode, student]);

  const handleJoinSession = () => {
    executeJoin(classCode.join(''));
  };

  const handleLogout = async () => {
    await studentLogout();
    navigate('/student/auth');
  };

  return (
    <div className="flex flex-row h-screen min-h-screen overflow-hidden bg-background">
      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img 
                src="/FeedEcho-logo.png.png" 
                alt="FeedEcho" 
                className="h-32 w-auto object-contain mix-blend-mode: multiply"
              />
            </div>

            {/* Center Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <a href="/student/home" className="flex items-center space-x-2 text-primary font-medium">
                <Home className="w-4 h-4" />
                <span className="font-medium">Home</span>
              </a>
              <Link to="/student/progress" className="flex items-center space-x-2 text-gray-700 hover:text-primary transition-colors">
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">Progress</span>
              </Link>
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center space-x-3">
              {/* Chatbot Icon */}
              <button 
                onClick={() => setShowChatbot(!showChatbot)}
                className="p-2 rounded-lg text-gray-600 hover:text-primary transition-colors"
              >
                <Bot className="w-5 h-5" />
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <StudentAvatar name={student?.name || 'Student'} />
                  <span className="font-medium text-text">{student?.name?.split(' ')[0] || 'Student'}</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {/* Profile Dropdown */}
                {showProfileDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-3 border-b border-gray-200">
                      <p className="font-medium text-text">{student?.name || 'Student'}</p>
                      <p className="text-sm text-gray-600">{student?.email || ''}</p>
                    </div>
                    <div className="py-2">
                      <Link to="/student/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>Profile</span>
                        </div>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-2">
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="container mx-auto p-6">
        {/* Hero Banner */}
        <div className="relative bg-gradient-to-r from-primary to-primary/90 text-white rounded-xl shadow-lg p-10 mb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-l from-black/20 to-transparent"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-3">{greeting}, {student?.name?.split(' ')[0] || 'Student'}!</h1>
              <p className="text-lg">Welcome back to your student dashboard. Track your progress and join live sessions.</p>
            </div>
            <div className="relative">
              <div className="w-28 h-28 bg-black/10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-black/20">
                <Rocket className="w-14 h-14 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Two Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* My Quizzes Card */}
          <div 
            onClick={() => navigate('/student/quiz-history')}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer border border-gray-200 hover:border-primary"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                <Pencil className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text mb-2">My Quizzes</h3>
                <p className="text-sm text-gray-600">View your quiz history</p>
              </div>
            </div>
          </div>

          {/* Space Race Card */}
          <div 
            onClick={() => navigate('/space-race')}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer border border-gray-200 hover:border-primary"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text mb-2">Space Race</h3>
                <p className="text-sm text-gray-600">View past races & shared resources</p>
              </div>
            </div>
          </div>
        </div>

        {/* Join a Session Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6 border-2 border-primary">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-primary mb-2">Join a Session</h3>
            <p className="text-sm text-gray-600">Enter 6-digit code your teacher shared with you</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex space-x-2 flex-1">
              {classCode.map((digit, index) => (
                <input
                  key={index}
                  id={`code-input-${index}`}
                  type="text"
                  maxLength="1"
                  value={digit}
                  onChange={(e) => handleCodeInput(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-12 h-14 bg-gray-100 text-center rounded-lg border-2 border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-xl font-bold text-primary transition-all duration-200"
                />
              ))}
            </div>
            <button
              onClick={handleJoinSession}
              disabled={isJoining}
              className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-full font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-60 disabled:transform-none disabled:cursor-not-allowed"
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text">Recent Activity</h3>
          </div>
          
          <div className="space-y-4">
            {loadingActivity ? (
              <p className="text-sm text-gray-500 py-4">Loading activity...</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No recent activity yet. Join a session to get started!</p>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      {item.type === 'spaceRace' ? (
                        <Rocket className="w-5 h-5 text-gray-600" />
                      ) : (
                        <Clipboard className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-text">{item.title}</p>
                      <p className="text-sm text-gray-600">{item.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">{item.shortDate || item.date}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* AI Study Assistant Panel */}
      {showChatbot && (
        <div
          className="relative flex-shrink-0 h-screen flex overflow-hidden bg-white shadow-2xl border-l border-gray-200"
          style={{ width: chatPanelWidth }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI Study Assistant panel"
            onMouseDown={handlePanelResizeStart}
            className={`relative z-10 flex-shrink-0 w-2 h-full cursor-col-resize group transition-colors ${
              isDraggingPanel ? 'bg-primary/20' : 'bg-gray-100 hover:bg-primary/10'
            }`}
          >
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleTogglePanelWidth}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center rounded-md border border-gray-200 bg-white text-primary shadow-sm hover:bg-primary/5 transition-colors"
              aria-label={isPanelExpanded ? 'Collapse AI panel' : 'Expand AI panel'}
            >
              {isPanelExpanded ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="relative flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* Header */}
          <div className="bg-primary p-4 text-white flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">AI Study Assistant</h3>
                  <p className="text-white/80 text-sm">Ask me anything about your studies</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleStartNewChat}
                  disabled={isSendingChat}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="New chat"
                  title="New chat"
                >
                  <PenSquare className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowChatbot(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Close AI Study Assistant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
            {['chat', 'history'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'text-primary border-primary'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'chat' ? (
            <>
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
            <div className="space-y-4">
              {loadingConversationId === activeConversationId &&
              activeMessages.length === 0 &&
              !isSendingChat ? (
                <p className="text-sm text-gray-500 text-center py-8">Loading conversation...</p>
              ) : (
                activeMessages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2 rounded-lg ${
                    message.sender === 'user' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-white/70' : 'text-gray-500'
                    }`}>{message.timestamp}</p>
                  </div>
                </div>
              ))
              )}
              {isSendingChat && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          </div>
          
          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Type your question here..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSendingChat}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button 
                onClick={handleSendMessage}
                disabled={isSendingChat || !chatInput.trim()}
                className="w-12 h-12 bg-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 p-3">
              {isLoadingHistory ? (
                <p className="text-sm text-gray-500 text-center py-8">Loading chat history...</p>
              ) : historyConversations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No chat history yet</p>
              ) : (
                <ul className="space-y-2">
                  {historyConversations.map((conversation) => (
                    <li
                      key={conversation.conversationId}
                      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                        conversation.conversationId === activeConversationId
                          ? 'bg-primary/10 border-primary/20'
                          : 'bg-white border-gray-200 hover:border-primary/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectHistoryChat(conversation.conversationId)}
                        disabled={loadingConversationId === conversation.conversationId}
                        className="flex-1 min-w-0 text-left disabled:opacity-60"
                      >
                        <p className={`text-sm font-medium truncate ${
                          conversation.conversationId === activeConversationId ? 'text-primary' : 'text-text'
                        }`}>
                          {truncateTitle(conversation.title)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {loadingConversationId === conversation.conversationId
                            ? 'Loading...'
                            : formatHistoryDate(conversation.lastMessageAt)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatToDelete(conversation);
                        }}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {chatToDelete && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
              <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
                <h3 className="text-lg font-bold text-text mb-2">Delete chat?</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Are you sure you want to delete &ldquo;{truncateTitle(chatToDelete.title)}&rdquo;?
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteChatCancel}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-primary hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteChatConfirm}
                    disabled={isDeletingConversation}
                    className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isDeletingConversation ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentHome;
