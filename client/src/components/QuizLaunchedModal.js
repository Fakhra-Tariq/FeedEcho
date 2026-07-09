import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../utils/copyToClipboard';

const QuizLaunchedModal = ({ isOpen, onClose, accessCode }) => {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    const ok = await copyToClipboard(accessCode);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark overlay background */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      {/* Popup modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-8 text-center">
          {/* Theme colored circular success icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#6D415F] rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Title and subtitle */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Launched</h2>
          <p className="text-sm text-gray-600 mb-8">Share this code with students</p>

          {/* Student Access Code box */}
          <div className="mb-8">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Student Access Code
              </label>
              <div className="text-3xl font-bold text-gray-900 tracking-widest uppercase">
                {accessCode}
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            {/* Primary Copy Code button */}
            <button
              onClick={copyCode}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#6D415F] text-white rounded-lg hover:bg-[#5A344D] transition-colors font-medium"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Code'}
            </button>

            {/* Secondary Close button */}
            <button
              onClick={onClose}
              className="w-full px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizLaunchedModal;
