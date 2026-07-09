import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastNotification = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const getToastStyles = () => {
    switch (toast.type) {
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
    switch (toast.type) {
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

  const styles = getToastStyles();

  return (
    <div
      className={`
        relative flex items-center space-x-3 p-4 rounded-2xl shadow-lg backdrop-blur-md
        ${styles.bg} ${styles.border} ${styles.text}
        min-w-[300px] max-w-[500px]
        transform transition-all duration-500 ease-out
        animate-in slide-in-from-top-2 fade-in-0
        hover:shadow-xl
      `}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.icon}`}>
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <h4 className="font-semibold text-sm mb-1">{toast.title}</h4>
        )}
        <p className="text-sm leading-relaxed opacity-95">{toast.message}</p>
      </div>

      {/* Close Button */}
      <button
        onClick={() => onRemove(toast.id)}
        className={`flex-shrink-0 p-1.5 rounded-lg ${styles.icon} ${styles.iconBg} hover:bg-white/30 transition-all duration-200`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ToastNotification;
