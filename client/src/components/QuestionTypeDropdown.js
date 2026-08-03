import React, { useState, useRef, useEffect } from 'react';
import { 
  CheckSquare, 
  Circle, 
  Type, 
  Plus,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';

const QuestionTypeDropdown = ({ onAddQuestion, currentQuizType = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const questionTypes = [
    {
      key: 'multiple-choice',
      title: 'MCQs',
      fullTitle: 'Multiple Choice Questions',
      icon: CheckSquare,
      color: 'from-blue-500 to-blue-600',
      hoverColor: 'hover:from-blue-600 hover:to-blue-700'
    },
    {
      key: 'true-false',
      title: 'True / False',
      fullTitle: 'True / False Questions',
      icon: Circle,
      color: 'from-green-500 to-green-600',
      hoverColor: 'hover:from-green-600 hover:to-green-700'
    },
    {
      key: 'short-answer',
      title: 'Short Answer',
      fullTitle: 'Short Answer Questions',
      icon: Type,
      color: 'from-purple-500 to-purple-600',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700'
    }
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAddQuestion = (questionType) => {
    onAddQuestion(questionType);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Add Question Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center space-x-2 px-6 py-3 rounded-xl font-medium transition-all duration-200',
          'bg-gradient-to-r from-[#6D415F] to-[#8B5A7C]',
          'text-white shadow-sm hover:shadow-md',
          'hover:scale-[1.02] active:scale-[0.98]',
          'focus:outline-none focus:ring-2 focus:ring-[#6D415F]/50'
        )}
      >
        <Plus className="w-5 h-5" />
        <span>Add Question</span>
        <ChevronDown className={clsx(
          'w-4 h-4 transition-transform duration-200',
          isOpen ? 'rotate-180' : ''
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="p-2">
            {questionTypes.map((type) => {
              const Icon = type.icon;
              const isCurrentType = currentQuizType === type.key;
              
              return (
                <button
                  key={type.key}
                  onClick={() => handleAddQuestion(type.key)}
                  disabled={isCurrentType}
                  className={clsx(
                    'w-full flex items-center space-x-3 p-3 rounded-lg transition-all duration-200',
                    'mb-1 last:mb-0',
                    'hover:bg-gray-50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'group'
                  )}
                >
                  <div className={clsx(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-white',
                    'bg-gradient-to-r',
                    type.color,
                    'group-hover:scale-110 transition-transform duration-200'
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium text-sm text-gray-900">{type.title}</div>
                    <div className="text-xs text-gray-500">{type.fullTitle}</div>
                  </div>
                  {isCurrentType && (
                    <div className="text-xs text-gray-400 font-medium">Current</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionTypeDropdown;
