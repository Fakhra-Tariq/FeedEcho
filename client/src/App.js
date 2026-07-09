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
import Dashboard from './pages/Dashboard';
import About from './pages/Courses';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import CreateMultipleChoiceQuiz from './pages/CreateMultipleChoiceQuiz';
import CreateTrueFalseQuiz from './pages/CreateTrueFalseQuiz';
import CreateShortAnswerQuiz from './pages/CreateShortAnswerQuiz';
import CreateLongAnswerQuiz from './pages/CreateLongAnswerQuiz';
import MixedTypeQuizEditor from './pages/MixedTypeQuizEditor';
import QuizLibrary from './pages/QuizLibrary';

import StudentJoin from './pages/StudentJoin';
import StudentSession from './pages/StudentSession';
import StudentJoinSession from './pages/StudentJoinSession';
import StudentQuizAttempt from './pages/StudentQuizAttempt';
import StudentExitTicket from './pages/StudentExitTicket';
import StudentSpaceRaceJoin from './pages/StudentSpaceRaceJoin';
import StudentHome from './pages/StudentHome';
import StudentProgress from './pages/StudentProgress';
import StudentProfile from './pages/StudentProfile';
import StudentAuth from './pages/StudentAuth';
import StudentSignup from './pages/StudentSignup';
import StudentForgotPassword from './pages/StudentForgotPassword';
import QuizHistory from './pages/QuizHistory';
import SpaceRaceGame from './pages/SpaceRaceGame';
import StudentSpaceRacePage from './pages/StudentSpaceRacePage';
import SpaceRaceHistory from './pages/SpaceRaceHistory';
import StudentAnonymousChat from './pages/StudentAnonymousChat';
import TeacherSignIn from './pages/TeacherSignIn';
import TeacherSignUp from './pages/TeacherSignUp';
import TeacherForgotPassword from './pages/TeacherForgotPassword';
import TeacherDashboard from './pages/TeacherDashboard';
// Teacher Pages
import TeacherLaunch from './pages/TeacherLaunch';
import TeacherQuizzes from './pages/TeacherQuizzes';
import TeacherExitTickets from './pages/TeacherExitTickets';
import ExitTicketDashboard from './pages/ExitTicketDashboard';
import CreateExitTicketPage from './pages/CreateExitTicketPage';
import StudentExitTicketJoin from './pages/StudentExitTicketJoin';
import ExitTicketResponses from './pages/ExitTicketResponses';
import TeacherExitTicketResponses from './pages/TeacherExitTicketResponses';
import TeacherSpaceRace from './pages/TeacherSpaceRace';
import TeacherSpaceRaceDisplay from './pages/TeacherSpaceRaceDisplay';
import TeacherReports from './pages/TeacherReports';
import TeacherAnonymousChat from './pages/TeacherAnonymousChat';
import TeacherProfile from './pages/TeacherProfile';
import TeacherLayout from './components/Teacher/TeacherLayout';
import SessionsPage from './pages/SessionsPage';

function AppContent() {
  const location = useLocation();
  const isTeacherRoute =
    location.pathname.startsWith('/teacher') || location.pathname.startsWith('/sessions');
  const isCreateQuizRoute = location.pathname.startsWith('/create');
  const isStudentRoute = location.pathname.startsWith('/student');
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
            <Route path="/join" element={<StudentJoin />} />
            <Route path="/join/space-race" element={<StudentSpaceRaceJoin />} />
            <Route path="/space-race" element={<SpaceRaceHistory />} />
            <Route path="/space-race/:raceId/quiz/:quizId" element={<StudentSpaceRacePage />} />
            <Route path="/space-race/:raceId" element={<StudentSpaceRacePage />} />
            <Route path="/space-race/play/:raceId" element={<SpaceRaceGame />} />
            <Route path="/session/:code" element={<StudentSession />} />
            <Route path="/student/join" element={<StudentJoinSession />} />
            <Route path="/student/quiz/:quizId" element={<StudentQuizAttempt />} />
            <Route path="/student/exit-ticket" element={<StudentExitTicketJoin />} />
            <Route path="/student/exit-ticket/:joinCode" element={<StudentExitTicket />} />
            <Route path="/student/chat" element={<StudentAnonymousChat />} />
            <Route path="/student/space-race/:raceId/quiz/:quizId" element={<StudentSpaceRacePage />} />
            <Route path="/student/space-race/:raceId" element={<StudentSpaceRacePage />} />
            <Route path="/student/home" element={<StudentHome />} />
            <Route path="/student/progress" element={<StudentProgress />} />
            <Route path="/student/profile" element={<StudentProfile />} />
            <Route path="/student/auth" element={<StudentAuth />} />
            <Route path="/student/signup" element={<StudentSignup />} />
            <Route path="/student/forgot" element={<StudentForgotPassword />} />
            <Route path="/student/quiz-history" element={<QuizHistory />} />
            <Route path="/create/multiple-choice" element={<CreateMultipleChoiceQuiz />} />
            <Route path="/create/true-false" element={<CreateTrueFalseQuiz />} />
            <Route path="/create/short-answer" element={<CreateShortAnswerQuiz />} />
            <Route path="/create/long-answer" element={<CreateLongAnswerQuiz />} />
            <Route path="/create/mixed-type" element={<MixedTypeQuizEditor />} />
            <Route path="/quiz-library" element={<Navigate to="/teacher/library" replace />} />
            <Route path="/teacher-login" element={<Navigate to="/teacher/signin" replace />} />
            <Route path="/teacher/signin" element={
              <ServerHealthCheck>
                <TeacherSignIn />
              </ServerHealthCheck>
            } />
            <Route path="/teacher/signup" element={
              <ServerHealthCheck>
                <TeacherSignUp />
              </ServerHealthCheck>
            } />
            <Route path="/teacher/forgot" element={<TeacherForgotPassword />} />
            <Route path="/login" element={<Navigate to="/teacher/signin" replace />} />
            <Route path="/register" element={<Navigate to="/teacher/signup" replace />} />
            <Route path="/about" element={<About />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
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
                  <TeacherLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<SessionsPage />} />
            </Route>

            {/* Teacher Routes */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="explore" replace />} />
              <Route path="explore" element={<TeacherDashboard />} />
              <Route path="dashboard" element={<TeacherDashboard />} />
              <Route path="launch" element={<TeacherLaunch />} />
              <Route path="quizzes" element={<TeacherQuizzes />} />
              <Route path="exit-tickets" element={<ExitTicketDashboard />} />
              <Route path="exit-tickets/create" element={<CreateExitTicketPage />} />
              <Route path="exit-tickets/:ticketId/responses" element={<TeacherExitTicketResponses />} />
              <Route path="library" element={<QuizLibrary />} />
              <Route path="space-race" element={<TeacherSpaceRace />} />
              <Route path="space-race/:raceId/display" element={<TeacherSpaceRaceDisplay />} />
              <Route path="reports" element={<TeacherReports />} />
              <Route path="anonymous-chat" element={<TeacherAnonymousChat />} />
              <Route path="profile" element={<TeacherProfile />} />
            </Route>

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
