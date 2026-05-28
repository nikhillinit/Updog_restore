type MonitoringEnv = Pick<ImportMetaEnv, 'PROD' | 'VITE_SENTRY_DSN'>;

interface VitalsModule {
  startVitals: () => void;
}

export interface MonitoringBootstrapOptions {
  env?: MonitoringEnv;
  loadMonitoring?: () => Promise<unknown>;
  loadVitals?: () => Promise<VitalsModule>;
  scheduleIdle?: (callback: () => void) => void;
  warn?: (...data: unknown[]) => void;
}

function scheduleWhenIdle(callback: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback);
    return;
  }

  window.setTimeout(callback, 1);
}

export function bootstrapMonitoring(options: MonitoringBootstrapOptions = {}) {
  const env = options.env ?? import.meta.env;
  if (!env.PROD) {
    return;
  }

  const warn = options.warn ?? console.warn;
  const loadMonitoring = options.loadMonitoring ?? (() => import('./index'));
  const loadVitals = options.loadVitals;
  const scheduleIdle = options.scheduleIdle ?? scheduleWhenIdle;

  if (env.VITE_SENTRY_DSN) {
    loadMonitoring().catch((error) => {
      warn('Failed to load Sentry:', error);
    });
  }

  if (loadVitals) {
    scheduleIdle(() => {
      void loadVitals().then(({ startVitals }) => startVitals());
    });
  }
}
