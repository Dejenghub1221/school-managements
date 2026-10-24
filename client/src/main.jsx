import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { LangProvider } from './context/LangContext.jsx';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Application Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg, #f3f4f1)' }}>
          <div style={{ maxWidth: 480, width: '100%', padding: 24, borderRadius: 12, background: 'var(--sf, #fff)', border: '1px solid var(--bd, #dde2de)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 10px', color: 'var(--dg, #b42318)' }}>Something went wrong</h2>
            <p style={{ margin: '0 0 16px', color: 'var(--mu, #5d6a66)', fontSize: 14 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              type="button"
              className="btn pr"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <LangProvider>
            <App />
          </LangProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);
