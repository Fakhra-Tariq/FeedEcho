import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { exitTicketsAPI } from '../client/src/services/api';

const StudentExitTicket = () => {
  const [joinCode, setJoinCode] = useState('');
  const [exitTicket, setExitTicket] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleJoinCode = async () => {
    if (!joinCode.trim()) {
      showToast('Please enter a join code', 'error');
      return;
    }

    try {
      console.log('Student join code:', joinCode.toUpperCase());
      const response = await exitTicketsAPI.getByCode(joinCode.toUpperCase());
      
      if (response.data.success) {
        const ticketData = response.data.data;
        setExitTicket(ticketData);
        // Initialize answers array
        const initialAnswers = ticketData.questions.map(() => '');
        setAnswers(initialAnswers);
        console.log('Student ticket loaded:', ticketData);
      } else {
        showToast('Invalid or inactive Exit Ticket code', 'error');
      }
    } catch (error) {
      console.error('Failed to join exit ticket:', error);
      showToast('Failed to join exit ticket', 'error');
    }
  };

  const handleAnswerChange = (questionIndex, value) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = value;
    setAnswers(newAnswers);
  };

  const handleSubmit = async () => {
    if (!exitTicket) return;

    // Validate all questions are answered
    const unansweredQuestions = answers.filter((answer, index) => !answer || answer.toString().trim() === '');
    if (unansweredQuestions.length > 0) {
      showToast('Please answer all questions', 'error');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const responseData = {
        ticketId: exitTicket.id,
        answers: answers.map((answer, index) => ({
          questionIndex: index,
          answer: answer
        }))
      };
      
      console.log('Submitting response:', responseData);
      
      const response = await exitTicketsAPI.submitResponse(exitTicket.id, responseData);
      
      if (response.data.success) {
        setIsSubmitted(true);
        showToast('Response submitted successfully!', 'success');
      } else {
        showToast(response.data.error || 'Failed to submit response', 'error');
      }
    } catch (error) {
      console.error('Failed to submit response:', error);
      showToast('Failed to submit response', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (message, type) => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 3000);
  };

  const renderQuestionInput = (question, index) => {
    const answer = answers[index] || '';

    switch (question.type) {
      case 'short_text':
        return (
          <div key={index} className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {index + 1}. {question.prompt}
            </label>
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(index, e.target.value)}
              placeholder="Enter your answer..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              disabled={isSubmitted}
            />
          </div>
        );

      case 'multiple_choice':
        return (
          <div key={index} className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {index + 1}. {question.prompt}
            </label>
            <div className="space-y-2">
              {question.options?.map((option, optIndex) => (
                <label key={optIndex} className="flex items-center">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    disabled={isSubmitted}
                    className="mr-2"
                  />
                  <span className="text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'likert':
        return (
          <div key={index} className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {index + 1}. {question.prompt}
            </label>
            <div className="space-y-2">
              {['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'].map((option, optIndex) => (
                <label key={optIndex} className="flex items-center">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    disabled={isSubmitted}
                    className="mr-2"
                  />
                  <span className="text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'true_false':
        return (
          <div key={index} className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {index + 1}. {question.prompt}
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name={`question-${index}`}
                  value="true"
                  checked={answer === 'true'}
                  onChange={(e) => handleAnswerChange(index, e.target.value)}
                  disabled={isSubmitted}
                  className="mr-2"
                />
                <span className="text-gray-700">True</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name={`question-${index}`}
                  value="false"
                  checked={answer === 'false'}
                  onChange={(e) => handleAnswerChange(index, e.target.value)}
                  disabled={isSubmitted}
                  className="mr-2"
                />
                <span className="text-gray-700">False</span>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-green-600 mb-4">Submitted Successfully!</h2>
          <p className="text-gray-600 mb-4">
            Thank you for completing the exit ticket. Your responses have been recorded.
          </p>
          <p className="text-sm text-gray-500">
            You can now close this window.
          </p>
        </div>
      </div>
    );
  }

  if (!exitTicket) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Join Exit Ticket</h1>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Join Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono"
                maxLength={6}
              />
            </div>

            <button
              type="button"
              onClick={handleJoinCode}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center"
            >
              Join Exit Ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{exitTicket.title}</h1>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                Code: {exitTicket.joinCode}
              </span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                {exitTicket.questions.length} Questions
              </span>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div className="space-y-6">
              {exitTicket.questions.map((question, index) => renderQuestionInput(question, index))}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Responses
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentExitTicket;
