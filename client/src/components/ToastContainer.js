import React from 'react';
import ToastNotification from './ToastNotification';
import { useHybridAlert } from '../contexts/HybridAlertContext';

const ToastContainer = ({ position = 'top-center' }) => {
  const { toasts, removeToast } = useHybridAlert();

  if (toasts.length === 0) return null;

  return (
    <div className={`fixed ${position === 'top-center' ? 'top-6 left-1/2 transform -translate-x-1/2' : 'top-4 right-4'} z-50 space-y-3 pointer-events-none`}>
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastNotification toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
