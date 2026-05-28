interface MonitoringEnv {
  readonly PROD: boolean;
  readonly VITE_SENTRY_DSN?: string | boolean;
}

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

function getMonitoringEnv(env?: MonitoringEnv): MonitoringEnv {
  return env ?? import.meta.env;
}

function getMonitoringLoader(loadMonitoring?: () => Promise<unknown>) {
  return loadMonitoring ?? (() => import('./index'));
}

function getWarningLogger(warn?: (...data: unknown[]) => void) {
  return warn ?? console.warn;
}

function getIdleScheduler(scheduleIdle?: (callback: () => void) => void) {
  return scheduleIdle ?? scheduleWhenIdle;
}

function loadSentryWhenConfigured(
  env: MonitoringEnv,
  loadMonitoring: () => Promise<unknown>,
  warn: (...data: unknown[]) => void
) {
  if (env.VITE_SENTRY_DSN) {
    loadMonitoring().catch((error) => {
      warn('Failed to load Sentry:', error);
    });
  }
}

async function startVitals(loadVitalsModule: () => Promise<VitalsModule>) {
  const { startVitals } = await loadVitalsModule();
  startVitals();
}

function scheduleVitalsWhenConfigured(
  loadVitalsModule: (() => Promise<VitalsModule>) | undefined,
  scheduleIdle: (callback: () => void) => void
) {
  if (loadVitalsModule) {
    scheduleIdle(() => {
      void startVitals(loadVitalsModule);
    });
  }
}

export function bootstrapMonitoring(options: MonitoringBootstrapOptions = {}) {
  const env = getMonitoringEnv(options.env);
  if (!env.PROD) {
    return;
  }

  loadSentryWhenConfigured(
    env,
    getMonitoringLoader(options.loadMonitoring),
    getWarningLogger(options.warn)
  );
  scheduleVitalsWhenConfigured(options.loadVitals, getIdleScheduler(options.scheduleIdle));
}
