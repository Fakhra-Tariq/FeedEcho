import React, { useState } from 'react';
import { Trophy, Clock, Users } from 'lucide-react';

export default function SpaceRaceAnswer() {
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedAnswer.trim()) {
      setFeedback('Please enter an answer');
      return;
    }
    
    setIsSubmitted(true);
    setFeedback('Answer submitted!');
    
    // Here you would typically submit to the actual API
    // For now, just show the submission feedback
    setTimeout(() => {
      setIsSubmitted(false);
      setSelectedAnswer('');
      setFeedback('');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center">
            <Trophy className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Space Race Quiz</h1>
            <p className="text-gray-600 mb-8">Answer the question to score points for your team!</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Answer
              </label>
              <textarea
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={4}
                placeholder="Type your answer here..."
                disabled={isSubmitted}
              />
            </div>
            
            {feedback && (
              <div className={`p-4 rounded-lg ${
                feedback.includes('submitted') 
                  ? 'bg-green-100 text-green-800' 
                  : feedback.includes('Please enter') 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-blue-100 text-blue-800'
              }`}>
                <p className="font-medium">{feedback}</p>
              </div>
            )}
            
            <button
              onClick={handleSubmit}
              disabled={isSubmitted || !selectedAnswer.trim()}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitted ? 'Submitting...' : 'Submit Answer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
