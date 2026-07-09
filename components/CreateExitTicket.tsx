import React, { useState, useEffect } from 'react';
import { Plus, Save, Play } from 'lucide-react';

interface Question {
  prompt: string;
  type: 'short_text' | 'multiple_choice' | 'likert' | 'true_false';
  options?: string[];
}

const CreateExitTicket: React.FC = () => {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([
    { prompt: '', type: 'short_text', options: [] }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddQuestion = () => {
    setQuestions([...questions, {
      prompt: '',
      type: 'short_text',
      options: []
    }]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof Question, value: any) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setQuestions(updatedQuestions);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Title is required', 'error');
      return;
    }

    if (questions.length === 0 || questions.every(q => !q.prompt.trim())) {
      showToast('At least one question with a prompt is required', 'error');
      return;
    }

    // Validate questions
    for (const question of questions) {
      if (question.type === 'multiple_choice' && (!question.options || question.options.length < 2)) {
        showToast('Multiple choice questions must have at least 2 options', 'error');
        return;
      }
    }

    setIsSaving(true);
    
    try {
      const response = await fetch('/api/exit-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          questions,
          userId: 'current-user-id' // In production, get from auth context
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setTitle('');
        setQuestions([{ prompt: '', type: 'short_text', options: [] }]);
        showToast('Exit ticket created successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to create exit ticket', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
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

  const renderQuestionInput = (question: Question, index: number) => {
    return (
      <div key={index} className="border rounded-lg p-4 mb-4 bg-gray-50">
        <div className="flex justify-between items-start mb-3">
          <input
            type="text"
            value={question.prompt}
            onChange={(e) => handleQuestionChange(index, 'prompt', e.target.value)}
            placeholder="Enter question prompt"
            className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => handleRemoveQuestion(index)}
            className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-md"
          >
            ×
          </button>
        </div>
        
        <select
          value={question.type}
          onChange={(e) => handleQuestionChange(index, 'type', e.target.value)}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        >
          <option value="short_text">Short Text</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="likert">Likert Scale</option>
          <option value="true_false">True/False</option>
        </select>
        
        {question.type === 'multiple_choice' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Options:</p>
            {question.options?.map((option, optIndex) => (
              <div key={optIndex} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...(question.options || [])];
                    newOptions[optIndex] = e.target.value;
                    handleQuestionChange(index, 'options', newOptions);
                  }}
                  placeholder={`Option ${optIndex + 1}`}
                  className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newOptions = [...(question.options || [])];
                    newOptions.splice(optIndex, 1);
                    handleQuestionChange(index, 'options', newOptions);
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const newOptions = [...(question.options || []), ''];
                handleQuestionChange(index, 'options', newOptions);
              }}
              className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Add Option
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Exit Ticket</h1>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exit Ticket Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter exit ticket title"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </button>
            </div>
            
            <div className="space-y-2">
              {questions.map((question, index) => renderQuestionInput(question, index))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save as Draft
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateExitTicket;
