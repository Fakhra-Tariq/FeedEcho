import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
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
import { spaceRacesAPI } from '../services/api';
import { getStoredStudentSession, getStudentQueryParams } from '../utils/studentSession';

const formatSessionDate = (iso) => {
  if (!iso) return { date: '—', time: '—', timestamp: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—', timestamp: null };
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    timestamp: d,
  };
};

const mapResource = (resource, index) => ({
  id: resource.id || resource.resourceId || `res-${index}`,
  type: resource.type || 'file',
  fileName: resource.fileName || resource.name || resource.linkTitle || 'Resource',
  url: resource.url || resource.downloadUrl || '#',
  senderName: resource.senderName || resource.sharedBy || '',
  sharedAt: resource.sharedAt || resource.createdAt || '',
  linkTitle: resource.linkTitle,
});

const RESOURCE_FILTERS = ['All', 'Documents', 'Images', 'Files', 'Links'];

const getFileExtension = (fileName = '') => {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

const isDocumentResource = (resource) => {
  if (resource.type === 'link' || resource.type === 'image') return false;
  const ext = getFileExtension(resource.fileName);
  return ext === 'pdf' || ext === 'doc' || ext === 'docx';
};

const isFileResource = (resource) => {
  if (resource.type === 'link' || resource.type === 'image') return false;
  return !isDocumentResource(resource);
};

const getResourceCategory = (resource) => {
  if (resource.type === 'link') return 'Links';
  if (resource.type === 'image') return 'Images';
  if (isDocumentResource(resource)) return 'Documents';
  if (isFileResource(resource)) return 'Files';
  return 'Files';
};

const filterResources = (resources, activeFilter) => {
  if (activeFilter === 'All') return resources;
  return resources.filter((r) => getResourceCategory(r) === activeFilter);
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
          className="w-10 h-10 rounded-lg object-cover border border-neutral-200"
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
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors';

const ResourceActions = ({ resource, onPreview, onDeleteRequest }) => {
  const isImage = resource.type === 'image';
  const isLink = resource.type === 'link';
  const hasDownloadUrl = resource.url && resource.url !== '#';

  return (
    <div className="flex items-center gap-2">
      {isLink && resource.url && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className={actionButtonClass}
        >
          <ExternalLink className="w-4 h-4" />
          Open
        </a>
      )}

      {isImage && (
        <>
          <button type="button" onClick={() => onPreview(resource)} className={actionButtonClass}>
            <Eye className="w-4 h-4" />
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
              <Download className="w-4 h-4" />
              Download
            </a>
          )}
        </>
      )}

      {!isLink && !isImage && (
        hasDownloadUrl ? (
          <a
            href={resource.url}
            download={resource.fileName || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonClass}
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        ) : (
          <button type="button" className={actionButtonClass} disabled>
            <Download className="w-4 h-4" />
            Download
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onDeleteRequest(resource)}
        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        aria-label="Delete resource"
      >
        <Trash2 className="w-4 h-4" />
      </button>
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
  const [expandedRaceId, setExpandedRaceId] = useState(null);
  const [resourceFilters, setResourceFilters] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);
  const [resourceToDelete, setResourceToDelete] = useState(null);

  useEffect(() => {
    const student = getStoredStudentSession();
    if (!student) {
      navigate('/student/auth');
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      try {
        const query = getStudentQueryParams(student);
        const historyResponse = await spaceRacesAPI.getStudentHistory(query);
        const historyRows = historyResponse.data?.data || [];

        const sessionsWithResources = await Promise.all(
          historyRows.map(async (row) => {
            const { date, time, timestamp } = formatSessionDate(row.sessionDate || row.joinedAt);
            let resources = [];

            if (row.raceId && row.teamId != null) {
              try {
                const resourcesResponse = await spaceRacesAPI.getSharedResources(row.raceId, row.teamId, query);
                resources = (resourcesResponse.data?.data || []).map(mapResource);
              } catch {
                resources = [];
              }
            }

            return {
              raceId: row.raceId,
              quizName: row.quizName || 'Space Race',
              date,
              time,
              timestamp,
              teamId: row.teamId,
              resources,
            };
          })
        );

        setSessions(sessionsWithResources);
      } catch (error) {
        console.error('Failed to load space race history:', error);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [navigate]);

  const handleToggle = (raceId) => {
    setExpandedRaceId((prev) => (prev === raceId ? null : raceId));
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

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white shadow-sm" style={{ borderBottom: '1px solid #E8E0F0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/student/home')}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity text-primary"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
              Space Race History
            </h1>
            <div className="w-32" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            className="p-6 shadow-sm"
            style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
          >
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-primary">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#6B7280' }}>Total Sessions</p>
                <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
                  {sessions.length}
                </p>
              </div>
            </div>
          </div>

          <div
            className="p-6 shadow-sm"
            style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
          >
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-secondary">
                <FolderOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#6B7280' }}>Shared Resources</p>
                <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
                  {sessions.reduce((sum, s) => sum + s.resources.length, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="shadow-sm"
          style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E8E0F0', borderRadius: '12px' }}
        >
          <div className="p-6" style={{ borderBottom: '0.5px solid #E8E0F0' }}>
            <h2 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>
              Past Resources
            </h2>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
              Tap a session to view resources shared by your team
            </p>
          </div>

          <div style={{ borderTop: '0.5px solid #F3EEF8' }}>
            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading space race history...</div>
            ) : sessions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No space race sessions yet.</div>
            ) : (
            sessions.map((session) => {
              const isExpanded = expandedRaceId === session.raceId;
              const activeFilter = resourceFilters[session.raceId] || 'All';
              const filteredResources = filterResources(session.resources, activeFilter);

              return (
                <div key={session.raceId} style={{ borderBottom: '0.5px solid #F3EEF8' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(session.raceId)}
                    className="w-full p-6 flex items-center justify-between text-left hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold truncate" style={{ color: '#1a1a1a' }}>
                          {session.quizName}
                        </h3>
                        <span
                          className="px-3 py-1 text-xs font-medium flex-shrink-0"
                          style={{ backgroundColor: '#F3EEF8', color: '#6B2D5C', borderRadius: '20px' }}
                        >
                          Team {session.teamId}
                        </span>
                      </div>

                      <div className="flex items-center space-x-6 text-sm" style={{ color: '#6B7280' }}>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>{session.date}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{session.time}</span>
                        </div>
                        <span>{session.resources.length} resources</span>
                      </div>
                    </div>

                    <div className="ml-4 flex-shrink-0 text-primary">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-6 pt-0">
                      <div
                        className="rounded-xl p-4"
                        style={{ backgroundColor: '#FAF8FC', border: '0.5px solid #E8E0F0' }}
                      >
                        <div className="flex flex-wrap gap-2 mb-4">
                          {RESOURCE_FILTERS.map((filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setFilterForSession(session.raceId, filter)}
                              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
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
                          <ul className="space-y-3">
                            {filteredResources.map((resource) => (
                              <li
                                key={resource.id}
                                className="flex items-center justify-between gap-4 p-3 bg-white rounded-lg"
                                style={{ border: '0.5px solid #E8E0F0' }}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div
                                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg"
                                    style={{ backgroundColor: '#F3EEF8' }}
                                  >
                                    <ResourceIcon resource={resource} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate" style={{ color: '#1a1a1a' }}>
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
                                <div className="flex-shrink-0">
                                  <ResourceActions
                                    resource={resource}
                                    onPreview={handlePreviewImage}
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
