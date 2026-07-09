import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, FileText, CheckCircle, X } from 'lucide-react';
import { exitTicketsAPI } from '../services/api';

export default function StudentExitTicketJoin() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [exitTicket, setExitTicket] = useState(null);

  const handleJoinCode = async () => {
    if (!joinCode.trim()) {
      setErrorMessage('Please enter a join code');
      setTimeout(() => setErrorMessage(''), 5000);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      console.log('Student join code:', joinCode.toUpperCase());
      const response = await exitTicketsAPI.getByCode(joinCode.toUpperCase());
      
      if (response.data.success) {
        const ticketData = response.data.data;
        setExitTicket(ticketData);
        // Navigate to the exit ticket form with the ticket data
        navigate(`/student/exit-ticket/${ticketData.id}`, { 
          state: { ticket: ticketData, joinCode: joinCode.toUpperCase() } 
        });
      } else {
        setErrorMessage('Invalid or inactive Exit Ticket code');
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      console.error('Failed to join exit ticket:', error);
      setErrorMessage('Failed to join exit ticket');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleJoinCode();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors mr-4"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5 text-text" />
            </button>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full">
              <FileText className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Exit Ticket</h1>
          <p className="text-text-light">Enter your join code to submit feedback</p>
        </div>

        {/* Join Code Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Join Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => {
                  const newValue = e.target.value.toUpperCase().slice(0, 6);
                  console.log('onChange:', { original: e.target.value, processed: newValue, length: newValue.length });
                  setJoinCode(newValue);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData.getData('text');
                  const processedText = pastedText.toUpperCase().slice(0, 6);
                  console.log('onPaste:', { pasted: pastedText, processed: processedText, length: processedText.length });
                  setJoinCode(processedText);
                }}
                onKeyPress={handleKeyPress}
                placeholder="Enter 6-character code"
                className="w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-center text-xl font-bold text-text placeholder-neutral-400 uppercase"
                maxLength={6}
              />
              <p className="text-xs text-text-light mt-2">
                Enter 6-character code provided by your teacher
              </p>
            </div>

            <button
              onClick={handleJoinCode}
              disabled={isLoading || joinCode.length !== 6}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Joining...' : 'Join Exit Ticket'}
              <Users className="w-4 h-4 ml-2 inline" />
            </button>

            {/* Instructions */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-text mb-2">How it works:</h3>
              <ul className="space-y-2 text-sm text-text-light">
                <li className="flex items-start gap-2">
                  <span className="text-primary">1.</span>
                  <span>Enter the 6-character join code from your teacher</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">2.</span>
                  <span>Answer all questions honestly and completely</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">3.</span>
                  <span>Submit once - your responses are anonymous</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">4.</span>
                  <span>Your attendance will be automatically marked</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-green-100 rounded-full mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-medium text-text text-sm">Anonymous</h3>
            <p className="text-xs text-text-light mt-1">Your name is never stored</p>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-medium text-text text-sm">Quick</h3>
            <p className="text-xs text-text-light mt-1">Submit in just a few minutes</p>
          </div>
        </div>

        {/* Error Message */}
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
  );
}
