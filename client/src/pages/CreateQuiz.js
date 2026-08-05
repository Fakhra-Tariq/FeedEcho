import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const CreateQuiz = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedCode = code.trim();
    if (!trimmedTitle || !trimmedCode) return;

    sessionStorage.setItem('teacherQuizTitle', trimmedTitle);
    sessionStorage.setItem('sessionCode', trimmedCode);

    navigate('/host');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-text mb-2">Create Quiz</h1>
        <p className="text-text-light mb-6">For now, just set a title and the session code to share with students.</p>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-light mb-2">Quiz Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Chapter 1 Quiz"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light mb-2">Session Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. AB12CD"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-2.5 rounded-lg"
            >
              Save
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateQuiz;
