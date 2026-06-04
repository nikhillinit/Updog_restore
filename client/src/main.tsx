import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/brand-tokens.css'; // Phase 1: Brand consistency (Inter/Poppins, neutral palette)
import { installFetchTap } from './debug/fetch-tap';
import { checkEmergencyRollback } from './debug/emergency-rollback';
import { bootstrapMonitoring } from './monitoring/bootstrap';

if (import.meta.env.DEV) {
  installFetchTap();
}

checkEmergencyRollback();
bootstrapMonitoring({
  loadVitals: () => import('./vitals'),
});

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    import.meta.env.DEV ? (
      <StrictMode>
        <App />
      </StrictMode>
    ) : (
      <App />
    )
  );
} else {
  console.error('Root element not found');
}
