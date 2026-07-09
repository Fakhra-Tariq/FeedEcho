import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, X, Rocket, Share2, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { appToast } from '../../contexts/HybridAlertContext';

const LibraryIcon = () => {
  const navigate = useNavigate();
  const [savedQuizzes, setSavedQuizzes] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [deleteConfirmQuiz, setDeleteConfirmQuiz] = useState(null);

  // Load saved quizzes from localStorage
  useEffect(() => {
    const loadQuizzes = () => {
      const quizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
      // Filter for non-launched quizzes
      const notLaunchedQuizzes = quizzes.filter(q => !q.launched);
      setSavedQuizzes(notLaunchedQuizzes);
    };

    loadQuizzes();
    
    // Listen for storage changes
    const handleStorageChange = () => {
      loadQuizzes();
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getQuizCount = () => {
    return savedQuizzes.length;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const launchQuiz = (quizId) => {
    const quizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
    const quizIndex = quizzes.findIndex(q => q.id === quizId);
    
    if (quizIndex !== -1) {
      quizzes[quizIndex].launched = true;
      localStorage.setItem('savedQuizzes', JSON.stringify(quizzes));
      
      // Update local state
      setSavedQuizzes(prev => prev.filter(q => q.id !== quizId));
      
      // Navigate to launch page
      navigate('/teacher/launch');
    }
  };

  const shareQuiz = (quizId) => {
    // Implement share functionality
    appToast.info('Share functionality coming soon!');
  };

  const deleteQuiz = (quizId) => {
    setDeleteConfirmQuiz(quizId);
  };

  const confirmDelete = () => {
    if (deleteConfirmQuiz) {
      const quizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
      const updatedQuizzes = quizzes.filter(q => q.id !== deleteConfirmQuiz);
      localStorage.setItem('savedQuizzes', JSON.stringify(updatedQuizzes));
      
      // Update local state
      setSavedQuizzes(prev => prev.filter(q => q.id !== deleteConfirmQuiz));
      setDeleteConfirmQuiz(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmQuiz(null);
  };

  const openLibrary = () => {
    navigate('/quiz-library');
  };

  return (
    <>
      {/* Library Icon Button */}
      <div className="fixed top-28 right-10 z-40">
        <button
          onClick={openLibrary}
          className="relative p-3 bg-[#6D415F] text-white rounded-full shadow-lg hover:bg-[#5A344D] transition-colors"
        >
          <Library className="w-5 h-5" />
          {getQuizCount() > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {getQuizCount()}
            </span>
          )}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDelete}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Quiz</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this quiz? This action cannot be undone.
            </p>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LibraryIcon;
