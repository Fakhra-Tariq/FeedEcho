import React from 'react';
import InlineAlert from './InlineAlert';
import { useHybridAlert } from '../contexts/HybridAlertContext';

const InlineAlertContainer = ({ position = 'top' }) => {
  const { inlineAlerts, removeInlineAlert } = useHybridAlert();

  if (inlineAlerts.length === 0) return null;

  return (
    <div className={`fixed ${position === 'top' ? 'top-4' : 'bottom-4'} left-4 right-4 z-40 space-y-3 pointer-events-none`}>
      {inlineAlerts.map((alert) => (
        <div key={alert.id} className="pointer-events-auto">
          <InlineAlert {...alert} onClose={() => removeInlineAlert(alert.id)} />
        </div>
      ))}
    </div>
  );
};

export default InlineAlertContainer;
