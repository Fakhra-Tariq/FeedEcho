import React from 'react';
import CustomModal from './CustomModal';
import { useHybridAlert } from '../contexts/HybridAlertContext';

const CustomModalContainer = () => {
  const { modalConfig, closeModal } = useHybridAlert();

  return (
    <CustomModal
      isOpen={modalConfig.isOpen}
      onClose={closeModal}
      type={modalConfig.type}
      title={modalConfig.title}
      message={modalConfig.message}
      confirmText={modalConfig.confirmText}
      cancelText={modalConfig.cancelText}
      showCancel={modalConfig.showCancel}
      closeOnConfirm={modalConfig.closeOnConfirm}
      closeOnBackdrop={modalConfig.closeOnBackdrop}
      onConfirm={modalConfig.onConfirm}
    />
  );
};

export default CustomModalContainer;
