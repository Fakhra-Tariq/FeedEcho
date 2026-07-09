import React, { useState, useEffect } from 'react';
import { checkServerHealth } from '../services/api';

const ServerHealthCheck = ({ children }) => {
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking', 'healthy', 'error'
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await checkServerHealth();
        setServerStatus('healthy');
      } catch (error) {
        setServerStatus('error');
        
        // Auto-retry if it's a network error and we haven't retried too many times
        if (error.isNetworkError && retryCount < 3) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            checkHealth();
          }, 2000 * (retryCount + 1)); // Exponential backoff
        }
      }
    };

    checkHealth();
  }, [retryCount]);

  if (serverStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Server is starting...
          </h2>
          <p className="text-gray-600 mb-4">
            Please wait while we connect to the server.
          </p>
          {retryCount > 0 && (
            <p className="text-sm text-gray-500">
              Retry attempt {retryCount}/3...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (serverStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Server Unavailable
          </h1>
          
          <p className="text-gray-600 mb-6">
            We can't connect to the server right now. Please make sure the backend server is running on port 5000.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors duration-200"
            >
              Retry Connection
            </button>
            
            <div className="text-sm text-gray-500 space-y-1">
              <p>To start the server, run:</p>
              <code className="block bg-gray-100 p-2 rounded text-left">
                cd server && npm start
              </code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Server is healthy, render children
  return children;
};

export default ServerHealthCheck;
