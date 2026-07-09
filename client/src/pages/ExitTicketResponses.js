import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, PieChart, Download, Users, MessageSquare, TrendingUp, CheckCircle, Eye, X } from 'lucide-react';
import { exitTicketsAPI } from '../services/api';

export default function ExitTicketResponses() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [responses, setResponses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);

  useEffect(() => {
    fetchTicketAndResponses();
  }, [ticketId]);

  const fetchTicketAndResponses = async () => {
    try {
      setIsLoading(true);
      
      // Fetch ticket details
      const ticketResponse = await exitTicketsAPI.getById(ticketId);
      if (!ticketResponse.data.success) {
        throw new Error('Failed to fetch ticket details');
      }
      setTicket(ticketResponse.data.data);

      // Fetch responses with summary and attendance
      const responsesResponse = await exitTicketsAPI.getResponses(ticketId);
      if (responsesResponse.data.success) {
        setResponses(responsesResponse.data.data.responses || []);
        setSummary(responsesResponse.data.data.summary);
        setAttendance(responsesResponse.data.data.attendance || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to load exit ticket data');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if responses should be shown (minimum 2 responses for anonymity)
  const shouldShowResponses = () => {
    return responses.length >= 2;
  };

  // Calculate response rate
  const getResponseRate = () => {
    if (attendance.length === 0) return 0;
    return Math.round((responses.length / attendance.length) * 100);
  };

  const renderChart = (questionData, questionIndex) => {
    const question = ticket.questions[questionIndex];
    
    if (question.type === 'short_text') {
      return renderTextResponses(questionData, questionIndex);
    }
    
    if (question.type === 'multiple_choice' || question.type === 'likert' || question.type === 'true_false') {
      return renderBarChart(questionData, question);
    }
    
    return null;
  };

  const renderBarChart = (data, question) => {
    const options = Object.keys(data);
    const counts = Object.values(data);
    const maxCount = Math.max(...counts);
    
    return (
      <div className="space-y-3">
        {options.map((option, index) => {
          const percentage = maxCount > 0 ? (data[option] / maxCount) * 100 : 0;
          return (
            <div key={option} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-text">{option}</span>
                <span className="text-sm text-text-light">{data[option]} responses</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-8">
                <div
                  className="bg-primary h-8 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                >
                  {percentage > 10 && (
                    <span className="text-xs text-white font-medium">
                      {Math.round(percentage)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTextResponses = (data, questionIndex) => {
    return (
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {data.map((response, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-text text-sm leading-relaxed">{response}</p>
            <div className="mt-2 text-xs text-text-light">
              Response #{index + 1}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPieChart = (data, question) => {
    const options = Object.keys(data);
    const counts = Object.values(data);
    const total = counts.reduce((sum, count) => sum + count, 0);
    
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500',
      'bg-pink-500', 'bg-indigo-500', 'bg-gray-500'
    ];

    return (
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 42 42" className="w-48 h-48">
            {counts.map((count, index) => {
              const percentage = (count / total) * 100;
              const angle = (percentage / 100) * 360;
              const previousAngles = counts.slice(0, index).reduce((sum, c) => {
                return sum + (c / total) * 360;
              }, 0);
              
              const x1 = 21 + 21 * Math.cos((previousAngles - 90) * Math.PI / 180);
              const y1 = 21 + 21 * Math.sin((previousAngles - 90) * Math.PI / 180);
              const x2 = 21 + 21 * Math.cos((previousAngles + angle - 90) * Math.PI / 180);
              const y2 = 21 + 21 * Math.sin((previousAngles + angle - 90) * Math.PI / 180);
              
              const largeArcFlag = angle > 180 ? 1 : 0;
              
              return (
                <path
                  key={index}
                  d={`M 21 21 L ${x1} ${y1} A 21 21 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={colors[index % colors.length].replace('bg-', '#').replace('500', '500')}
                  className="hover:opacity-80 transition-opacity"
                />
              );
            })}
          </svg>
        </div>
        <div className="ml-6 space-y-2">
          {options.map((option, index) => (
            <div key={option} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`}></div>
              <span className="text-sm text-text">{option}: {data[option]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-text-light">Loading responses...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-red-600">{errorMessage}</p>
          <button
            onClick={() => navigate('/teacher/exit-tickets')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!ticket || !summary) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/teacher/exit-tickets')}
                className="flex items-center gap-2 text-text-light hover:text-text transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-primary" />
                <div>
                  <h1 className="text-xl font-semibold text-text">{ticket.title}</h1>
                  <p className="text-sm text-text-light">Exit Ticket Responses</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-text-light">Total Responses</p>
                <p className="text-lg font-semibold text-text">{responses.length}</p>
              </div>
              <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-light text-sm">Total Questions</p>
                <p className="text-2xl font-bold text-text">{ticket.questions.length}</p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-light text-sm">Total Students Present</p>
                <p className="text-2xl font-bold text-text">{attendance.length}</p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-light text-sm">Total Responses</p>
                <p className="text-2xl font-bold text-text">{responses.length}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-light text-sm">Response Rate</p>
                <p className="text-2xl font-bold text-text">{getResponseRate()}%</p>
              </div>
              <div className="p-2 bg-orange-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text">Attendance</h2>
            <button
              onClick={() => setShowAttendanceModal(true)}
              className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium hover:bg-green-200 transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              {attendance.length} Students (View List)
            </button>
          </div>
          {attendance.length > 0 ? (
            <div className="space-y-2">
              {attendance.map((student, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {student.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-text">{student.name}</p>
                    <p className="text-sm text-text-light">
                      {new Date(student.joinedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-text-light">No students have joined this exit ticket yet.</p>
            </div>
          )}
        </div>

        {/* Question Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <div className="flex space-x-8 px-6">
              {ticket.questions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedQuestion(index)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    selectedQuestion === index
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-light hover:text-text'
                  }`}
                >
                  Question {index + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Question Content */}
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-text mb-2">
                Question {selectedQuestion + 1}
              </h2>
              <p className="text-text-light">{ticket.questions[selectedQuestion].prompt}</p>
              <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                {ticket.questions[selectedQuestion].type.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
              </div>
            </div>

            {/* Chart Type Toggle */}
            {ticket.questions[selectedQuestion].type !== 'short_text' && (
              <div className="mb-6 flex gap-2">
                <button className="px-3 py-1 bg-primary text-white rounded-lg text-sm">
                  <BarChart3 className="w-4 h-4 inline mr-1" />
                  Bar Chart
                </button>
                <button className="px-3 py-1 border border-gray-300 text-text-light rounded-lg text-sm hover:bg-gray-50">
                  <PieChart className="w-4 h-4 inline mr-1" />
                  Pie Chart
                </button>
              </div>
            )}

            {/* Chart */}
            <div className="bg-gray-50 rounded-lg p-6">
              {summary[`question_${selectedQuestion}`] && (
                renderChart(
                  summary[`question_${selectedQuestion}`].data,
                  selectedQuestion
                )
              )}
            </div>

            {/* Responses Section */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text mb-4">Responses</h3>
              {responses.length >= 2 ? (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-text-light">
                      Anonymous responses collected ({responses.length} total)
                    </span>
                  </div>
                  
                  {ticket.questions[selectedQuestion].type === 'short_text' && (
                    <div>
                      {renderTextResponses(
                        summary[`question_${selectedQuestion}`].data,
                        selectedQuestion
                      )}
                    </div>
                  )}

                  {ticket.questions[selectedQuestion].type !== 'short_text' && (
                    <div>
                      {renderChart(
                        summary[`question_${selectedQuestion}`].data,
                        selectedQuestion
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 text-center">
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
                      <span className="font-medium">Current responses:</span> {responses.length} / 2 minimum
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Modal */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-text">Attendance List</h2>
              <button
                onClick={() => setShowAttendanceModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-text-light mb-3">
                <span className="font-medium">Attendance ({attendance.length} Students)</span>
              </p>
              <p className="text-xs text-text-light">
                Real student names • Only visible to teacher • Pulled from attendance table
              </p>
            </div>

            {attendance.length > 0 ? (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {attendance.map((student, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {student.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-text">{student.name}</p>
                      <p className="text-sm text-text-light">
                        Joined: {new Date(student.joinedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-text-light">No students have joined this exit ticket yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
