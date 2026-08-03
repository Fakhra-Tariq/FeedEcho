import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Sparkles, File } from 'lucide-react';
import clsx from 'clsx';
import { importQuestionsFromFile } from '../utils/importQuizFromFile';

const ImportQuizModal = ({ isOpen, onClose, onCreateQuiz }) => {
  const [selectedType, setSelectedType] = useState('Multiple Choice');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importErrorDetail, setImportErrorDetail] = useState('');
  const fileInputRef = useRef(null);

  const questionTypes = ['Multiple Choice', 'True / False', 'Short Answer', 'Mixed Type'];

  const getFileIcon = (fileName) => {
    const extension = fileName?.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="w-8 h-8 text-blue-500" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="w-8 h-8 text-green-500" />;
      case 'txt':
        return <FileText className="w-8 h-8 text-gray-500" />;
      default:
        return <File className="w-8 h-8 text-gray-500" />;
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!allowedTypes.includes(fileExtension)) {
        setImportStatus('error');
        setImportErrorDetail('Unsupported file type. Please upload PDF, DOC, DOCX, XLS, XLSX, or TXT.');
        return;
      }
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setImportStatus('error');
        setImportErrorDetail('File is too large. Maximum size is 10MB.');
        return;
      }
      
      setUploadedFile(file);
      setImportStatus('');
      setImportErrorDetail('');
    }
  };

  const handleImportQuiz = async () => {
    if (!uploadedFile) {
      setImportStatus('error');
      setImportErrorDetail('Please select a valid file to import.');
      return;
    }

    setIsImporting(true);
    setImportStatus('processing');
    setImportErrorDetail('');
    
    try {
      const { questions: parsedQuestions } = await importQuestionsFromFile(
        uploadedFile,
        selectedType
      );
      
      if (!parsedQuestions.length) {
        setImportStatus('error');
        setImportErrorDetail(
          'Could not find any questions in the file. Use the same format as Copy & Paste (numbered questions, A) B) C) D) options, Answer: lines, or [MCQ]/[TRUE/FALSE]/[SHORT ANSWER] tags for Mixed Type).'
        );
        setIsImporting(false);
        return;
      }

      // Create quiz object
      const quiz = {
        id: Date.now(),
        title: `Imported Quiz - ${uploadedFile.name.replace(/\.[^/.]+$/, '')}`,
        type: selectedType,
        questions: parsedQuestions,
        questionCount: parsedQuestions.length,
        createdDate: new Date().toISOString(),
        status: 'Draft',
        launched: false,
        isFromImport: true,
        originalFileName: uploadedFile.name
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
      setImportStatus('success');
      setTimeout(() => {
        onCreateQuiz(route);
      }, 500);
      
    } catch (error) {
      console.error('Error importing quiz:', error);
      setImportStatus('error');
      setImportErrorDetail(
        error?.message ||
          'Could not parse the file content. Please check the file format and try again.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const resetModal = () => {
    setUploadedFile(null);
    setImportStatus('');
    setImportErrorDetail('');
    setSelectedType('Multiple Choice');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#6D415F]/10 rounded-xl">
              <Upload className="w-6 h-6 text-[#6D415F]" />
            </div>
            <h2 className="text-2xl font-bold text-text">Import Quiz from File</h2>
          </div>
          <button
            onClick={handleClose}
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

          {/* File Upload Area */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-text mb-3">Upload File</label>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#6D415F]/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploadedFile ? (
                  <div className="flex flex-col items-center gap-3">
                    {getFileIcon(uploadedFile.name)}
                    <div>
                      <p className="font-medium text-text">{uploadedFile.name}</p>
                      <p className="text-sm text-gray-500">
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setUploadedFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-12 h-12 text-gray-400" />
                    <div>
                      <p className="font-medium text-text">Click to upload or drag and drop</p>
                      <p className="text-sm text-gray-500">PDF, DOC, DOCX, XLS, XLSX, TXT (max 10MB)</p>
                    </div>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Status Messages */}
          {importStatus === 'processing' && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">Processing File</p>
                  <p className="text-xs text-blue-700">
                    Parsing your {uploadedFile?.name} and extracting questions...
                  </p>
                </div>
              </div>
            </div>
          )}

          {importStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900 mb-1">Import Successful</p>
                  <p className="text-xs text-green-700">
                    Your quiz has been imported and is ready for editing. Redirecting...
                  </p>
                </div>
              </div>
            </div>
          )}

          {importStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900 mb-1">Import Failed</p>
                  <p className="text-xs text-red-700">
                    {importErrorDetail ||
                      (uploadedFile
                        ? 'Could not parse the file content. Please check the file format and try again.'
                        : 'Please select a valid file to import.')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Info */}
          {uploadedFile && !importStatus && (
            <div className="mb-6 p-4 bg-[#F2EBF0] rounded-xl border border-[#6D415F]/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#6D415F] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[#2E1F2A] mb-1">File Ready for Import</p>
                  <p className="text-xs text-[#5A4A55]">
                    Your {uploadedFile.name} will be parsed as {selectedType} questions. Review and edit the generated quiz after import.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 p-6 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-6 py-3 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImportQuiz}
            disabled={!uploadedFile || isImporting}
            className="flex items-center gap-2 px-6 py-3 bg-[#6D415F] text-white rounded-xl hover:bg-[#5A344D] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            {isImporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Import Quiz
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportQuizModal;
