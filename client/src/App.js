import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
// Context
import { useAuth } from './contexts/AuthContext';
import ToastContainer from './components/ToastContainer';
import InlineAlertContainer from './components/InlineAlertContainer';
import CustomModalContainer from './components/CustomModalContainer';
import ErrorBoundary from './components/ErrorBoundary';
import ServerHealthCheck from './components/ServerHealthCheck';

// Components
import Navbar from './components/Layout/Navbar';
import Footer from './components/Layout/Footer';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Pages
import Home from './pages/Home';
import About from './pages/Courses';
import Contact from './pages/Contact';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import CreateMultipleChoiceQuiz from './pages/CreateMultipleChoiceQuiz';
import CreateTrueFalseQuiz from './pages/CreateTrueFalseQuiz';
import CreateShortAnswerQuiz from './pages/CreateShortAnswerQuiz';
import CreateLongAnswerQuiz from './pages/CreateLongAnswerQuiz';
import MixedTypeQuizEditor from './pages/MixedTypeQuizEditor';
import QuizLibrary from './pages/QuizLibrary';

import AudienceJoin from './pages/AudienceJoin';
import AudienceSession from './pages/AudienceSession';
import AudienceJoinSession from './pages/AudienceJoinSession';
import AudienceQuizAttempt from './pages/AudienceQuizAttempt';
import AudienceExitTicket from './pages/AudienceExitTicket';
import AudienceSpaceRaceJoin from './pages/AudienceSpaceRaceJoin';
import AudienceHome from './pages/AudienceHome';
import AudienceProgress from './pages/AudienceProgress';
import AudienceProfile from './pages/AudienceProfile';
import AudienceSignup from './pages/AudienceSignup';
import AudienceForgotPassword from './pages/AudienceForgotPassword';
import QuizHistory from './pages/QuizHistory';
import SpaceRaceGame from './pages/SpaceRaceGame';
import AudienceSpaceRacePage from './pages/AudienceSpaceRacePage';
import SpaceRaceHistory from './pages/SpaceRaceHistory';
import AudienceAnonymousChat from './pages/AudienceAnonymousChat';
import HostSignIn from './pages/HostSignIn';
import HostSignUp from './pages/HostSignUp';
import HostForgotPassword from './pages/HostForgotPassword';
import HostDashboard from './pages/HostDashboard';
// Teacher Pages
import HostLaunch from './pages/HostLaunch';
import HostQuizzes from './pages/HostQuizzes';
import HostExitTickets from './pages/HostExitTickets';
import ExitTicketDashboard from './pages/ExitTicketDashboard';
import CreateExitTicketPage from './pages/CreateExitTicketPage';
import AudienceExitTicketJoin from './pages/AudienceExitTicketJoin';
import ExitTicketResponses from './pages/ExitTicketResponses';
import HostExitTicketResponses from './pages/HostExitTicketResponses';
import HostSpaceRace from './pages/HostSpaceRace';
import HostSpaceRaceDisplay from './pages/HostSpaceRaceDisplay';
import HostReports from './pages/HostReports';
import HostAnonymousChat from './pages/HostAnonymousChat';
import HostProfile from './pages/HostProfile';
import HostLayout from './components/Host/HostLayout';
import SessionsPage from './pages/SessionsPage';

/** Redirect old /teacher/* and /student/* URLs to /host/* and /audience/* */
function LegacyPathRedirect({ fromPrefix, toPrefix }) {
  const location = useLocation();
  const to = `${location.pathname.replace(new RegExp(`^${fromPrefix}`), toPrefix)}${location.search}${location.hash}`;
  return <Navigate to={to} replace />;
}

function AppContent() {
  const location = useLocation();
  // Auth pages that should show the same public Navbar/Footer as /join
  const publicAuthPaths = [
    '/audience/signup',
    '/audience/forgot',
    '/host/signin',
    '/host/signup',
    '/host/forgot',
  ];
  const isPublicAuthPage = publicAuthPaths.includes(location.pathname);

  const isTeacherRoute =
    (location.pathname.startsWith('/host') || location.pathname.startsWith('/sessions')) &&
    !isPublicAuthPage;
  const isCreateQuizRoute = location.pathname.startsWith('/create');
  const isStudentRoute =
    location.pathname.startsWith('/audience') && !isPublicAuthPage;
  const hidePublicChrome = isStudentRoute || location.pathname === '/space-race';
  const isLibraryRoute = location.pathname === '/quiz-library'; // Library shows Navbar/Footer (not used to hide them)
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {!isTeacherRoute && !isCreateQuizRoute && !hidePublicChrome && <Navbar />}
      <main className="flex-grow">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/join" element={<AudienceJoin />} />
            <Route path="/join/space-race" element={<AudienceSpaceRaceJoin />} />
            <Route path="/space-race" element={<SpaceRaceHistory />} />
            <Route path="/space-race/:raceId/quiz/:quizId" element={<AudienceSpaceRacePage />} />
            <Route path="/space-race/:raceId" element={<AudienceSpaceRacePage />} />
            <Route path="/space-race/play/:raceId" element={<SpaceRaceGame />} />
            <Route path="/session/:code" element={<AudienceSession />} />
            <Route path="/audience/join" element={<AudienceJoinSession />} />
            <Route path="/audience/quiz/:quizId" element={<AudienceQuizAttempt />} />
            <Route path="/audience/exit-ticket" element={<AudienceExitTicketJoin />} />
            <Route path="/audience/exit-ticket/:joinCode" element={<AudienceExitTicket />} />
            <Route path="/audience/chat" element={<AudienceAnonymousChat />} />
            <Route path="/audience/space-race/:raceId/quiz/:quizId" element={<AudienceSpaceRacePage />} />
            <Route path="/audience/space-race/:raceId" element={<AudienceSpaceRacePage />} />
            <Route path="/audience/home" element={<AudienceHome />} />
            <Route path="/audience/progress" element={<AudienceProgress />} />
            <Route path="/audience/profile" element={<AudienceProfile />} />
            <Route path="/audience/auth" element={<Navigate to="/join" replace />} />
            <Route path="/audience/signup" element={<AudienceSignup />} />
            <Route path="/audience/forgot" element={<AudienceForgotPassword />} />
            <Route path="/audience/quiz-history" element={<QuizHistory />} />
            <Route path="/create/multiple-choice" element={<CreateMultipleChoiceQuiz />} />
            <Route path="/create/true-false" element={<CreateTrueFalseQuiz />} />
            <Route path="/create/short-answer" element={<CreateShortAnswerQuiz />} />
            <Route path="/create/long-answer" element={<CreateLongAnswerQuiz />} />
            <Route path="/create/mixed-type" element={<MixedTypeQuizEditor />} />
            <Route path="/quiz-library" element={<Navigate to="/host/library" replace />} />
            <Route path="/host-login" element={<Navigate to="/host/signin" replace />} />
            <Route path="/host/signin" element={
              <ServerHealthCheck>
                <HostSignIn />
              </ServerHealthCheck>
            } />
            <Route path="/host/signup" element={
              <ServerHealthCheck>
                <HostSignUp />
              </ServerHealthCheck>
            } />
            <Route path="/host/forgot" element={<HostForgotPassword />} />
            <Route path="/login" element={<Navigate to="/host/signin" replace />} />
            <Route path="/register" element={<Navigate to="/host/signup" replace />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />

            {/* Protected Routes */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Teacher Sessions (standalone route) */}
            <Route
              path="/sessions"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <HostLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<SessionsPage />} />
            </Route>

            {/* Teacher Routes */}
            <Route
              path="/host"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <HostLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="explore" replace />} />
              <Route path="explore" element={<HostDashboard />} />
              <Route path="dashboard" element={<HostDashboard />} />
              <Route path="launch" element={<HostLaunch />} />
              <Route path="quizzes" element={<HostQuizzes />} />
              <Route path="exit-tickets" element={<ExitTicketDashboard />} />
              <Route path="exit-tickets/create" element={<CreateExitTicketPage />} />
              <Route path="exit-tickets/:ticketId/responses" element={<HostExitTicketResponses />} />
              <Route path="library" element={<QuizLibrary />} />
              <Route path="space-race" element={<HostSpaceRace />} />
              <Route path="space-race/:raceId/display" element={<HostSpaceRaceDisplay />} />
              <Route path="reports" element={<HostReports />} />
              <Route path="anonymous-chat" element={<HostAnonymousChat />} />
              <Route path="profile" element={<HostProfile />} />
            </Route>

            {/* Legacy path redirects (teacher→host, student→audience) */}
            <Route
              path="/teacher/*"
              element={<LegacyPathRedirect fromPrefix="/teacher" toPrefix="/host" />}
            />
            <Route
              path="/student/*"
              element={<LegacyPathRedirect fromPrefix="/student" toPrefix="/audience" />}
            />
            <Route path="/teacher-login" element={<Navigate to="/host/signin" replace />} />

            {/* 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        {!isTeacherRoute && !isCreateQuizRoute && !hidePublicChrome && <Footer />}
        
        {/* Hybrid Alert System */}
        <ToastContainer position="top-center" />
        <InlineAlertContainer />
        <CustomModalContainer />
      </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
