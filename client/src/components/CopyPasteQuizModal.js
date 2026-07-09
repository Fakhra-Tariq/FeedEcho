import React, { useState } from 'react';
import { X, FileText, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { appToast } from '../contexts/HybridAlertContext';

const CopyPasteQuizModal = ({ isOpen, onClose, onCreateQuiz }) => {
  const [selectedType, setSelectedType] = useState('Multiple Choice');
  const [pastedContent, setPastedContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const questionTypes = ['Multiple Choice', 'True / False', 'Short Answer', 'Mixed Type'];

  const getPlaceholderText = () => {
    switch (selectedType) {
      case 'Multiple Choice':
        return `Paste your multiple choice questions in this format:

1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid

2. Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn`;
      
      case 'True / False':
        return `Paste your true/false questions in this format:

1. The Earth is flat.
Answer: False

2. The sun rises in the east.
Answer: True

3. Water freezes at 0°C.
Answer: True`;
      
      case 'Short Answer':
        return `Paste your short answer questions in this format:

1. What is the chemical symbol for water?
Sample Answer: H2O

2. Who wrote Romeo and Juliet?
Sample Answer: William Shakespeare

3. What is the largest planet in our solar system?
Sample Answer: Jupiter`;
        
      case 'Mixed Type':
        return `Paste your mixed-type questions in this format:

[MCQ]
1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Answer: C

[TRUE/FALSE]
2. The Earth is flat.
Answer: False

[SHORT ANSWER]
3. What is the chemical symbol for water?
Sample Answer: H2O

[LONG ANSWER]
4. Explain the process of photosynthesis.
Model Answer: Photosynthesis is the process by which plants convert sunlight into energy...
Marks: 10`;
        
      default:
        return 'Paste your quiz content here...';
    }
  };

  const handleCreateQuiz = async () => {
    if (!pastedContent.trim()) {
      appToast.error('Please paste some content before creating a quiz.');
      return;
    }

    setIsCreating(true);
    
    try {
      // Parse the pasted content based on question type
      const parsedQuestions = parseContent(pastedContent, selectedType);
      
      if (parsedQuestions.length === 0) {
        appToast.error('Could not parse any questions from the pasted content. Please check the format and try again.');
        setIsCreating(false);
        return;
      }

      // Create quiz object
      const quiz = {
        id: Date.now(),
        title: `Copy & Paste Quiz - ${selectedType}`,
        type: selectedType,
        questions: parsedQuestions,
        questionCount: parsedQuestions.length,
        createdDate: new Date().toISOString(),
        status: 'Draft',
        launched: false,
        isFromPaste: true // Flag to indicate this is a newly pasted quiz
      };

      // Store quiz data for editing
      localStorage.setItem('editingQuiz', JSON.stringify(quiz));
      
      // Determine the appropriate route based on question type
      let route;
      switch (selectedType) {
        case 'Multiple Choice':
          route = '/create/multiple-choice';
          break;
        case 'True / False':
          route = '/create/true-false';
          break;
        case 'Short Answer':
          route = '/create/short-answer';
          break;
        case 'Mixed Type':
          route = '/create/mixed-type';
          break;
        default:
          route = '/create/multiple-choice';
      }

      // Navigate to the appropriate quiz creation page
      onCreateQuiz(route);
      
    } catch (error) {
      console.error('Error creating quiz:', error);
      appToast.error('An error occurred while creating the quiz. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const parseContent = (content, type) => {
    const questions = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    switch (type) {
      case 'Multiple Choice':
        return parseMultipleChoice(lines);
      case 'True / False':
        return parseTrueFalse(lines);
      case 'Short Answer':
        return parseShortAnswer(lines);
      default:
        return [];
    }
  };

  const parseMultipleChoice = (lines) => {
    const questions = [];
    let currentQuestion = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Question line (starts with number)
      if (/^\d+\./.test(line)) {
        if (currentQuestion) {
          questions.push(currentQuestion);
        }
        currentQuestion = {
          id: Date.now() + questions.length,
          questionText: line.replace(/^\d+\.\s*/, ''),
          options: [
            { id: 'a', text: '', isCorrect: false },
            { id: 'b', text: '', isCorrect: false },
            { id: 'c', text: '', isCorrect: false },
            { id: 'd', text: '', isCorrect: false }
          ]
        };
      }
      // Option line (starts with A), B), C), D))
      else if (/^[A-D]\)/.test(line) && currentQuestion) {
        const optionId = line[0].toLowerCase();
        const optionText = line.replace(/^[A-D]\)\s*/, '');
        const optionIndex = optionId.charCodeAt(0) - 97; // a=0, b=1, c=2, d=3
        
        if (optionIndex < 4) {
          currentQuestion.options[optionIndex].text = optionText;
        }
      }
    }
    
    if (currentQuestion) {
      questions.push(currentQuestion);
    }
    
    return questions;
  };

  const parseTrueFalse = (lines) => {
    const questions = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Question line (starts with number)
      if (/^\d+\./.test(line)) {
        const questionText = line.replace(/^\d+\.\s*/, '');
        let correctAnswer = null;
        
        // Look for answer in next few lines
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim().toLowerCase();
          if (nextLine.includes('answer:')) {
            if (nextLine.includes('true')) {
              correctAnswer = 'true';
            } else if (nextLine.includes('false')) {
              correctAnswer = 'false';
            }
            break;
          }
        }
        
        questions.push({
          id: Date.now() + questions.length,
          questionText,
          correctAnswer
        });
      }
    }
    
    return questions;
  };

  const parseShortAnswer = (lines) => {
    const questions = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Question line (starts with number)
      if (/^\d+\./.test(line)) {
        const questionText = line.replace(/^\d+\.\s*/, '');
        let sampleAnswer = '';
        
        // Look for sample answer in next few lines
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.toLowerCase().includes('sample answer:')) {
            sampleAnswer = nextLine.replace(/sample answer:\s*/i, '');
            break;
          }
        }
        
        questions.push({
          id: Date.now() + questions.length,
          questionText,
          sampleAnswer
        });
      }
    }
    
    return questions;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#6D415F]/10 rounded-xl">
              <FileText className="w-6 h-6 text-[#6D415F]" />
            </div>
            <h2 className="text-2xl font-bold text-text">Create Quiz by Copy & Paste</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Question Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-text mb-3">Select Question Type</label>
            <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
              {questionTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={clsx(
                    'flex-shrink-0 relative p-4 rounded-2xl border-2 transition-all duration-200 min-w-[140px]',
                    'hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02]',
                    selectedType === type
                      ? 'border-primary/40 bg-gradient-to-br from-primary/8 via-primary/5 to-primary/8 shadow-md'
                      : 'border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-50 hover:border-primary/30'
                  )}
                >
                  <div className="text-center">
                    <div className={clsx(
                      'text-2xl mb-2',
                      selectedType === type ? 'scale-110' : 'scale-100 transition-transform'
                    )}>
                      {type === 'Multiple Choice' && '🔘'}
                      {type === 'True / False' && '✓'}
                      {type === 'Short Answer' && '📝'}
                      {type === 'Mixed Type' && '🎯'}
                    </div>
                    <h3 className="font-semibold text-text text-xs">{type}</h3>
                    {selectedType === type && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Paste Content Area */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-text mb-3">Paste Content</label>
            <textarea
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              placeholder={getPlaceholderText()}
              className="w-full h-64 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6D415F] focus:border-transparent transition-all font-mono text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Follow the format shown in the placeholder for best results
            </p>
          </div>

          {/* Preview Info */}
          {pastedContent.trim() && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">Content Detected</p>
                  <p className="text-xs text-blue-700">
                    Your content will be parsed as {selectedType} questions. Review and edit the generated quiz after creation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 p-6 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateQuiz}
            disabled={!pastedContent.trim() || isCreating}
            className="flex items-center gap-2 px-6 py-3 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Create Quiz
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CopyPasteQuizModal;
