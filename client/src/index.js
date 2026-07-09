import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { HybridAlertProvider } from './contexts/HybridAlertContext';
import { TeacherRealtimeSyncProvider } from './contexts/TeacherRealtimeSyncContext';
import { TeacherDataProvider } from './contexts/TeacherDataContext';

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
