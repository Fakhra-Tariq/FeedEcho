import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const CustomModal = ({ 
  isOpen, 
  onClose, 
  type = 'info', 
  title, 
  message, 
  confirmText = 'OK',
  cancelText,
  onConfirm,
  showCancel = false,
  closeOnConfirm = true,
  closeOnBackdrop = true 
}) => {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    if (closeOnConfirm) {
      onClose();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose();
    }
  };

  const getModalStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'text-white',
          iconBg: 'bg-white/20',
          buttonBg: 'bg-white text-[#6D415F] hover:bg-gray-100',
          titleColor: 'text-white'
        };
      case 'error':
        return {
          icon: 'text-white',
          iconBg: 'bg-white/20',
          buttonBg: 'bg-white text-[#6D415F] hover:bg-gray-100',
          titleColor: 'text-white'
        };
      case 'warning':
        return {
          icon: 'text-white',
          iconBg: 'bg-white/20',
          buttonBg: 'bg-white text-[#6D415F] hover:bg-gray-100',
          titleColor: 'text-white'
        };
      case 'info':
      default:
        return {
          icon: 'text-white',
          iconBg: 'bg-white/20',
          buttonBg: 'bg-white text-[#6D415F] hover:bg-gray-100',
          titleColor: 'text-white'
        };
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-8 h-8" />;
      case 'error':
        return <AlertCircle className="w-8 h-8" />;
      case 'warning':
        return <AlertTriangle className="w-8 h-8" />;
      case 'info':
      default:
        return <Info className="w-8 h-8" />;
    }
  };

  if (!isOpen) return null;

  const styles = getModalStyles();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-md transform transition-all duration-500 ease-out scale-100 opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#6D415F] backdrop-blur-md rounded-3xl shadow-2xl border border-[#6D415F] p-8">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Icon */}
          <div className={`flex justify-center mb-6`}>
            <div className={`w-16 h-16 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.icon}`}>
              {getIcon()}
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            {title && (
              <h3 className={`text-2xl font-bold mb-3 ${styles.titleColor}`}>
                {title}
              </h3>
            )}
            <p className="text-white/90 leading-relaxed">
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            {showCancel && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-white/30 text-white/80 rounded-2xl hover:bg-white/10 transition-all duration-200 font-medium"
              >
                {cancelText || 'Cancel'}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`flex-1 px-4 py-3 rounded-2xl transition-all duration-200 font-medium ${styles.buttonBg}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomModal;
