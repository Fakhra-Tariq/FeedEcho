import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  ExternalLink,
  Download,
  FolderOpen,
  Trash2,
  Eye,
  X,
} from 'lucide-react';
import { spaceRacesAPI, anonymousChatAPI } from '../services/api';
import { downloadLiveChatResource } from '../utils/downloadLiveChatResource';
import { useAuth } from '../contexts/AuthContext';
import AudienceDashboardNavbar from '../components/Audience/AudienceDashboardNavbar';
import { AUDIENCE_ACTIVITY_PAGE_WIDTH } from '../components/Audience/AudienceActivityLayout';
import { getStoredAudienceSession, getStudentQueryParams } from '../utils/audienceSession';
import { formatSessionDate, parseUtcTimestamp } from '../utils/formatLocalDateTime';

const SOURCE_TABS = ['All', 'Space Race', 'Live Chat'];

const mapResource = (resource, index, extras = {}) => ({
  id: resource.id || resource.resourceId || `res-${index}`,
  type: resource.type || 'file',
  fileName: resource.fileName || resource.name || resource.linkTitle || 'Resource',
  url: resource.url || resource.downloadUrl || '',
  senderName: resource.senderName || resource.sharedBy || '',
  sharedAt: resource.sharedAt || resource.createdAt || '',
  linkTitle: resource.linkTitle,
  linkDomain: resource.linkDomain,
  size: resource.size,
  source: extras.source || resource.source || 'spaceRace',
  chatId: extras.chatId || resource.chatId || null,
  gated: extras.gated === true,
});

const fetchTeamResources = async (raceId, teamId, query) => {
  if (!raceId || teamId == null) return [];
  try {
    const resourcesResponse = await spaceRacesAPI.getSharedResources(raceId, teamId, query);
    if (!resourcesResponse.data?.success) return [];
    return (resourcesResponse.data?.data || []).map(mapResource);
  } catch {
    return [];
  }
};

const RESOURCE_FILTERS = ['All', 'Documents', 'Images', 'Links'];

const getFileExtension = (fileName = '') => {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

const getResourceCategory = (resource) => {
  if (resource.type === 'link') return 'Links';
  if (resource.type === 'image') return 'Images';
  // PDFs, Word docs, and any other uploaded file types share the Documents category.
  return 'Documents';
};

const filterResources = (resources, activeFilter) => {
  if (activeFilter === 'All') return resources;
  return resources.filter((r) => getResourceCategory(r) === activeFilter);
};

const timeMs = (value) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  const parsed = parseUtcTimestamp(value);
  return parsed ? parsed.getTime() : 0;
};

const sortResourcesNewest = (resources) =>
  [...(resources || [])].sort((a, b) => timeMs(b.sharedAt) - timeMs(a.sharedAt));

const sessionSortMs = (session) => {
  const newestShare = (session.resources || []).reduce(
    (max, resource) => Math.max(max, timeMs(resource.sharedAt)),
    0
  );
  return newestShare || timeMs(session.timestamp);
};

const getResourceLabel = (resource) => {
  if (resource.type === 'link') {
    return resource.linkTitle || resource.url || 'Shared link';
  }
  if (resource.fileName) return resource.fileName;
  if (resource.type === 'image') return 'Shared image';
  return resource.text || 'Shared file';
};

const ResourceIcon = ({ resource }) => {
  if (resource.type === 'image') {
    if (resource.url && resource.url !== '#') {
      return (
        <img
          src={resource.url}
          alt={resource.fileName || 'Shared image'}
          className="block w-full h-full object-cover"
        />
      );
    }
    return <ImageIcon className="w-5 h-5 text-primary" />;
  }

  if (resource.type === 'link') {
    return <LinkIcon className="w-5 h-5 text-primary" />;
  }

  const ext = getFileExtension(resource.fileName);
  if (ext === 'pdf') {
    return <FileText className="w-5 h-5 text-red-600" />;
  }
  if (ext === 'doc' || ext === 'docx') {
    return <FileText className="w-5 h-5 text-blue-600" />;
  }

  return <FileText className="w-5 h-5 text-primary" />;
};

const actionButtonClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors max-[640px]:h-10 max-[640px]:flex-1 max-[640px]:justify-center max-[640px]:px-3 max-[640px]:whitespace-nowrap max-[640px]:min-w-0 max-[640px]:overflow-hidden';

const ResourceActions = ({ resource, onPreview, onDeleteRequest, onGatedDownload, hideDelete }) => {
  const isImage = resource.type === 'image';
  const isLink = resource.type === 'link';
  const hasDownloadUrl = Boolean(resource.url && resource.url !== '#');
  const gated = Boolean(resource.gated);

  return (
    <div className="flex items-center gap-2 max-[640px]:w-full">
      {isLink && resource.url && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className={actionButtonClass}
        >
          <ExternalLink className="w-4 h-4 shrink-0" />
          Open
        </a>
      )}

      {isImage && !gated && (
        <>
          <button type="button" onClick={() => onPreview(resource)} className={actionButtonClass}>
            <Eye className="w-4 h-4 shrink-0" />
            Preview
          </button>
          {hasDownloadUrl && (
            <a
              href={resource.url}
              download={resource.fileName || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={actionButtonClass}
            >
              <Download className="w-4 h-4 shrink-0" />
              Download
            </a>
          )}
        </>
      )}

      {!isLink && (gated || (!isImage && hasDownloadUrl)) && (
        gated ? (
          <button
            type="button"
            onClick={() => onGatedDownload?.(resource)}
            className={actionButtonClass}
          >
            <Download className="w-4 h-4 shrink-0" />
            Download
          </button>
        ) : !isImage ? (
          <a
            href={resource.url}
            download={resource.fileName || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonClass}
          >
            <Download className="w-4 h-4 shrink-0" />
            Download
          </a>
        ) : null
      )}

      {!isLink && !isImage && !gated && !hasDownloadUrl && (
        <button type="button" className={actionButtonClass} disabled>
          <Download className="w-4 h-4 shrink-0" />
          Download
        </button>
      )}

      {!hideDelete && (
        <button
          type="button"
          onClick={() => onDeleteRequest(resource)}
          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 max-[640px]:w-10 max-[640px]:h-10 max-[640px]:inline-flex max-[640px]:items-center max-[640px]:justify-center"
          aria-label="Delete resource"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const ImagePreviewModal = ({ previewImage, onClose }) => {
  if (!previewImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative max-w-3xl w-full rounded-xl overflow-hidden shadow-xl"
        style={{ backgroundColor: '#FFFFFF' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E8E0F0' }}>
          <p className="font-medium truncate" style={{ color: '#1a1a1a' }}>
            {previewImage.fileName || 'Image preview'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex items-center justify-center bg-gray-50 max-h-[70vh] overflow-auto">
          <img
            src={previewImage.url}
            alt={previewImage.fileName || 'Shared image'}
            className="max-w-full max-h-[60vh] object-contain rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};

export default function SpaceRaceHistory() {
  const navigate = useNavigate();
  const { audienceLogout } = useAuth();
  const [student, setStudent] = useState(null);
  const [expandedRaceId, setExpandedRaceId] = useState(null);
  const [resourceFilters, setResourceFilters] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);
  const [resourceToDelete, setResourceToDelete] = useState(null);
  const [sourceTab, setSourceTab] = useState('All');

  useEffect(() => {
    const loggedInStudent = getStoredAudienceSession();
    if (!loggedInStudent) {
      navigate('/join');
      return;
    }
    setStudent(loggedInStudent);

    const loadHistory = async () => {
      setLoading(true);
      try {
        const query = getStudentQueryParams(loggedInStudent);
        const [historyResponse, liveResponse] = await Promise.all([
          spaceRacesAPI.getStudentHistory(query).catch(() => ({ data: { data: [] } })),
          anonymousChatAPI.listMyResources().catch(() => ({ data: { data: [] } })),
        ]);
        const historyRows = historyResponse.data?.data || [];
        const liveGroups = liveResponse.data?.data || [];

        const raceSessions = await Promise.all(
          historyRows.map(async (row) => {
            const joined = formatSessionDate(row.joinedAt || row.sessionDate);
            const resources = sortResourcesNewest(
              await fetchTeamResources(row.raceId, row.teamId, query)
            );
            const sortMs =
              resources.reduce((max, resource) => Math.max(max, timeMs(resource.sharedAt)), 0) ||
              timeMs(joined.timestamp);
            const shown = formatSessionDate(sortMs || joined.timestamp);

            return {
              raceId: row.raceId,
              quizName: row.quizName || 'Space Race',
              date: shown.date,
              time: shown.time,
              timestamp: shown.timestamp || joined.timestamp,
              sortMs,
              teamId: row.teamId,
              source: 'spaceRace',
              resources,
            };
          })
        );

        const liveSessions = liveGroups.map((row) => {
          const joined = formatSessionDate(row.joinedAt);
          const resources = sortResourcesNewest(
            (row.resources || []).map((resource, index) =>
              mapResource(resource, index, {
                source: 'liveChat',
                chatId: row.chatId,
                gated: resource.type !== 'link',
              })
            )
          );
          const sortMs =
            resources.reduce((max, resource) => Math.max(max, timeMs(resource.sharedAt)), 0) ||
            timeMs(joined.timestamp);
          const shown = formatSessionDate(sortMs || joined.timestamp);
          return {
            raceId: `liveChat:${row.chatId}`,
            chatId: row.chatId,
            quizName: row.chatName || 'Live Chat',
            date: shown.date,
            time: shown.time,
            timestamp: shown.timestamp || joined.timestamp,
            sortMs,
            teamId: null,
            source: 'liveChat',
            resources,
          };
        });

        const merged = [...raceSessions, ...liveSessions].sort(
          (a, b) => (b.sortMs || 0) - (a.sortMs || 0)
        );
        setSessions(merged);
      } catch (error) {
        console.error('Failed to load resources:', error);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [navigate]);

  const refreshSessionResources = async (raceId, teamId) => {
    if (!student || !raceId || teamId == null) return;
    const query = getStudentQueryParams(student);
    const resources = sortResourcesNewest(await fetchTeamResources(raceId, teamId, query));
    setSessions((prev) =>
      prev
        .map((session) => {
          if (session.raceId !== raceId) return session;
          const sortMs =
            resources.reduce((max, resource) => Math.max(max, timeMs(resource.sharedAt)), 0) ||
            timeMs(session.timestamp);
          const shown = formatSessionDate(sortMs || session.timestamp);
          return {
            ...session,
            resources,
            sortMs,
            date: shown.date,
            time: shown.time,
            timestamp: shown.timestamp || session.timestamp,
          };
        })
        .sort((a, b) => (b.sortMs || 0) - (a.sortMs || 0))
    );
  };

  const handleToggle = (raceId) => {
    const session = sessions.find((s) => s.raceId === raceId);
    setExpandedRaceId((prev) => {
      const next = prev === raceId ? null : raceId;
      if (next && session) {
        void refreshSessionResources(session.raceId, session.teamId);
      }
      return next;
    });
    setResourceFilters((prev) => ({
      ...prev,
      [raceId]: prev[raceId] || 'All',
    }));
  };

  const setFilterForSession = (raceId, filter) => {
    setResourceFilters((prev) => ({ ...prev, [raceId]: filter }));
  };

  const handlePreviewImage = (resource) => {
    if (!resource.url || resource.url === '#') return;
    setPreviewImage({
      url: resource.url,
      fileName: resource.fileName || 'Shared image',
    });
  };

  const handleDeleteRequest = (raceId, resource) => {
    setResourceToDelete({ raceId, resource });
  };

  const handleDeleteCancel = () => {
    setResourceToDelete(null);
  };

  const handleDeleteConfirm = () => {
    if (!resourceToDelete) return;

    const { raceId, resource } = resourceToDelete;

    // TODO: call DELETE API endpoint when backend is integrated
    setSessions((prev) =>
      prev.map((session) =>
        session.raceId === raceId
          ? {
              ...session,
              resources: session.resources.filter((r) => r.id !== resource.id),
            }
          : session
      )
    );
    setResourceToDelete(null);
  };

  const handleGatedDownload = async (resource) => {
    if (!resource?.chatId || !resource?.id) return;
    try {
      await downloadLiveChatResource(resource.chatId, resource.id, resource.fileName);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await audienceLogout();
    navigate('/');
  };

  const sessionsWithResources = sessions.filter((session) => session.resources.length > 0);
  const visibleSessions = sessionsWithResources
    .filter((session) => {
      if (sourceTab === 'Space Race') return session.source !== 'liveChat';
      if (sourceTab === 'Live Chat') return session.source === 'liveChat';
      return true;
    })
    .sort((a, b) => sessionSortMs(b) - sessionSortMs(a));

  return (
    <div className="min-h-screen bg-background">
      <AudienceDashboardNavbar
        displayName={student?.name}
        displayEmail={student?.email}
        onLogout={handleLogout}
      />
      <div className={`${AUDIENCE_ACTIVITY_PAGE_WIDTH} py-6 max-md:py-4`}>
        <div className="relative bg-gradient-to-r from-primary to-primary/90 text-white rounded-xl shadow-lg p-5 sm:p-8 mb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-l from-black/20 to-transparent" />
          <div className="relative flex items-center justify-between gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 break-words">Resources</h1>
              <p className="text-white/90 text-sm sm:text-base sm:text-lg">
                Files and links shared in your space races and live chats.
              </p>
            </div>
            <FolderOpen className="w-8 h-8 text-white/80 shrink-0" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-[480px]:grid-cols-2 max-[480px]:gap-2 max-[480px]:mb-3">
          <div
            className="p-6 shadow-sm max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center"
            style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
          >
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-primary shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <Rocket className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-tight max-[480px]:text-[12px]" style={{ color: '#6B7280' }}>Total Sessions</p>
                <p className="text-2xl font-bold leading-tight max-[480px]:text-[17px]" style={{ color: '#1a1a1a' }}>
                  {visibleSessions.length}
                </p>
              </div>
            </div>
          </div>

          <div
            className="p-6 shadow-sm max-[480px]:p-3 max-[480px]:min-h-[56px] max-[480px]:flex max-[480px]:items-center"
            style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
          >
            <div className="flex items-center space-x-3 max-[480px]:space-x-2 min-w-0 w-full">
              <div className="p-3 rounded-lg bg-secondary shrink-0 max-[480px]:p-0 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:inline-flex max-[480px]:items-center max-[480px]:justify-center">
                <FolderOpen className="w-6 h-6 text-white max-[480px]:w-4 max-[480px]:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-tight max-[480px]:text-[12px]" style={{ color: '#6B7280' }}>Shared Resources</p>
                <p className="text-2xl font-bold leading-tight max-[480px]:text-[17px]" style={{ color: '#1a1a1a' }}>
                  {visibleSessions.reduce((sum, s) => sum + s.resources.length, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="shadow-sm overflow-hidden"
          style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
        >
          <div className="p-6" style={{ borderBottom: '0.5px solid #E8E0F0' }}>
            <h2 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>
              Past Resources
            </h2>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
              Tap a session to view resources shared with you
            </p>
            <div className="flex gap-2 overflow-x-auto mt-4 pb-1 -mx-1 px-1">
              {SOURCE_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSourceTab(tab)}
                  className="px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap shrink-0"
                  style={
                    sourceTab === tab
                      ? { backgroundColor: '#6B2D5C', color: '#FFFFFF' }
                      : { backgroundColor: '#FFFFFF', color: '#6B7280', border: '1px solid #E8E0F0' }
                  }
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid #F3EEF8' }}>
            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading resources...</div>
            ) : visibleSessions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                {sourceTab === 'Live Chat'
                  ? 'No live chat resources yet.'
                  : sourceTab === 'Space Race'
                  ? 'No space race sessions yet.'
                  : 'No resources yet.'}
              </div>
            ) : (
            visibleSessions.map((session) => {
              const isExpanded = expandedRaceId === session.raceId;
              const activeFilter =
                resourceFilters[session.raceId] === 'Files'
                  ? 'All'
                  : resourceFilters[session.raceId] || 'All';
              const filteredResources = filterResources(session.resources, activeFilter);

              return (
                <div key={session.raceId} style={{ borderBottom: '0.5px solid #F3EEF8' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(session.raceId)}
                    className="w-full p-6 flex items-center justify-between text-left hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2 min-w-0">
                        <h3 className="text-lg font-bold truncate" style={{ color: '#1a1a1a' }}>
                          {session.quizName}
                        </h3>
                        <span
                          className="px-3 py-1 text-xs font-medium flex-shrink-0 whitespace-nowrap"
                          style={{ backgroundColor: '#F3EEF8', color: '#6B2D5C', borderRadius: '20px' }}
                        >
                          {session.source === 'liveChat' ? 'Live Chat' : 'Space Race'}
                        </span>
                      </div>

                      <div
                        className="flex items-center space-x-6 text-sm max-[640px]:flex-wrap max-[640px]:items-center max-[640px]:space-x-0 max-[640px]:gap-x-3 max-[640px]:gap-y-1"
                        style={{ color: '#6B7280' }}
                      >
                        <div className="flex items-center space-x-1 max-[640px]:shrink-0 max-[640px]:whitespace-nowrap">
                          <Calendar className="w-4 h-4 shrink-0" />
                          <span>{session.date}</span>
                        </div>
                        <div className="flex items-center space-x-1 max-[640px]:shrink-0 max-[640px]:whitespace-nowrap">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>{session.time}</span>
                        </div>
                        <span className="max-[640px]:shrink-0 max-[640px]:whitespace-nowrap">
                          {session.resources.length} resources
                        </span>
                      </div>
                    </div>

                    <div className="ml-4 flex-shrink-0 self-center text-primary max-[640px]:ml-2 max-[640px]:min-h-11 max-[640px]:min-w-11 max-[640px]:inline-flex max-[640px]:items-center max-[640px]:justify-center">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-6 pt-0 min-w-0 max-[640px]:px-3">
                      <div
                        className="rounded-xl p-4 min-w-0 overflow-hidden max-[640px]:p-3"
                        style={{ backgroundColor: '#FAF8FC', border: '0.5px solid #E8E0F0' }}
                      >
                        <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
                          {RESOURCE_FILTERS.map((filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setFilterForSession(session.raceId, filter)}
                              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0"
                              style={
                                activeFilter === filter
                                  ? { backgroundColor: '#6B2D5C', color: '#FFFFFF' }
                                  : { backgroundColor: '#FFFFFF', color: '#6B7280', border: '1px solid #E8E0F0' }
                              }
                            >
                              {filter}
                            </button>
                          ))}
                        </div>

                        {filteredResources.length === 0 ? (
                          <p className="text-sm text-gray-500 py-2">
                            No {activeFilter === 'All' ? '' : activeFilter.toLowerCase()} resources in this session.
                          </p>
                        ) : (
                          <ul className="space-y-3 min-w-0">
                            {filteredResources.map((resource) => (
                              <li
                                key={resource.id}
                                className="box-border flex w-full min-w-0 items-center justify-between gap-4 overflow-hidden p-3 bg-white rounded-lg max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:gap-3"
                                style={{ border: '0.5px solid #E8E0F0' }}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1 max-[640px]:w-full">
                                  <div
                                    className={`flex-shrink-0 w-10 h-10 overflow-hidden flex items-center justify-center rounded-lg max-[640px]:w-12 max-[640px]:h-12 ${resource.type === 'image' ? 'border border-neutral-200' : ''}`}
                                    style={{ backgroundColor: '#F3EEF8' }}
                                  >
                                    <ResourceIcon resource={resource} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className="font-medium min-[641px]:truncate max-[640px]:line-clamp-2"
                                      style={{ color: '#1a1a1a' }}
                                    >
                                      {getResourceLabel(resource)}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                                      {resource.senderName ? `Shared by ${resource.senderName}` : 'Shared resource'}
                                      <span
                                        className="ml-2 px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: '#F3EEF8', color: '#6B2D5C' }}
                                      >
                                        {getResourceCategory(resource)}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 max-[640px]:w-full">
                                  <ResourceActions
                                    resource={resource}
                                    onPreview={handlePreviewImage}
                                    onGatedDownload={handleGatedDownload}
                                    hideDelete={session.source === 'liveChat'}
                                    onDeleteRequest={(item) =>
                                      handleDeleteRequest(session.raceId, item)
                                    }
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
            )}
          </div>
        </div>
      </div>

      <ImagePreviewModal
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />

      {resourceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="p-6 shadow-xl max-w-sm w-full"
            style={{ backgroundColor: '#FFFFFF', borderRadius: '12px' }}
          >
            <h3 className="text-lg font-bold mb-2" style={{ color: '#1a1a1a' }}>
              Delete resource?
            </h3>
            <p className="mb-6" style={{ color: '#6B7280' }}>
              Are you sure you want to delete &ldquo;{getResourceLabel(resourceToDelete.resource)}&rdquo;?
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-primary"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E0F0' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 rounded-lg text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: '#DC2626' }}
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
