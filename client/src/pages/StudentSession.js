import React from 'react';
import { useParams, Link } from 'react-router-dom';

const StudentSession = () => {
  const { code } = useParams();
  const name = sessionStorage.getItem('studentName') || '';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Session</h1>
        <p className="text-text-light mb-6">
          <span className="font-medium">Name:</span> {name || 'Student'}
          <br />
          <span className="font-medium">Code:</span> {code}
        </p>

        <div className="border border-dashed border-gray-300 rounded-xl p-6 bg-background">
          <p className="text-text-light">
            Waiting for your teacher to start the quiz/content for this code.
          </p>
          <p className="text-sm text-text-light mt-2">
            This is a placeholder screen. Next we will connect it to real-time quiz sessions.
          </p>
        </div>

        <div className="mt-6">
          <Link to="/join" className="text-primary hover:text-primary-dark font-medium">
            Change code/name
          </Link>
        </div>
      </div>
    </div>
  );
};

export default StudentSession;
