import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const InlineAlert = ({ 
  type = 'info', 
  message, 
  title,
  duration = 4000,
  onClose,
  fullWidth = false,
  className = '',
  showIcon = true,
  dismissible = true 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0 && type !== 'error') {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, type]);

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) {
      onClose();
    }
  };

  const getAlertStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-[#6D415F]',
          border: 'border border-[#6D415F]',
          text: 'text-white',
          icon: 'text-white',
          iconBg: 'bg-white/20'
        };
      case 'error':
        return {
          bg: 'bg-[#6D415F]',
          border: 'border border-[#6D415F]',
          text: 'text-white',
          icon: 'text-white',
          iconBg: 'bg-white/20'
        };
      case 'warning':
        return {
          bg: 'bg-[#6D415F]',
          border: 'border border-[#6D415F]',
          text: 'text-white',
          icon: 'text-white',
          iconBg: 'bg-white/20'
        };
      case 'info':
      default:
        return {
          bg: 'bg-[#6D415F]',
          border: 'border border-[#6D415F]',
          text: 'text-white',
          icon: 'text-white',
          iconBg: 'bg-white/20'
        };
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  if (!isVisible) return null;

  const styles = getAlertStyles();

  return (
    <div
      className={`
        relative flex items-center space-x-3 p-4 rounded-2xl shadow-lg backdrop-blur-md
        ${styles.bg} ${styles.border} ${styles.text}
        ${fullWidth ? 'w-full' : 'max-w-2xl'}
        transform transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        ${className}
      `}
    >
      {/* Icon */}
      {showIcon && (
        <div className={`flex-shrink-0 w-8 h-8 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.icon}`}>
          {getIcon()}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="font-semibold text-sm mb-1">{title}</h4>
        )}
        <p className="text-sm leading-relaxed opacity-95">{message}</p>
      </div>

      {/* Close Button */}
      {dismissible && (
        <button
          onClick={handleClose}
          className={`flex-shrink-0 p-1.5 rounded-lg ${styles.icon} ${styles.iconBg} hover:bg-white/30 transition-all duration-200`}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default InlineAlert;
