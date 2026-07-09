import React, { useState, useEffect } from 'react';
import { getStoredStudentSession } from '../utils/studentSession';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle, Clock, Users, X } from 'lucide-react';
import { exitTicketsAPI } from '../services/api';

const LIKERT_OPTIONS = [
  "Strongly Agree",
  "Agree", 
  "Neutral",
  "Disagree",
  "Strongly Disagree"
];

export default function StudentExitTicketSubmit() {
  const navigate = useNavigate();
  const location = useLocation();
  const [exitTicket, setExitTicket] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const fetchTicketData = async () => {
      if (location.state?.ticket) {
        const ticket = location.state.ticket;
        setExitTicket(ticket);
        // Initialize answers array
        const initialAnswers = ticket.questions.map(() => '');
        setAnswers(initialAnswers);
        
        // Set up timer if needed
        if (ticket.timeLimit) {
          setTimeLeft(ticket.timeLimit * 60); // Convert minutes to seconds
        }
      } else {
        // If no state, try to get ticket ID from URL and fetch data
        const pathParts = window.location.pathname.split('/');
        const ticketId = pathParts[pathParts.length - 1];
        
        if (ticketId && ticketId !== 'exit-ticket') {
          try {
            console.log('Fetching exit ticket data for ID:', ticketId);
            const response = await exitTicketsAPI.getById(ticketId);
            
            if (response.data.success) {
              const ticket = response.data.data;
              setExitTicket(ticket);
              // Initialize answers array
              const initialAnswers = ticket.questions.map(() => '');
              setAnswers(initialAnswers);
              
              // Set up timer if needed
              if (ticket.timeLimit) {
                setTimeLeft(ticket.timeLimit * 60); // Convert minutes to seconds
              }
            } else {
              console.error('Failed to fetch exit ticket:', response.data.error);
              navigate('/student/exit-ticket');
            }
          } catch (error) {
            console.error('Error fetching exit ticket:', error);
            navigate('/student/exit-ticket');
          }
        } else {
          // If no valid ticket ID, redirect back to join page
          navigate('/student/exit-ticket');
        }
      }
    };

    fetchTicketData();
  }, [location.state, navigate]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleAnswerChange = (questionIndex, answer) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = answer;
    setAnswers(newAnswers);
  };

  const getJoinedStudentName = () => (sessionStorage.getItem('studentName') || '').trim();

  const handleSubmit = async () => {
    if (!exitTicket) return;

    const joinedName = getJoinedStudentName();
    if (!joinedName) {
      setErrorMessage('Please join the session with your name first');
      setTimeout(() => {
        setErrorMessage('');
        navigate('/student/join');
      }, 2000);
      return;
    }

    // Validate all questions are answered
    const unansweredQuestions = answers.filter((answer, index) => !answer || answer.toString().trim() === '');
    if (unansweredQuestions.length > 0 && !isSubmitted) {
      setErrorMessage('Please answer all questions before submitting');
      setTimeout(() => setErrorMessage(''), 5000);
      return;
    }

    setIsSubmitting(true);
    
    try {
      const loggedInStudent = getStoredStudentSession();
      const responseData = {
        ticketId: exitTicket.id,
        studentName: joinedName,
        answers: answers.map((answer, index) => ({
          questionIndex: index,
          answer: answer
        })),
        ...(loggedInStudent?.uid ? { studentUid: loggedInStudent.uid } : {}),
        ...(loggedInStudent?.email ? { studentEmail: loggedInStudent.email } : {}),
      };
      
      console.log('Submitting response:', responseData);
      
      const response = await exitTicketsAPI.submitResponse(exitTicket.id, responseData);
      
      if (response.data.success) {
        setIsSubmitted(true);
        // Clear timer
        setTimeLeft(null);
        
        // Show success message briefly, then redirect to refresh data
        setTimeout(() => {
          // Navigate back to exit ticket join page to refresh the data
          navigate('/student/exit-ticket', { replace: true });
        }, 2000);
      } else {
        setErrorMessage(response.data.error || 'Failed to submit response');
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      console.error('Failed to submit response:', error);
      setErrorMessage('Failed to submit response');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">Thank You!</h1>
            <p className="text-text-light mb-6">
              Your anonymous feedback has been submitted successfully. Your attendance has been marked.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 text-sm text-text-light">
                <Users className="w-4 h-4" />
                <span>Attendance marked automatically</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/student/exit-ticket')}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Join Another Exit Ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!exitTicket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-text-light">Loading exit ticket...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-text-light hover:text-text transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-text-light">Anonymous</span>
              </div>
            </div>
            
            {timeLeft !== null && (
              <div className="flex items-center gap-2 text-orange-600">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{formatTime(timeLeft)}</span>
              </div>
            )}
            
            <div className="text-sm text-text-light">
              {exitTicket.questions.length} questions
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Title */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-text">{exitTicket.title}</h1>
            <p className="text-sm text-text-light mt-1">
              Please answer all questions honestly. Your responses are completely anonymous.
            </p>
          </div>

          {/* Questions */}
          <div className="p-6 space-y-8">
            {exitTicket.questions.map((question, index) => (
              <div key={index} className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-text mb-4">{question.prompt}</h3>
                    
                    {/* Question Type Inputs */}
                    {question.type === 'short_text' && (
                      <textarea
                        value={answers[index] || ''}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        placeholder="Type your answer here..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                      />
                    )}

                    {question.type === 'multiple_choice' && (
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <label key={optionIndex} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option}
                              checked={answers[index] === option}
                              onChange={(e) => handleAnswerChange(index, e.target.value)}
                              className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <span className="text-text">{option}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {question.type === 'likert' && (
                      <div className="space-y-2">
                        {LIKERT_OPTIONS.map((option, optionIndex) => (
                          <label key={optionIndex} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option}
                              checked={answers[index] === option}
                              onChange={(e) => handleAnswerChange(index, e.target.value)}
                              className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-text">{option}</span>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((num) => (
                                  <div
                                    key={num}
                                    className={`w-2 h-2 rounded-full ${
                                      answers[index] === option ? 'bg-primary' : 'bg-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {question.type === 'true_false' && (
                      <div className="space-y-2">
                        {['True', 'False'].map((option) => (
                          <label key={option} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option}
                              checked={answers[index] === option}
                              onChange={(e) => handleAnswerChange(index, e.target.value)}
                              className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <span className="text-text">{option}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="px-6 py-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Exit Ticket'}
              <Send className="w-4 h-4 ml-2 inline" />
            </button>
            
            {errorMessage && (
              <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                <div className="flex items-center">
                  <X className="w-4 h-4 mr-2" />
                  {errorMessage}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-light">Progress</span>
            <span className="text-text font-medium">
              {answers.filter(a => a && a.toString().trim()).length} / {exitTicket.questions.length} questions
            </span>
          </div>
          <div className="mt-2 bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(answers.filter(a => a && a.toString().trim()).length / exitTicket.questions.length) * 100}%`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
