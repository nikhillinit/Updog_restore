/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/brand-tokens.css"; // Phase 1: Brand consistency (Inter/Poppins, neutral palette)
import { installFetchTap } from "./debug/fetch-tap";
// Vitals loaded dynamically in production

// Install fetch interceptor for debugging
installFetchTap();

// Emergency rollback failsafe - provides backdoor even if env vars are stuck
function checkEmergencyRollback() {
  try {
    // Check URL parameter first (highest priority)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams['get']('emergency_rollback') === 'true') {
      (window as any).__FORCE_LEGACY_STATE = true;
      console.warn('🚨 Emergency rollback activated via URL parameter');
      return;
    }

    // Check localStorage (persistent emergency rollback)
    if (localStorage.getItem('emergency_rollback') === 'true') {
      (window as any).__FORCE_LEGACY_STATE = true;
      console.warn('🚨 Emergency rollback activated via localStorage');
      
      // Show user-friendly notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div style="position: fixed; top: 10px; right: 10px; z-index: 9999; background: #ff4444; color: white; padding: 12px 16px; border-radius: 4px; font-family: monospace; max-width: 300px;">
          🚨 Emergency Mode Active<br>
          <small>Using legacy state system. Contact support if this persists.</small>
        </div>
      `;
      document.body.appendChild(notification);
      
      // Auto-remove notification after 10 seconds
      setTimeout(() => notification.remove(), 10000);
    }
  } catch (e) {
    console.warn('Emergency rollback check failed:', e);
  }
}

// Check for emergency rollback before app initialization
checkEmergencyRollback();

// Initialize monitoring in production
if (import.meta.env.PROD) {
  // Code-split Sentry - only load when DSN is configured
  if (import.meta.env.VITE_SENTRY_DSN) {
    import('./sentry').then(({ initSentry }) => {
      initSentry();
    }).catch(err => {
      console.warn('Failed to load Sentry:', err);
    });
  }
  // Start Web Vitals collection after app mounts
  requestIdleCallback(() => {
    import('./vitals').then(({ startVitals }) => startVitals());
  });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
} else {
  console.error("Root element not found");
}

