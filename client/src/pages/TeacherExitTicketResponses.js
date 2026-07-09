import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, FileText, BarChart3, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { exitTicketsAPI } from '../services/api';

export default function TeacherExitTicketResponses() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [exitTicket, setExitTicket] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchExitTicketAndResponses();
  }, [id]);

  const fetchExitTicketAndResponses = async () => {
    try {
      setIsLoading(true);
      
      // Fetch exit ticket details
      const ticketResponse = await exitTicketsAPI.getById(id);
      if (ticketResponse.data.success) {
        setExitTicket(ticketResponse.data.data);
      }

      // Fetch responses
      const responsesResponse = await exitTicketsAPI.getResponses(id);
      if (responsesResponse.data.success) {
        setResponses(responsesResponse.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to load exit ticket responses');
    } finally {
      setIsLoading(false);
    }
  };

  const getResponseCountForQuestion = (questionIndex) => {
    return responses.filter(response => 
      response.answers && response.answers[questionIndex] && response.answers[questionIndex].answer
    ).length;
  };

  // Check if responses should be shown (minimum 2 responses for anonymity)
  const shouldShowResponses = (questionIndex) => {
    const responseCount = getResponseCountForQuestion(questionIndex);
    return responseCount >= 2;
  };

  const getResponsesForQuestion = (questionIndex) => {
    return responses
      .filter(response => 
        response.answers && response.answers[questionIndex] && response.answers[questionIndex].answer
      )
      .map(response => response.answers[questionIndex].answer);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-light">Loading responses...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-text mb-2">Error Loading Responses</h2>
          <p className="text-text-light mb-4">{errorMessage}</p>
          <button
            onClick={() => navigate('/teacher/exit-tickets')}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!exitTicket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text mb-2">Exit Ticket Not Found</h2>
          <p className="text-text-light mb-4">The exit ticket you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/teacher/exit-tickets')}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/teacher/exit-tickets')}
                className="flex items-center gap-2 text-text-light hover:text-text transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <div className="w-px h-6 bg-gray-300"></div>
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <h1 className="text-lg font-semibold text-text">{exitTicket.title}</h1>
                  <p className="text-sm text-text-light">Anonymous Responses</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-text-light text-sm">Total Questions</p>
                <p className="text-2xl font-bold text-text">{exitTicket.questions?.length || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-text-light text-sm">Total Responses</p>
                <p className="text-2xl font-bold text-text">{responses.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-text-light text-sm">Attendance Count</p>
                <p className="text-2xl font-bold text-text">{responses.length} students</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-text-light text-sm">Response Rate</p>
                <p className="text-2xl font-bold text-text">
                  {exitTicket.joinCode ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Question Tabs */}
        {exitTicket.questions && exitTicket.questions.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="border-b border-gray-200">
              <div className="flex space-x-8">
                {exitTicket.questions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedQuestion(index)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      selectedQuestion === index
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-light hover:text-text'
                    }`}
                  >
                    Q{index + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Content */}
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-text mb-4">
                  {exitTicket.questions[selectedQuestion].prompt}
                </h3>
                
                {/* Question Type Badge */}
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm mb-4">
                  {exitTicket.questions[selectedQuestion].type.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                </div>
              </div>

              {/* Response Analytics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-text mb-3">Response Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-text-light">Total Responses:</span>
                      <span className="text-sm font-medium text-text">
                        {getResponseCountForQuestion(selectedQuestion)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-text-light">Response Rate:</span>
                      <span className="text-sm font-medium text-text">
                        {responses.length > 0 
                          ? Math.round((getResponseCountForQuestion(selectedQuestion) / responses.length) * 100) 
                          : 0}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-text mb-3">Quick Stats</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-text-light">
                        Anonymous responses collected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-text-light">
                        Real-time feedback
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Responses */}
              <div>
                <h4 className="font-medium text-text mb-3">Individual Responses</h4>
                {shouldShowResponses(selectedQuestion) ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {getResponsesForQuestion(selectedQuestion).map((response, index) => (
                      <div key={index} className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-sm text-text">{response}</p>
                        <p className="text-xs text-text-light mt-1">
                          Response #{index + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    {getResponseCountForQuestion(selectedQuestion) === 0 ? (
                      <>
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-text-light">No responses submitted yet for this question.</p>
                      </>
                    ) : (
                      <>
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-4">
                          <div className="flex items-center justify-center mb-4">
                            <div className="bg-primary/20 rounded-full p-3">
                              <Users className="w-8 h-8 text-primary" />
                            </div>
                          </div>
                          <h3 className="text-lg font-semibold text-primary mb-2">
                            Student Privacy Protected
                          </h3>
                          <p className="text-text-light mb-4">
                            Responses will appear once at least 2 students submit feedback to ensure privacy.
                          </p>
                          <div className="bg-primary/5 rounded-lg p-3">
                            <p className="text-sm text-primary">
                              <span className="font-medium">Current responses:</span> {getResponseCountForQuestion(selectedQuestion)} / 2 minimum
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text mb-2">No Questions Found</h3>
            <p className="text-text-light">This exit ticket doesn't have any questions.</p>
          </div>
        )}

        {/* Overall No Responses Message */}
        {responses.length === 0 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <Users className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Responses Submitted Yet</h3>
            <p className="text-yellow-700">
              Students haven't submitted any responses to this exit ticket yet. 
              Share the join code <span className="font-mono font-bold">{exitTicket.joinCode}</span> with your students.
              <br />
              <span className="text-sm mt-2 block">
                Responses will appear once at least 2 students submit feedback to maintain anonymity.
              </span>
            </p>
          </div>
        )}

        {/* Single Response Protection Message */}
        {responses.length === 1 && (
          <div className="mt-6 bg-primary/10 border border-primary/20 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-primary/20 rounded-full p-3">
                <Users className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">
              Student Privacy Protected
            </h3>
            <p className="text-text-light mb-4">
              Responses will appear once at least 2 students submit feedback to ensure privacy.
            </p>
            <div className="bg-primary/5 rounded-lg p-3">
              <p className="text-sm text-primary">
                <span className="font-medium">Current responses:</span> 1 / 2 minimum
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
