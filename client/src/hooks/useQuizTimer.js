import { useEffect, useCallback } from 'react';
import { useTeacherData } from '../contexts/TeacherDataContext';

const useQuizTimer = () => {
  const { data, setData, endActiveSession } = useTeacherData();

  // Check if any active quiz has expired and auto-finish it
  const checkQuizExpiration = useCallback(() => {
    if (!data.activeSession || data.activeSession.type !== 'quiz') {
      return;
    }

    const { endTime, quizId } = data.activeSession;
    const now = new Date();

    if (endTime && new Date(endTime) <= now) {
      // Quiz availability window has expired, auto-finish it
      handleAutoFinish(quizId);
    }
  }, [data.activeSession]);

  // Handle automatic quiz finishing
  const handleAutoFinish = useCallback((quizId) => {
    // End the active session
    endActiveSession();

    // Update quiz status to Finished
    setData((prev) => ({
      ...prev,
      quizzes: prev.quizzes.map((quiz) =>
        quiz.id === quizId
          ? { 
              ...quiz, 
              status: 'Finished', 
              joinCode: null, 
              launched: false,
              finishedAt: new Date().toISOString(),
              autoFinished: true
            }
          : quiz
      ),
    }));

    // Log the auto-finish activity
    const quiz = data.quizzes.find((item) => item.id === quizId);
    if (quiz) {
      console.log(`Quiz "${quiz.title}" automatically finished due to availability window expiration`);
    }
  }, [data.quizzes, setData, endActiveSession]);

  // Get time remaining for quiz availability window
  const getQuizAvailabilityTimeRemaining = useCallback(() => {
    if (!data.activeSession || data.activeSession.type !== 'quiz' || !data.activeSession.endTime) {
      return null;
    }

    const now = new Date();
    const endTime = new Date(data.activeSession.endTime);
    const remaining = endTime.getTime() - now.getTime();

    if (remaining <= 0) {
      return 0;
    }

    return Math.floor(remaining / 1000); // Return seconds
  }, [data.activeSession]);

  // Calculate student's remaining time based on hybrid timer logic
  const getStudentTimeRemaining = useCallback((studentJoinTime) => {
    if (!data.activeSession || data.activeSession.type !== 'quiz') {
      return null;
    }

    const { timePerStudentMinutes, endTime } = data.activeSession;
    const now = new Date();
    
    if (!timePerStudentMinutes) {
      return null; // No per-student timer set
    }

    // Calculate time since student joined
    const joinTime = new Date(studentJoinTime);
    const timeSinceJoin = Math.floor((now.getTime() - joinTime.getTime()) / 1000);
    const totalStudentTime = timePerStudentMinutes * 60;
    const studentTimeRemaining = Math.max(0, totalStudentTime - timeSinceJoin);

    // If quiz has an end time, calculate time until quiz ends
    if (endTime) {
      const quizEndTime = new Date(endTime);
      const quizTimeRemaining = Math.max(0, Math.floor((quizEndTime.getTime() - now.getTime()) / 1000));
      
      // Student gets the minimum of their remaining time or quiz availability
      return Math.min(studentTimeRemaining, quizTimeRemaining);
    }

    return studentTimeRemaining;
  }, [data.activeSession]);

  // Format time remaining for display
  const formatTimeRemaining = useCallback((seconds) => {
    if (!seconds || seconds <= 0) {
      return 'Expired';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Check expiration every second
  useEffect(() => {
    const interval = setInterval(() => {
      checkQuizExpiration();
    }, 1000);

    return () => clearInterval(interval);
  }, [checkQuizExpiration]);

  return {
    getQuizAvailabilityTimeRemaining,
    getStudentTimeRemaining,
    formatTimeRemaining,
    checkQuizExpiration,
    isQuizExpired: getQuizAvailabilityTimeRemaining() === 0
  };
};

export default useQuizTimer;
