import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const HybridAlertContext = createContext();

/** Global toast API (ToastNotification + ToastContainer) for use outside React hooks, e.g. AuthContext */
let globalToastHandlers = null;

const invokeToast = (type, message, options = {}) => {
  if (!globalToastHandlers) return null;
  return globalToastHandlers[type](message, options);
};

export const appToast = {
  success: (message, options) => invokeToast('success', message, options),
  error: (message, options) => invokeToast('error', message, options),
  warning: (message, options) => invokeToast('warning', message, options),
  info: (message, options) => invokeToast('info', message, options),
};

export const useHybridAlert = () => {
  const context = useContext(HybridAlertContext);
  if (!context) {
    throw new Error('useHybridAlert must be used within a HybridAlertProvider');
  }
  return context;
};

export const HybridAlertProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [inlineAlerts, setInlineAlerts] = useState([]);
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false,
    closeOnConfirm: true,
    closeOnBackdrop: true,
    onConfirm: null
  });

  // Toast functions
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      type: 'info',
      duration: 3000,
      ...toast,
    };
    
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  useEffect(() => {
    globalToastHandlers = {
      success: (message, options = {}) => addToast({ type: 'success', message, ...options }),
      error: (message, options = {}) => addToast({ type: 'error', message, duration: 5000, ...options }),
      warning: (message, options = {}) => addToast({ type: 'warning', message, ...options }),
      info: (message, options = {}) => addToast({ type: 'info', message, ...options }),
    };
    return () => {
      globalToastHandlers = null;
    };
  }, [addToast]);

  // Inline Alert functions
  const removeInlineAlert = useCallback((id) => {
    setInlineAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const addInlineAlert = useCallback((alert) => {
    const id = Date.now() + Math.random();
    const newAlert = {
      id,
      type: 'info',
      duration: 4000,
      fullWidth: false,
      showIcon: true,
      dismissible: true,
      ...alert,
    };
    
    setInlineAlerts((prev) => [...prev, newAlert]);
    return id;
  }, []);

  // Modal functions
  const showModal = useCallback((config) => {
    return new Promise((resolve) => {
      setModalConfig({
        isOpen: true,
        type: 'info',
        title: '',
        message: '',
        confirmText: 'OK',
        cancelText: 'Cancel',
        showCancel: false,
        closeOnConfirm: true,
        closeOnBackdrop: true,
        onConfirm: () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        ...config
      });
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Combined API
  const alert = {
    // Toast notifications (for quick feedback)
    toast: {
      success: (message, options = {}) => {
        return addToast({ type: 'success', message, ...options });
      },
      error: (message, options = {}) => {
        return addToast({ type: 'error', message, duration: 5000, ...options });
      },
      warning: (message, options = {}) => {
        return addToast({ type: 'warning', message, ...options });
      },
      info: (message, options = {}) => {
        return addToast({ type: 'info', message, ...options });
      },
      dismiss: (id) => removeToast(id),
      dismissAll: () => setToasts([])
    },

    // Inline alerts (for form validation and warnings)
    inline: {
      success: (message, options = {}) => {
        return addInlineAlert({ type: 'success', message, ...options });
      },
      error: (message, options = {}) => {
        return addInlineAlert({ type: 'error', message, duration: 0, ...options });
      },
      warning: (message, options = {}) => {
        return addInlineAlert({ type: 'warning', message, ...options });
      },
      info: (message, options = {}) => {
        return addInlineAlert({ type: 'info', message, ...options });
      },
      dismiss: (id) => removeInlineAlert(id),
      dismissAll: () => setInlineAlerts([])
    },

    // Custom modals (for confirmations and critical errors)
    modal: {
      success: (message, options = {}) => {
        return showModal({
          type: 'success',
          message,
          title: 'Success',
          ...options
        });
      },
      error: (message, options = {}) => {
        return showModal({
          type: 'error',
          message,
          title: 'Error',
          ...options
        });
      },
      warning: (message, options = {}) => {
        return showModal({
          type: 'warning',
          message,
          title: 'Warning',
          ...options
        });
      },
      info: (message, options = {}) => {
        return showModal({
          type: 'info',
          message,
          title: 'Information',
          ...options
        });
      },
      confirm: (message, options = {}) => {
        return showModal({
          type: 'warning',
          message,
          title: 'Confirm Action',
          showCancel: true,
          confirmText: 'Confirm',
          ...options
        });
      },
      custom: (config) => {
        return showModal(config);
      },
      close: closeModal
    },

    // Legacy methods (for backward compatibility)
    success: (message, options = {}) => {
      return addToast({ type: 'success', message, ...options });
    },
    error: (message, options = {}) => {
      return addToast({ type: 'error', message, duration: 5000, ...options });
    },
    warning: (message, options = {}) => {
      return addToast({ type: 'warning', message, ...options });
    },
    info: (message, options = {}) => {
      return addToast({ type: 'info', message, ...options });
    },
    confirm: (message, options = {}) => {
      return showModal({
        type: 'warning',
        message,
        title: 'Confirm Action',
        showCancel: true,
        confirmText: 'Confirm',
        ...options
      });
    }
  };

  const value = {
    toasts,
    inlineAlerts,
    modalConfig,
    removeToast,
    removeInlineAlert,
    closeModal,
    alert
  };

  return (
    <HybridAlertContext.Provider value={value}>
      {children}
    </HybridAlertContext.Provider>
  );
};

export default HybridAlertProvider;
