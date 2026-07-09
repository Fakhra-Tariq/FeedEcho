import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Play, Square, Archive, X } from 'lucide-react';

interface Question {
  prompt: string;
  type: 'short_text' | 'multiple_choice' | 'likert' | 'true_false';
  options?: string[];
}

interface ExitTicket {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'ended' | 'archived';
  joinCode?: string;
  questions: Question[];
  responsesCount: number;
  createdAt: any;
}

interface ExitTicketProps {
  exitTicket: ExitTicket;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onEnd: (id: string) => void;
  onArchive: (id: string) => void;
  onViewCode: (joinCode: string) => void;
}

const ExitTicketCard: React.FC<ExitTicketProps> = ({
  exitTicket,
  onUpdate,
  onDelete,
  onLaunch,
  onEnd,
  onArchive,
  onViewCode
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(exitTicket.title);
  const [editQuestions, setEditQuestions] = useState<Question[]>(exitTicket.questions);

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    ended: 'bg-orange-100 text-orange-800',
    archived: 'bg-blue-100 text-blue-800'
  };

  const handleViewCode = () => {
    if (exitTicket.joinCode) {
      onViewCode(exitTicket.joinCode);
    }
  };

  const handleAddQuestion = () => {
    setEditQuestions([...editQuestions, {
      prompt: '',
      type: 'short_text',
      options: []
    }]);
  };

  const handleRemoveQuestion = (index: number) => {
    setEditQuestions(editQuestions.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof Question, value: any) => {
    const updatedQuestions = [...editQuestions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setEditQuestions(updatedQuestions);
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/exit-tickets/${exitTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          title: editTitle,
          questions: editQuestions
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setIsEditing(false);
        onUpdate();
        showToast('Exit ticket updated successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to update exit ticket', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/exit-tickets/${exitTicket.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        setShowDeleteModal(false);
        onDelete(exitTicket.id);
        showToast('Exit ticket deleted successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to delete exit ticket', 'error');
    }
  };

  const handleLaunch = async () => {
    try {
      const response = await fetch(`/api/exit-tickets/${exitTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch' })
      });

      const result = await response.json();
      
      if (result.success) {
        onLaunch(exitTicket.id);
        showToast('Exit ticket launched successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to launch exit ticket', 'error');
    }
  };

  const handleEnd = async () => {
    try {
      const response = await fetch(`/api/exit-tickets/${exitTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' })
      });

      const result = await response.json();
      
      if (result.success) {
        onEnd(exitTicket.id);
        showToast('Exit ticket ended successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to end exit ticket', 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const response = await fetch(`/api/exit-tickets/${exitTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' })
      });

      const result = await response.json();
      
      if (result.success) {
        onArchive(exitTicket.id);
        showToast('Exit ticket archived successfully', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Failed to archive exit ticket', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    // Simple toast implementation - in production, you'd use a proper toast library
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
            <X className="w-4 h-4" />
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
                  <X className="w-4 h-4" />
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
    <>
      <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
        {isEditing ? (
          <div className="space-y-4">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Exit ticket title"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
            />
            
            <div className="space-y-2">
              {editQuestions.map((question, index) => renderQuestionInput(question, index))}
            </div>
            
            <button
              type="button"
              onClick={handleAddQuestion}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </button>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{exitTicket.title}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[exitTicket.status]}`}>
                    {exitTicket.status.toUpperCase()}
                  </span>
                  {exitTicket.joinCode && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      Code: {exitTicket.joinCode}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-md"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                
                {exitTicket.joinCode && (
                  <button
                    type="button"
                    onClick={handleViewCode}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-md"
                    title="View Join Code"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 00-3 3 3 3 0 00-3 3m0 6a3 3 0 00-3 3 3 3 0 003 3m-3-3a3 3 0 006 6 6 6 0 00-3 3m0 6a3 3 0 006 6 6 6 0 00-3 3" />
                    </svg>
                  </button>
                )}
                
                {exitTicket.status === 'draft' && (
                  <button
                    type="button"
                    onClick={handleLaunch}
                    className="p-2 text-green-600 hover:bg-green-100 rounded-md"
                    title="Launch"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
                
                {exitTicket.status === 'active' && (
                  <button
                    type="button"
                    onClick={handleEnd}
                    className="p-2 text-orange-600 hover:bg-orange-100 rounded-md"
                    title="End"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                )}
                
                {exitTicket.status === 'ended' && (
                  <button
                    type="button"
                    onClick={handleArchive}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-md"
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded-md"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Questions:</strong> {exitTicket.questions.length}
              </p>
              <p className="text-sm text-gray-600 mb-2">
                <strong>Responses:</strong> {exitTicket.responsesCount}
              </p>
              <p className="text-sm text-gray-500">
                Created: {new Date(exitTicket.createdAt?.toDate?.() || exitTicket.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{exitTicket.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExitTicketCard;
