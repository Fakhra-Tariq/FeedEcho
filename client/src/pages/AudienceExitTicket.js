import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { exitTicketsAPI } from '../services/api';

const AudienceExitTicket = () => {
  const navigate = useNavigate();
  const { joinCode } = useParams();
  const { alert } = useHybridAlert();

  const [exitTicket, setExitTicket] = useState(null);
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExitTicket = async () => {
      try {
        setIsLoading(true);
        console.log('Student join code:', joinCode);
        
        const response = await exitTicketsAPI.getByCode(joinCode);
        
        if (response.data.success) {
          setExitTicket(response.data.data);
          console.log('Fetched exit ticket:', response.data.data);
          
          // Initialize answers object
          const initialAnswers = {};
          response.data.data.questions?.forEach((question, index) => {
            initialAnswers[index] = '';
          });
          setAnswers(initialAnswers);
        } else {
          alert.toast.error(response.data.error || 'Invalid or inactive Exit Ticket code');
          navigate('/audience/join');
        }
      } catch (error) {
        console.error('Error fetching exit ticket:', error);
        alert.toast.error('Failed to load exit ticket');
        navigate('/audience/join');
      } finally {
        setIsLoading(false);
      }
    };

    if (joinCode) {
      fetchExitTicket();
    }
  }, [joinCode, navigate, alert]);

  const handleAnswerChange = (questionIndex, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: value
    }));
  };

  const getJoinedStudentName = () => (sessionStorage.getItem('studentName') || '').trim();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const joinedName = getJoinedStudentName();
    if (!joinedName) {
      alert.toast.error('Please join the session with your name first');
      navigate('/audience/join');
      return;
    }

    // Check if all questions are answered
    const unansweredQuestions = exitTicket.questions?.filter((q, index) => !answers[index]?.trim());
    if (unansweredQuestions?.length > 0) {
      alert.toast.error('Please answer all questions');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Format answers for API
      const formattedAnswers = exitTicket.questions.map((question, index) => ({
        questionIndex: index,
        answer: answers[index].trim()
      }));

      const responseData = {
        ticketId: exitTicket.id,
        studentName: joinedName,
        answers: formattedAnswers,
      };

      console.log('Submitting response:', responseData);

      const result = await exitTicketsAPI.submitResponse(exitTicket.id, responseData);
      
      if (result.data.success) {
        setIsSubmitted(true);
        alert.toast.success('Response submitted successfully!');
        console.log('Response submitted successfully');
      } else {
        alert.toast.error(result.data.error || 'Failed to submit response');
      }
    } catch (error) {
      console.error('Error submitting response:', error);
      const errorMessage = error.response?.data?.error || 'Failed to submit response';
      alert.toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestionInput = (question, index) => {
    const answer = answers[index] || '';

    switch (question.type) {
      case 'likert':
        return (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Rate your agreement:
            </label>
            <div className="space-y-2">
              {["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"].map((option, optionIndex) => (
                <label key={option} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'multiple_choice':
        return (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Choose your answer:
            </label>
            <div className="space-y-2">
              {question.options?.map((option) => (
                <label key={option} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'true_false':
        return (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select your answer:
            </label>
            <div className="space-y-2">
              {['True', 'False'].map((option) => (
                <label key={option} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'short_text':
      default:
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Your response:
            </label>
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(index, e.target.value)}
              placeholder="Enter your response here..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">
              {answer.length}/500 characters
            </p>
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exit ticket...</p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Response Submitted!
            </h1>
            <p className="text-gray-600 mb-6">
              Thank you for completing the exit ticket. Your response has been recorded.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl hover:from-primary/90 hover:to-primary/70 transition-all duration-300 font-semibold"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Exit Ticket Form */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-soft border border-primary/10 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Exit Ticket Content */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-text mb-6">
                  {exitTicket?.title}
                </h2>

                {/* Questions */}
                <div className="space-y-8">
                  {exitTicket?.questions?.map((question, index) => (
                    <div key={index} className="border-b border-gray-200 pb-6 last:border-0">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium text-text mb-2">
                          Question {index + 1}
                        </h3>
                        <p className="text-text-light">
                          {question.prompt}
                        </p>
                      </div>

                      {/* Question Input */}
                      {renderQuestionInput(question, index)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl hover:from-primary/90 hover:to-primary/70 transition-all duration-300 font-semibold shadow-soft hover:shadow-soft-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Submit Response</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudienceExitTicket;
