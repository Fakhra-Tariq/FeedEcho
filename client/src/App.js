import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ToastContainer from './components/ToastContainer';
import InlineAlertContainer from './components/InlineAlertContainer';
import CustomModalContainer from './components/CustomModalContainer';
import ErrorBoundary from './components/ErrorBoundary';

// Components
import Navbar from './components/Layout/Navbar';
import Footer from './components/Layout/Footer';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import RedirectIfHostTeacher from './components/Auth/RedirectIfHostTeacher';
import ScrollToTop from './components/ScrollToTop';

// Eager: landing + both login pages so they paint without waiting on other routes
import Home from './pages/Home';
import About from './pages/Courses';
import Contact from './pages/Contact';
import AudienceJoin from './pages/AudienceJoin';
import AudienceHome from './pages/AudienceHome';
import HostSignIn from './pages/HostSignIn';
import HostDashboard from './pages/HostDashboard';
import HostSpaceRace from './pages/HostSpaceRace';
import SessionsPage from './pages/SessionsPage';
import HostLayout from './components/Host/HostLayout';
import HostReports from './pages/HostReports';
import HostProfile from './pages/HostProfile';
import AudienceProfile from './pages/AudienceProfile';

const NotFound = lazy(() => import('./pages/NotFound'));
const Profile = lazy(() => import('./pages/Profile'));
const CreateMultipleChoiceQuiz = lazy(() => import('./pages/CreateMultipleChoiceQuiz'));
const CreateTrueFalseQuiz = lazy(() => import('./pages/CreateTrueFalseQuiz'));
const CreateShortAnswerQuiz = lazy(() => import('./pages/CreateShortAnswerQuiz'));
const CreateLongAnswerQuiz = lazy(() => import('./pages/CreateLongAnswerQuiz'));
const MixedTypeQuizEditor = lazy(() => import('./pages/MixedTypeQuizEditor'));
const QuizLibrary = lazy(() => import('./pages/QuizLibrary'));
const AudienceSession = lazy(() => import('./pages/AudienceSession'));
const AudienceJoinSession = lazy(() => import('./pages/AudienceJoinSession'));
const AudienceQuizAttempt = lazy(() => import('./pages/AudienceQuizAttempt'));
const AudienceExitTicket = lazy(() => import('./pages/AudienceExitTicket'));
const AudienceSpaceRaceJoin = lazy(() => import('./pages/AudienceSpaceRaceJoin'));
const AudienceProgress = lazy(() => import('./pages/AudienceProgress'));
const AudienceSignup = lazy(() => import('./pages/AudienceSignup'));
const AudienceForgotPassword = lazy(() => import('./pages/AudienceForgotPassword'));
const QuizHistory = lazy(() => import('./pages/QuizHistory'));
const SpaceRaceGame = lazy(() => import('./pages/SpaceRaceGame'));
const AudienceSpaceRacePage = lazy(() => import('./pages/AudienceSpaceRacePage'));
const SpaceRaceHistory = lazy(() => import('./pages/SpaceRaceHistory'));
const AudienceAnonymousChat = lazy(() => import('./pages/AudienceAnonymousChat'));
const HostSignUp = lazy(() => import('./pages/HostSignUp'));
const HostForgotPassword = lazy(() => import('./pages/HostForgotPassword'));
const HostLaunch = lazy(() => import('./pages/HostLaunch'));
const HostQuizzes = lazy(() => import('./pages/HostQuizzes'));
const ExitTicketDashboard = lazy(() => import('./pages/ExitTicketDashboard'));
const CreateExitTicketPage = lazy(() => import('./pages/CreateExitTicketPage'));
const AudienceExitTicketJoin = lazy(() => import('./pages/AudienceExitTicketJoin'));
const HostExitTicketResponses = lazy(() => import('./pages/HostExitTicketResponses'));
const HostSpaceRaceDisplay = lazy(() => import('./pages/HostSpaceRaceDisplay'));
const HostAnonymousChat = lazy(() => import('./pages/HostAnonymousChat'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}

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

  return (
    <div className="min-h-screen">
      {!isTeacherRoute && !isCreateQuizRoute && !hidePublicChrome && <Navbar />}
      <main className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<RedirectIfHostTeacher redirectStudent><Home /></RedirectIfHostTeacher>} />
            <Route path="/join" element={<RedirectIfHostTeacher redirectStudent><AudienceJoin /></RedirectIfHostTeacher>} />
            <Route path="/join/space-race" element={<RedirectIfHostTeacher><AudienceSpaceRaceJoin /></RedirectIfHostTeacher>} />
            <Route path="/space-race" element={<RedirectIfHostTeacher><SpaceRaceHistory /></RedirectIfHostTeacher>} />
            <Route path="/space-race/:raceId/quiz/:quizId" element={<RedirectIfHostTeacher><AudienceSpaceRacePage /></RedirectIfHostTeacher>} />
            <Route path="/space-race/:raceId" element={<RedirectIfHostTeacher><AudienceSpaceRacePage /></RedirectIfHostTeacher>} />
            <Route path="/space-race/play/:raceId" element={<RedirectIfHostTeacher><SpaceRaceGame /></RedirectIfHostTeacher>} />
            <Route path="/session/:code" element={<RedirectIfHostTeacher><AudienceSession /></RedirectIfHostTeacher>} />
            <Route path="/audience/join" element={<RedirectIfHostTeacher><AudienceJoinSession /></RedirectIfHostTeacher>} />
            <Route path="/audience/quiz/:quizId" element={<RedirectIfHostTeacher><AudienceQuizAttempt /></RedirectIfHostTeacher>} />
            <Route path="/audience/exit-ticket" element={<RedirectIfHostTeacher><AudienceExitTicketJoin /></RedirectIfHostTeacher>} />
            <Route path="/audience/exit-ticket/:joinCode" element={<RedirectIfHostTeacher><AudienceExitTicket /></RedirectIfHostTeacher>} />
            <Route path="/audience/chat" element={<RedirectIfHostTeacher><AudienceAnonymousChat /></RedirectIfHostTeacher>} />
            <Route path="/audience/space-race/:raceId/quiz/:quizId" element={<RedirectIfHostTeacher><AudienceSpaceRacePage /></RedirectIfHostTeacher>} />
            <Route path="/audience/space-race/:raceId" element={<RedirectIfHostTeacher><AudienceSpaceRacePage /></RedirectIfHostTeacher>} />
            <Route path="/audience/home" element={<AudienceHome />} />
            <Route path="/audience/progress" element={<AudienceProgress />} />
            <Route path="/audience/profile" element={<AudienceProfile />} />
            <Route path="/audience/auth" element={<Navigate to="/join" replace />} />
            <Route path="/audience/signup" element={<RedirectIfHostTeacher redirectStudent><AudienceSignup /></RedirectIfHostTeacher>} />
            <Route path="/audience/forgot" element={<RedirectIfHostTeacher redirectStudent><AudienceForgotPassword /></RedirectIfHostTeacher>} />
            <Route path="/audience/quiz-history" element={<QuizHistory />} />
            <Route path="/create/multiple-choice" element={<CreateMultipleChoiceQuiz />} />
            <Route path="/create/true-false" element={<CreateTrueFalseQuiz />} />
            <Route path="/create/short-answer" element={<CreateShortAnswerQuiz />} />
            <Route path="/create/long-answer" element={<CreateLongAnswerQuiz />} />
            <Route path="/create/mixed-type" element={<MixedTypeQuizEditor />} />
            <Route path="/quiz-library" element={<Navigate to="/host/library" replace />} />
            <Route path="/host-login" element={<Navigate to="/host/signin" replace />} />
            <Route path="/host/signin" element={
              <RedirectIfHostTeacher redirectStudent>
                <HostSignIn />
              </RedirectIfHostTeacher>
            } />
            <Route path="/host/signup" element={
              <RedirectIfHostTeacher redirectStudent>
                <HostSignUp />
              </RedirectIfHostTeacher>
            } />
            <Route path="/host/forgot" element={<RedirectIfHostTeacher redirectStudent><HostForgotPassword /></RedirectIfHostTeacher>} />
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
        </Suspense>
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
        <ScrollToTop />
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
