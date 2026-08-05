import React, { useState } from 'react';
import { X, FileText, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { appToast } from '../contexts/HybridAlertContext';
import { ensureQuestionIds } from '../utils/quizQuestionNormalization';
import { getQuizTypeMismatchError } from '../utils/detectQuizContentType';

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
Answer: C

2. Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B`;
      
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
        return `Paste your mixed-type questions in this format (use any 2 or all 3 tags, in any order):

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
Sample Answer: H2O`;
        
      default:
        return 'Paste your quiz content here...';
    }
  };

  const handleCreateQuiz = async () => {
    if (!pastedContent.trim()) {
      appToast.error('Please paste some content before creating a quiz.');
      return;
    }

    const mismatchError = getQuizTypeMismatchError(pastedContent, selectedType, 'pasted');
    if (mismatchError) {
      appToast.error(mismatchError);
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

      // Create quiz object — assign unique IDs after parse (does not change parse rules)
      const quiz = {
        id: Date.now(),
        title: `Copy & Paste Quiz - ${selectedType}`,
        type: selectedType,
        questions: ensureQuestionIds(parsedQuestions),
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
    if (type === 'Mixed Type') {
      return parseMixedType(content);
    }

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

  /** Normalize Mixed Type section tags. Long Answer is recognized only as a boundary and ignored. */
  const normalizeMixedTag = (raw) => {
    const key = String(raw || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (key === 'MCQ' || key === 'MULTIPLE CHOICE') return 'MCQ';
    if (key === 'TRUE/FALSE' || key === 'TRUE / FALSE' || key === 'T/F') return 'TRUE/FALSE';
    if (key === 'SHORT ANSWER' || key === 'SHORTANSWER') return 'SHORT ANSWER';
    if (key === 'LONG ANSWER' || key === 'LONGANSWER') return 'LONG ANSWER';
    return null;
  };

  /**
   * Split pasted Mixed Type content by recognized tags and parse each section independently.
   * Any combination of [MCQ], [TRUE/FALSE], and [SHORT ANSWER] is supported (2 or all 3).
   */
  const parseMixedType = (content) => {
    const questions = [];
    const tagRegex = /\[\s*(MCQ|MULTIPLE\s+CHOICE|TRUE\s*\/\s*FALSE|T\/F|SHORT\s*ANSWER|LONG\s*ANSWER)\s*\]/gi;
    const sections = [];
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      const kind = normalizeMixedTag(match[1]);
      if (!kind) continue;
      sections.push({
        kind,
        bodyStart: match.index + match[0].length,
        tagStart: match.index,
      });
    }

    if (sections.length === 0) {
      return [];
    }

    for (let i = 0; i < sections.length; i++) {
      const { kind, bodyStart } = sections[i];
      if (kind === 'LONG ANSWER') continue;

      const bodyEnd = i + 1 < sections.length ? sections[i + 1].tagStart : content.length;
      const lines = content
        .slice(bodyStart, bodyEnd)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (kind === 'MCQ') {
        questions.push(...parseMixedMultipleChoice(lines));
      } else if (kind === 'TRUE/FALSE') {
        questions.push(...parseMixedTrueFalse(lines));
      } else if (kind === 'SHORT ANSWER') {
        questions.push(...parseMixedShortAnswer(lines));
      }
    }

    return questions;
  };

  const parseMixedMultipleChoice = (lines) => {
    const questions = [];
    let currentQuestion = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^\d+\./.test(line)) {
        if (currentQuestion) questions.push(currentQuestion);
        currentQuestion = {
          id: Date.now() + questions.length,
          type: 'multiple-choice',
          questionText: line.replace(/^\d+\.\s*/, ''),
          options: ['', '', '', ''],
          correctAnswer: 0,
        };
      } else if (/^[A-D]\)/i.test(line) && currentQuestion) {
        const optionIndex = line[0].toUpperCase().charCodeAt(0) - 65;
        const optionText = line.replace(/^[A-D]\)\s*/i, '');
        if (optionIndex >= 0 && optionIndex < 4) {
          currentQuestion.options[optionIndex] = optionText;
        }
      } else if (/^answer:\s*/i.test(line) && currentQuestion) {
        const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toUpperCase();
        if (letter >= 'A' && letter <= 'D') {
          currentQuestion.correctAnswer = letter.charCodeAt(0) - 65;
        }
      }
    }

    if (currentQuestion) questions.push(currentQuestion);
    return questions;
  };

  const parseMixedTrueFalse = (lines) => {
    const questions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\d+\./.test(line)) continue;

      const questionText = line.replace(/^\d+\.\s*/, '');
      let correctAnswer = true;

      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].toLowerCase();
        if (nextLine.includes('answer:')) {
          if (nextLine.includes('false')) correctAnswer = false;
          else if (nextLine.includes('true')) correctAnswer = true;
          break;
        }
      }

      questions.push({
        id: Date.now() + questions.length,
        type: 'true-false',
        questionText,
        correctAnswer,
      });
    }

    return questions;
  };

  const parseMixedShortAnswer = (lines) => {
    const questions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\d+\./.test(line)) continue;

      const questionText = line.replace(/^\d+\.\s*/, '');
      let sampleAnswer = '';

      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.toLowerCase().includes('sample answer:')) {
          sampleAnswer = nextLine.replace(/sample answer:\s*/i, '');
          break;
        }
      }

      questions.push({
        id: Date.now() + questions.length,
        type: 'short-answer',
        questionText,
        sampleAnswer,
      });
    }

    return questions;
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
      // Correct answer line (e.g. "Answer: B" or "Answer: b")
      else if (/^answer:\s*/i.test(line) && currentQuestion) {
        const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toLowerCase();
        if (letter >= 'a' && letter <= 'd') {
          currentQuestion.options.forEach((opt) => {
            opt.isCorrect = opt.id === letter;
          });
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
