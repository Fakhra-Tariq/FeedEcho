import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Layers, 
  FileText, 
  ArrowRight,
  X
} from 'lucide-react';
import clsx from 'clsx';

const QuizStructureModal = ({ isOpen, onClose, onStructureSelect }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const quizStructures = [
    {
      key: 'single-type',
      title: 'Single-type quiz',
      description: 'Create a quiz with only one question type (MCQ, True/False, Short Answer, or Long Answer)',
      icon: FileText,
      color: 'from-[#6D415F] to-[#8B5A7C]',
      hoverColor: 'hover:from-[#5A344D] hover:to-[#7A4A6C]'
    },
    {
      key: 'mixed-type',
      title: 'Mixed-type quiz',
      description: 'Create a quiz with multiple question types in the same quiz',
      icon: Layers,
      color: 'from-[#6D415F] to-[#8B5A7C]',
      hoverColor: 'hover:from-[#5A344D] hover:to-[#7A4A6C]'
    }
  ];

  const handleStructureSelect = (structure) => {
    onStructureSelect(structure.key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-text mb-2">Choose Quiz Structure</h2>
          <p className="text-sm text-gray-600">Select how you want to structure your quiz</p>
        </div>

        {/* Structure Options */}
        <div className="grid gap-4 mb-8">
          {quizStructures.map((structure) => {
            const Icon = structure.icon;
            return (
              <button
                key={structure.key}
                onClick={() => handleStructureSelect(structure)}
                className={clsx(
                  'relative p-6 rounded-2xl border-2 transition-all duration-200',
                  'hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02]',
                  'border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-50 hover:border-[#6D415F]/30',
                  'group'
                )}
              >
                <div className="flex items-center space-x-4">
                  <div className={clsx(
                    'w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg',
                    structure.color,
                    structure.hoverColor,
                    'group-hover:scale-110 transition-transform duration-200'
                  )}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-semibold text-text mb-2">{structure.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{structure.description}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <ArrowRight className="w-6 h-6 text-[#6D415F]" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-3 text-text-light hover:text-text transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizStructureModal;
