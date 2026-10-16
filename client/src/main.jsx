import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { LangProvider } from './context/LangContext.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <SettingsProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </SettingsProvider>
    </AuthProvider>
  </BrowserRouter>
);
