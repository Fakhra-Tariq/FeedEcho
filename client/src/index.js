import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { HybridAlertProvider } from './contexts/HybridAlertContext';
import { TeacherRealtimeSyncProvider } from './contexts/TeacherRealtimeSyncContext';
import { TeacherDataProvider } from './contexts/TeacherDataContext';
import { wakeBackend } from './services/api';

// Wake sleeping Render free-tier backend as early as possible (non-blocking).
wakeBackend();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HybridAlertProvider>
      <AuthProvider>
        <TeacherRealtimeSyncProvider>
          <TeacherDataProvider>
            <App />
          </TeacherDataProvider>
        </TeacherRealtimeSyncProvider>
      </AuthProvider>
    </HybridAlertProvider>
  </React.StrictMode>
);
