import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { useHybridAlert } from '../contexts/HybridAlertContext';
import { exitTicketsAPI } from '../services/api';
import { getStoredAudienceSession } from '../utils/audienceSession';
import GuestProgressLoginBanner from '../components/Audience/GuestProgressLoginBanner';
import {
  AudienceActivityHeader,
  AudienceActivityContent,
  AudienceActivityCard,
} from '../components/Audience/AudienceActivityLayout';

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
          <div className="space-y-2.5">
            <label className="block text-sm font-medium text-text">
              Rate your agreement:
            </label>
            <div className="space-y-2.5">
              {["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"].map((option) => (
                <label key={option} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    checked={answer === option}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <span className="text-sm text-text">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'multiple_choice':
        return (
          <div className="space-y-2.5">
            <label className="block text-sm font-medium text-text">
              Choose your answer:
            </label>
            <div className="space-y-2.5">
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
                  <span className="text-sm text-text">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'true_false':
        return (
          <div className="space-y-2.5">
            <label className="block text-sm font-medium text-text">
              Select your answer:
            </label>
            <div className="space-y-2.5">
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
                  <span className="text-sm text-text">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      
      case 'short_text':
      default:
        return (
          <div>
            <label className="block text-sm font-medium text-text">
              Your response:
            </label>
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(index, e.target.value)}
              placeholder="Enter your response here..."
              className="mt-2 w-full px-4 py-3 border-[1.5px] border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#6D415F] focus:border-[#6D415F] transition-colors text-text resize-none bg-white"
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-text-light mt-2">
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

  const participantDisplayName =
    getJoinedStudentName() ||
    getStoredAudienceSession()?.name ||
    'Audience';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <AudienceActivityHeader
        title={exitTicket?.title}
        participantName={participantDisplayName}
      />

      <GuestProgressLoginBanner />

      <AudienceActivityContent>
        <AudienceActivityCard>
          <form onSubmit={handleSubmit}>
            {exitTicket?.questions?.map((question, index) => (
              <div key={index} className={index === 0 ? '' : 'mt-4'}>
                <h3 className="text-sm text-text-light">
                  Question {index + 1}
                </h3>
                <p className="mt-4 text-base sm:text-lg font-semibold text-text leading-snug">
                  {question.prompt}
                </p>
                <div className="mt-4">
                  {renderQuestionInput(question, index)}
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={isSubmitting}
              className={`mt-4 w-full flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-bold transition-all ${
                isSubmitting
                  ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  : 'bg-[#6D415F] text-white hover:bg-[#5c3650]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Response</span>
                </>
              )}
            </button>
          </form>
        </AudienceActivityCard>
      </AudienceActivityContent>
    </div>
  );
};

export default AudienceExitTicket;
