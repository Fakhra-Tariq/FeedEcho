import axios from 'axios';
import { getActivePortal } from '../utils/userRoles';
import { getStoredStudentSession } from '../utils/studentSession';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create axios instance for anonymous chat (NO AUTH)
const anonymousApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and user ID
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add user ID header for development auth
    let userId = sessionStorage.getItem('feedecho-user-id');
    
    // Try to get from auth context first
    try {
      const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
      if (authUser.uid) {
        userId = authUser.uid;
        sessionStorage.setItem('feedecho-user-id', userId);
      }
    } catch (e) {
      console.log('Could not get user from localStorage');
    }
    
    // Only use fallback if no user ID found
    if (!userId) {
      // Try sessionStorage fallback
      userId = sessionStorage.getItem('feedecho-user-id');
    }
    
    if (!userId) {
      console.log('⚠️ No user ID found, requests may fail');
    } else {
      config.headers['X-User-ID'] = userId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and retries
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle network errors
    if (!error.response && error.request) {
      console.error('Network error - no response received:', error);
      error.code = 'NETWORK_ERROR';
      return Promise.reject(error);
    }
    
    // Handle 401 unauthorized — respect active portal / student context
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      localStorage.removeItem('token');
      localStorage.removeItem('authUser');
      const portal = getActivePortal();
      const onStudentRoute = window.location.pathname.startsWith('/student');
      const hasStudentSession = Boolean(getStoredStudentSession());
      const isStudentContext =
        onStudentRoute || portal === 'student' || hasStudentSession;
      window.location.href = isStudentContext ? '/student/auth' : '/teacher/signin';
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData) => api.post('/auth/register', userData),
  login: (idToken) => api.post('/auth/login', { idToken }),
  ensureProfile: (payload) => api.post('/auth/ensure-profile', payload),
  getProfile: (token) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return api.get('/auth/profile', config);
  },
  updateProfile: (userData, token) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return api.put('/auth/profile', userData, config);
  },
};

// Users API
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  update: (id, userData) => api.put(`/users/${id}`, userData),
  delete: (id) => api.delete(`/users/${id}`),
  getStats: (id) => api.get(`/users/${id}/stats`),
};

// Courses API
export const coursesAPI = {
  getAll: (params) => api.get('/courses', { params }),
  getById: (id) => api.get(`/courses/${id}`),
  create: (courseData) => api.post('/courses', courseData),
  update: (id, courseData) => api.put(`/courses/${id}`, courseData),
  delete: (id) => api.delete(`/courses/${id}`),
  enroll: (id) => api.post(`/courses/${id}/enroll`),
  getEnrollments: (id) => api.get(`/courses/${id}/enrollments`),
};

// Assignments API
export const assignmentsAPI = {
  getAll: (params) => api.get('/assignments', { params }),
  getById: (id) => api.get(`/assignments/${id}`),
  create: (assignmentData) => api.post('/assignments', assignmentData),
  update: (id, assignmentData) => api.put(`/assignments/${id}`, assignmentData),
  delete: (id) => api.delete(`/assignments/${id}`),
  submit: (id, submissionData) => api.post(`/assignments/${id}/submit`, submissionData),
  grade: (id, gradeData) => api.post(`/assignments/${id}/grade`, gradeData),
};

// Submissions API
export const submissionsAPI = {
  getAll: (params) => api.get('/submissions', { params }),
  getById: (id) => api.get(`/submissions/${id}`),
  update: (id, submissionData) => api.put(`/submissions/${id}`, submissionData),
};

// Quizzes API (teacher auth for mutate; getByCode is public for students)
export const quizzesAPI = {
  getAll: (params) => api.get('/quizzes', { params }),
  getById: (id) => api.get(`/quizzes/${id}`),
  getByCode: (accessCode) => api.get(`/quizzes/code/${accessCode}`),
  create: (data) => api.post('/quizzes', data),
  update: (id, data) => api.put(`/quizzes/${id}`, data),
  delete: (id) => api.delete(`/quizzes/${id}`),
  deletePermanent: (id) => api.delete(`/quizzes/${id}?permanent=true`),
  launch: (id, settings) => api.post(`/quizzes/${id}/launch`, settings),
  finish: (id) => api.post(`/quizzes/${id}/finish`),
  generateAi: (data) => api.post('/quiz/generate-ai', data),
};

// Exit tickets API (teacher auth required)
export const exitTicketsAPI = {
  getAll: (params) => api.get('/exit-tickets', { params }),
  getById: (id) => api.get(`/exit-tickets/${id}`),
  getResponses: (id) => api.get(`/exit-tickets/${id}/responses`),
  create: (data) => api.post('/exit-tickets', data),
  update: (id, data) => api.put(`/exit-tickets/${id}`, data),
  delete: (id) => api.delete(`/exit-tickets/${id}`),
  start: (id) => api.post(`/exit-tickets/${id}/start`),
  pause: (id) => api.post(`/exit-tickets/${id}/pause`),
  end: (id) => api.post(`/exit-tickets/${id}/end`),
  clearResponses: (id) => api.delete(`/exit-tickets/${id}/responses`),
  // Public routes for students (no auth)
  getByCode: (joinCode) => anonymousApi.get(`/exit-tickets/code/${joinCode}`),
  submitResponse: (id, responseData) => anonymousApi.post(`/exit-tickets/${id}/respond`, responseData),
};

// Space races API (teacher auth required)
export const spaceRacesAPI = {
  getAll: (params) => api.get('/space-races', { params }),
  getById: (id) => api.get(`/space-races/${id}`),
  getParticipants: (raceId, params) => api.get(`/space-races/${raceId}/participants`, { params }),
  getDebugInfo: (raceId) => api.get(`/space-races/${raceId}/debug`),
  submitAnswer: (raceId, answerData) => anonymousApi.post(`/space-races/${raceId}/submit-answer`, answerData),
  setTeamSelection: (raceId, data) => anonymousApi.post(`/space-races/${raceId}/team-selection`, data),
  startQuiz: (raceId, data) => anonymousApi.post(`/space-races/${raceId}/start-quiz`, data),
  // Final score endpoint is student-facing and does not require auth
  getFinalScore: (raceId, scoreData) => anonymousApi.get(`/space-races/${raceId}/final-score`, { params: scoreData }),
  updateScore: (raceId, scoreData) => api.put(`/space-races/${raceId}/update-score`, scoreData),
  create: (data) => api.post('/space-races', data),
  update: (id, data) => api.put(`/space-races/${id}`, data),
  updateStatus: (id, status) => api.put(`/space-races/status/${id}`, { status }),
  delete: (id) => api.delete(`/space-races/${id}`),
  start: (id) => api.post(`/space-races/${id}/start`),
  startRace: (data) => api.post('/space-races/start', data),
  getRaceByCode: (joinCode) => anonymousApi.get(`/space-races/code/${joinCode}`),
  joinByCode: (joinCode, name) => api.get(`/space-races/join/${joinCode}?name=${encodeURIComponent(name)}`),
  joinRace: (joinCode, name) => api.post(`/space-races/join/${joinCode}`, { name }),
  pause: (id) => api.post(`/space-races/${id}/pause`),
  resume: (id) => api.post(`/space-races/${id}/resume`),
  end: (id) => api.post(`/space-races/${id}/end`),
  hide: (id) => api.post(`/space-races/${id}/hide`),
  unhide: (id) => api.post(`/space-races/${id}/unhide`),
  toggleVisibility: (id, isVisible) => api.patch(`/space-races/${id}/visibility`, { isVisible }),
  sendTeamChatMessage: (raceId, messageData) =>
    anonymousApi.post(`/space-races/${raceId}/team-chat`, messageData),
  getTeamChatMessages: (raceId, teamId) =>
    anonymousApi.get(`/space-races/${raceId}/team-chat`, { params: { teamId } }),
  getTeamSelection: (raceId, teamId, questionId) =>
    anonymousApi.get(`/space-races/${raceId}/team-selection`, {
      params: { teamId, questionId },
    }),
  getStandings: (raceId) => anonymousApi.get(`/space-races/${raceId}/standings`),
  getStudentHistory: (params) => anonymousApi.get('/space-races/student/history', { params }),
  getSharedResources: (raceId, teamId, params) =>
    anonymousApi.get(`/space-races/${raceId}/shared-resources`, {
      params: { teamId, ...params },
    }),
};

// Sessions API (unified join for both quizzes and space races - NO AUTH)
export const sessionsAPI = {
  getByCode: (code) => anonymousApi.get(`/sessions/code/${code}`),
  join: (name, code, teamId = null, { studentUid, studentEmail } = {}) =>
    anonymousApi.post('/sessions/join', {
      name,
      code,
      ...(teamId !== null && teamId !== undefined ? { teamId } : {}),
      ...(studentUid ? { studentUid } : {}),
      ...(studentEmail ? { studentEmail } : {}),
    }),
  // Standalone session management (teacher auth required)
  create: (sessionData) => api.post('/sessions/create', sessionData),
  end: (sessionId) => api.post(`/sessions/${sessionId}/end`),
  getActive: (teacherId) =>
    api.get('/sessions/active', { params: teacherId ? { teacherId } : {} }),
  listByTeacher: (teacherId) => api.get(`/sessions/teacher/${teacherId}`),
  delete: (sessionId, teacherId) =>
    api.delete(`/sessions/${sessionId}`, { params: { teacherId } }),
};

// Quiz Submissions API (NO AUTH for students submitting)
export const quizSubmissionsAPI = {
  submit: (quizId, submissionData) => anonymousApi.post(`/quiz-submissions/${quizId}/submit`, submissionData),
  getResults: (quizId) => api.get(`/quiz-submissions/${quizId}/results`),
};

// Anonymous Chat API (create/list/update/end/delete use auth when available; student endpoints no auth)
export const anonymousChatAPI = {
  create: (chatData) => api.post('/anonymous-chats/create', chatData),
  getAll: (params) => api.get('/anonymous-chats', { params }),
  getByCode: (joinCode, params) => anonymousApi.get(`/anonymous-chats/code/${joinCode}`, { params }),
  getById: (id) => api.get(`/anonymous-chats/${id}`),
  update: (id, updates) => api.put(`/anonymous-chats/${id}`, updates),
  addMessage: (id, messageData) => anonymousApi.post(`/anonymous-chats/${id}/messages`, messageData),
  presence: (id, payload) => anonymousApi.post(`/anonymous-chats/${id}/presence`, payload),
  leave: (id, payload) => anonymousApi.post(`/anonymous-chats/${id}/leave`, payload),
  syncStats: (id) => api.post(`/anonymous-chats/${id}/sync-stats`),
  toggleModeration: (id, moderationMode) => api.put(`/anonymous-chats/${id}/toggle-moderation`, { moderationMode }),
  endChat: (id) => api.put(`/anonymous-chats/${id}/end`),
  delete: (id) => api.delete(`/anonymous-chats/${id}`),
};

// Students API (public — uses name/email to match activity)
export const studentsAPI = {
  getActivity: (params) => anonymousApi.get('/students/activity', { params }),
  getQuizHistory: (params) => anonymousApi.get('/students/quiz-history', { params }),
};

// Study Assistant conversations
export const studyAssistantConversationsAPI = {
  list: (studentId) =>
    api.get('/study-assistant/conversations', { params: { studentId } }),
  getById: (conversationId, studentId) =>
    api.get(`/study-assistant/conversations/${conversationId}`, {
      params: studentId ? { studentId } : undefined,
    }),
  delete: (conversationId, studentId) =>
    api.delete(`/study-assistant/conversations/${conversationId}`, {
      params: studentId ? { studentId } : undefined,
    }),
};

// Study Assistant chat (Gemini can take longer than default axios timeout)
export const studyAssistantAPI = {
  chat: (payload) =>
    api.post('/study-assistant/chat', payload, { timeout: 90000 }),
};

export const handleAPIError = (error) => {
  if (error.code === 'NETWORK_ERROR' || (!error.response && error.request)) {
    // Network error (no response received)
    return {
      message: 'Network error. Please check your internet connection.',
      status: null,
      data: null,
      isNetworkError: true
    };
  } else if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const status = error.response.status;
    let message = 'Server error';
    
    switch (status) {
      case 400:
        message = error.response.data?.error || 'Bad request';
        break;
      case 401:
        message = 'Authentication failed';
        break;
      case 403:
        message = 'Access denied';
        break;
      case 404:
        message = 'Resource not found';
        break;
      case 500:
        message = 'Server error. Please try again later.';
        break;
      default:
        message = error.response.data?.error || `Error ${status}`;
    }
    
    return {
      message,
      status,
      data: error.response.data
    };
  } else {
    // Something happened in setting up the request that triggered an Error
    return {
      message: error.message || 'An unexpected error occurred',
      status: null,
      data: null
    };
  }
};

// Health check function
export const checkServerHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    throw handleAPIError(error);
  }
};

export default api;

// Export anonymousApi for use in components
export { anonymousApi };
