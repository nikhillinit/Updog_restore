/**
 * No-op module for Sentry when it's disabled at build time
 * This allows complete exclusion from the bundle
 */

export interface NoopSentryUser {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface NoopSentryContext {
  [key: string]: unknown;
}

export interface NoopSentryBreadcrumb {
  message?: string;
  category?: string;
  level?: string;
  [key: string]: unknown;
}

export interface NoopSentryScope {
  setMeasurement: (_key: string, _value: number) => void;
  setTag: (_key: string, _value: string) => void;
  setContext: (_key: string, _value: NoopSentryContext) => void;
  setUser: (_user: NoopSentryUser) => void;
  setLevel: (_level: string) => void;
}

export interface NoopReplayOptions {
  maskAllText?: boolean;
  blockAllMedia?: boolean;
  [key: string]: unknown;
}

type NoopScopeCallback = (scope: NoopSentryScope) => void;

const noopScope: NoopSentryScope = {
  setMeasurement: () => {},
  setTag: () => {},
  setContext: () => {},
  setUser: () => {},
  setLevel: () => {},
};

const createNoopIntegration = (): Record<string, never> => ({});

export const init = (): void => {};
export const captureException = (): string => '';
export const captureMessage = (): string => '';
export const addBreadcrumb = (_breadcrumb?: NoopSentryBreadcrumb): void => {};
export const withScope = (callback: NoopScopeCallback): void => callback(noopScope);
export const setUser = (_user?: NoopSentryUser): void => {};
export const setTag = (_key?: string, _value?: string): void => {};
export const setContext = (_key?: string, _value?: NoopSentryContext): void => {};
export const configureScope = (callback: NoopScopeCallback): void => callback(noopScope);
export const browserTracingIntegration = (): Record<string, never> => createNoopIntegration();
export const replayIntegration = (
  _options?: NoopReplayOptions
): Record<string, never> => createNoopIntegration();

const noopMonitoring = {
  init,
  captureException,
  captureMessage,
  addBreadcrumb,
  withScope,
  setUser,
  setTag,
  setContext,
  configureScope,
  browserTracingIntegration,
  replayIntegration,
};

// Export as both named and default
export default noopMonitoring;
