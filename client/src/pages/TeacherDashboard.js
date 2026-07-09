import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Activity,
  CheckCircle2,
  PlayCircle,
  Timer,
  Users,
  MessageCircle,
  Rocket,
  ClipboardList,
  Trophy,
  Plus,
  MessageSquare,
  Zap,
  FileText,
  X,
  Copy,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useTeacherData } from '../contexts/TeacherDataContext';
import { getSessionActivityLabel, normalizeSessionCurrentActivity } from '../utils/sessionActivityLabel';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { copyToClipboard } from '../utils/copyToClipboard';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { data, endActiveSession, incrementParticipantCount, createSession, endStandaloneSession } = useTeacherData();
  const { alert } = useHybridAlert();

  const recentActivity = data.activityLog.slice(0, 6);
  const activeSession = data.activeSession;

  const resolvedCurrentActivity = normalizeSessionCurrentActivity(activeSession?.currentActivity);

  // Derive activity label from session type if currentActivity is not set
  const activeActivityLabel = getSessionActivityLabel(resolvedCurrentActivity) || 
    (activeSession?.type === 'quiz' ? 'Quiz Active' :
     activeSession?.type === 'exitTicket' ? 'Exit Ticket Active' :
     activeSession?.type === 'spaceRace' ? 'Space Race Active' :
     activeSession?.type === 'anonymousChat' ? 'Live Chat Active' :
     null);

  // Session creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [showCreatedPopup, setShowCreatedPopup] = useState(false);
  const [createdSessionData, setCreatedSessionData] = useState(null);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      if (alert?.toast?.error) {
        alert.toast.error('Please enter a session name');
      }
      return;
    }

    try {
      const sessionData = await createSession(sessionName);
      setCreatedSessionData(sessionData);
      setShowCreateModal(false);
      setShowCreatedPopup(true);
      setSessionName('');
      if (alert?.toast?.success) {
        alert.toast.success('Session created successfully!');
      }
    } catch (error) {
      if (alert?.toast?.error) {
        alert.toast.error(error?.message || 'Failed to create session');
      }
    }
  };

  const handleCopyCode = async (code, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const copied = await copyToClipboard(code);
    if (copied) {
      alert.toast.success('Code copied to clipboard!');
    } else {
      alert.toast.error('Could not copy code. Please copy it manually.');
    }
  };

  const handleEndSession = async () => {
    if (activeSession?.type === 'session' && activeSession?.sessionId) {
      try {
        await endStandaloneSession(activeSession.sessionId);
        setShowEndConfirmModal(false);
        if (alert?.toast?.success) {
          alert.toast.success('Session ended successfully');
        }
      } catch (error) {
        if (alert?.toast?.error) {
          alert.toast.error(error?.message || 'Failed to end session');
        }
      }
    } else {
      try {
        await endActiveSession();
        setShowEndConfirmModal(false);
      } catch (error) {
        if (alert?.toast?.error) {
          alert.toast.error(error?.message || 'Failed to end session');
        }
      }
    }
  };

  const isSessionActive = !!activeSession;

  const actionButtons = [
    {
      title: "Create Quiz",
      icon: Plus,
      description: "Design and launch a new quiz",
      color: "bg-[#F2EBF0]",
      iconColor: "text-white",
      iconBg: "bg-[#6D415F]",
      hoverColor: "hover:bg-[#F2EBF0]/90",
      titleColor: "text-[#2E1F2A]",
      descriptionColor: "text-[#5A4A55]",
      onClick: () => navigate('/teacher/launch')
    },
    {
      title: "Live Chat",
      icon: MessageSquare,
      description: "Start an interactive session",
      color: "bg-[#F2EBF0]",
      iconColor: "text-white",
      iconBg: "bg-[#6D415F]",
      hoverColor: "hover:bg-[#F2EBF0]/90",
      titleColor: "text-[#2E1F2A]",
      descriptionColor: "text-[#5A4A55]",
      onClick: () => navigate('/teacher/anonymous-chat')
    },
    {
      title: "Space Race",
      icon: Zap,
      description: "Engage with gamification",
      color: "bg-[#F2EBF0]",
      iconColor: "text-white",
      iconBg: "bg-[#6D415F]",
      hoverColor: "hover:bg-[#F2EBF0]/90",
      titleColor: "text-[#2E1F2A]",
      descriptionColor: "text-[#5A4A55]",
      onClick: () => navigate('/teacher/space-race')
    },
    {
      title: "Exit Ticket",
      icon: FileText,
      description: "Gather quick feedback",
      color: "bg-[#F2EBF0]",
      iconColor: "text-white",
      iconBg: "bg-[#6D415F]",
      hoverColor: "hover:bg-[#F2EBF0]/90",
      titleColor: "text-[#2E1F2A]",
      descriptionColor: "text-[#5A4A55]",
      onClick: () => navigate('/teacher/exit-tickets')
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-[#6D415F] via-[#6D415F]/90 to-[#3A2E2A] rounded-3xl p-8 shadow-xl border border-[#6D415F]/30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">Welcome back </h1>
            <p className="text-lg text-white/90 max-w-3xl">
              Monitor your classroom's progress and engage with students through interactive activities.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={isSessionActive}
              className={clsx(
                'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300',
                'bg-white text-[#6D415F] hover:bg-white/90',
                'shadow-lg hover:shadow-xl',
                isSessionActive && 'opacity-50 cursor-not-allowed'
              )}
              title={isSessionActive ? 'A session is already active' : 'Create a new session'}
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Create Session</span>
            </button>
            <div className="hidden md:block">
              <div className="w-16 h-16 bg-gradient-to-br from-[#6D415F] to-[#8B5A7C] rounded-full flex items-center justify-center shadow-lg">
                <Rocket className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Session Bar - shown when any session is active */}
      {activeSession && (
        <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 shadow-lg border border-[#6D415F]/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-[#6D415F]/10 rounded-full flex items-center justify-center">
                  <Activity className="w-5 h-5 text-[#6D415F]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#6D415F] uppercase tracking-widest">Active Session</p>
                  <h3 className="text-lg font-bold text-[#2E1F2A] dark:text-white">
                    {activeSession.sessionName || 'Session'}
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ml-13">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#5A4A55] dark:text-white/70">Code:</span>
                  <span className="text-xl font-bold text-[#6D415F]">{activeSession.joinCode}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyCode(activeSession.joinCode, e)}
                    className="p-1 hover:bg-[#6D415F]/10 rounded transition-colors"
                    title="Copy code"
                    aria-label="Copy session code"
                  >
                    <Copy className="w-4 h-4 text-[#6D415F]" />
                  </button>
                </div>
                {activeActivityLabel ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6D415F]/10 text-[#6D415F] text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[#6D415F] animate-pulse" aria-hidden />
                    {activeActivityLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-semibold">
                    No activity running
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6D415F]" />
                  <span className="text-sm text-[#5A4A55] dark:text-white/70">{activeSession.participants || 0} participants</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEndConfirmModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">End Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {actionButtons.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 transform hover:scale-105 hover:shadow-xl ${action.color} ${action.hoverColor} border border-[#6D415F]/20`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-[#6D415F]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className={`w-14 h-14 rounded-2xl ${action.iconBg} flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                <action.icon className={`w-7 h-7 ${action.iconColor}`} />
              </div>
              <h3 className={`text-lg font-bold ${action.titleColor} mb-2`}>{action.title}</h3>
              <p className={`text-sm text-center ${action.descriptionColor} font-medium`}>{action.description}</p>
            </div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#6D415F]/10 to-transparent rounded-full -mr-10 -mt-10" />
          </button>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Recent Activity Section */}
        <div>
          <div className="bg-white dark:bg-[#3A2E2A] rounded-3xl p-7 shadow-lg border border-[#6D415F]/30 dark:border-[#6D415F]/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#3A2E2A] dark:text-white mb-2">Recent Activity</h2>
                <p className="text-sm text-[#3A2E2A]/60 dark:text-white/60">Latest actions and updates in your classroom</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-[#6D415F] to-[#8B5A7C] rounded-full flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gradient-to-br from-[#6D415F]/10 to-[#8B5A7C]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-10 h-10 text-[#5A2E82]/50" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#3A2E2A] dark:text-white mb-2">No recent activity</h3>
                  <p className="text-[#3A2E2A]/60 dark:text-white/60">Get started by creating your first activity</p>
                </div>
              ) : (
                recentActivity.map((item) => (
                  <ActivityRow key={item.id} activity={item} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white">Create Session</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-white/70" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#2E1F2A] dark:text-white mb-2">
                  Session Name
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Enter session name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/10 text-[#2E1F2A] dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6D415F] focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSessionName('');
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSession}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
                >
                  Create Session
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Session Created Popup */}
      {showCreatedPopup && createdSessionData && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">Session Created!</h2>
            <p className="text-[#5A4A55] dark:text-white/70 mb-6">
              Session: <span className="font-semibold text-[#2E1F2A] dark:text-white">{createdSessionData.sessionName}</span>
            </p>
            <div className="bg-[#F2EBF0] rounded-xl p-6 mb-6">
              <p className="text-sm text-[#5A4A55] dark:text-white/70 mb-2">Session Code</p>
              <p className="text-4xl font-bold text-[#6D415F] tracking-wider">{createdSessionData.sessionCode}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={(e) => handleCopyCode(createdSessionData.sessionCode, e)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#6D415F] text-white font-semibold hover:bg-[#6D415F]/90 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy Code
              </button>
              <button
                onClick={() => setShowCreatedPopup(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* End Session Confirmation Modal */}
      {showEndConfirmModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-[#3A2E2A] rounded-2xl p-6 w-full max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-[#2E1F2A] dark:text-white mb-2">End Session?</h2>
            <p className="text-[#5A4A55] dark:text-white/70 mb-6">
              Are you sure you want to end this session? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirmModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 text-[#2E1F2A] dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSession}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const ActiveSessionCard = ({ session, quizzes, exitTickets, spaceRaces = [], incrementParticipantCount, onEndSession }) => {
  if (!session) {
    return (
      <div className="border border-dashed border-gray-300 rounded-2xl p-6 text-center">
        <h2 className="text-lg font-semibold text-text">No active session</h2>
        <p className="mt-2 text-sm text-text-light">
          Launch a quiz, exit ticket, space race, or anonymous lecture to start capturing live participation data.
        </p>
      </div>
    );
  }

  const isQuiz = session.type === 'quiz';
  const isExitTicket = session.type === 'exitTicket';
  const isSpaceRace = session.type === 'spaceRace';

  const resource = isQuiz
    ? quizzes.find((quiz) => quiz.id === session.quizId)
    : isExitTicket
      ? exitTickets.find((ticket) => ticket.id === session.quizId)
      : isSpaceRace
        ? spaceRaces.find((race) => race.id === session.quizId)
        : null;

  return (
    <div className="border border-primary/20 rounded-2xl p-6 bg-primary/10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest">Active session</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">
            {resource?.title || 'Live Session'}
          </h2>
          <p className="mt-2 text-sm text-text-light">
            {isQuiz && 'Students are completing your live quiz with real-time submissions.'}
            {isExitTicket && 'Collecting exit ticket reflections to inform your next lesson.'}
            {isSpaceRace && 'Space race is underway—keep the momentum going!'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-light">
            <SessionBadge icon={Timer} label="Started" value={formatRelativeTime(session.startedAt)} />
            <SessionBadge icon={Users} label="Participants" value={session.participants} />
            <SessionBadge icon={CheckCircle2} label="Join code" value={session.joinCode} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={incrementParticipantCount}
            className="px-4 py-2 rounded-xl bg-white border border-primary/30 text-primary font-semibold hover:bg-primary hover:text-white"
          >
            +1 Student joined
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
};

const SessionBadge = ({ icon: Icon, label, value }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium">
    <Icon className="w-3.5 h-3.5 text-primary" />
    <span className="uppercase tracking-wide text-text-light">{label}</span>
    <span className="text-text font-semibold">{value}</span>
  </span>
);

const ActivityRow = ({ activity }) => {
  const meta = activityMeta[activity.type] || activityMeta.default;
  return (
    <div className="flex items-start justify-between border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <meta.icon className={clsx('w-5 h-5 mt-0.5', meta.iconClass)} />
        <div>
          <p className="text-sm font-semibold text-text">{activity.title}</p>
          <p className="text-xs text-text-light">{meta.description(activity.status)}</p>
        </div>
      </div>
      <span className="text-xs text-gray-400">{formatRelativeTime(activity.timestamp)}</span>
    </div>
  );
};

const activityMeta = {
  quiz: {
    icon: PlayCircle,
    iconClass: 'text-primary',
    description: (status) => `Quiz marked ${status}`,
  },
  exitTicket: {
    icon: ClipboardList,
    iconClass: 'text-secondary',
    description: (status) => `Exit ticket ${status}`,
  },
  spaceRace: {
    icon: Trophy,
    iconClass: 'text-yellow-500',
    description: (status) => `Space race ${status}`,
  },
  anonymousChat: {
    icon: MessageCircle,
    iconClass: 'text-primary',
    description: (status) => `Anonymous chat ${status}`,
  },
  default: {
    icon: Activity,
    iconClass: 'text-gray-400',
    description: () => 'Workspace activity recorded',
  },
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'just now';
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
};

export default TeacherDashboard;
