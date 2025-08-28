/**
 * No-op module for Sentry when it's disabled at build time
 * This allows complete exclusion from the bundle
 */

export const init = () => {};
export const captureException = () => '';
export const captureMessage = () => '';
export const addBreadcrumb = () => {};
export const withScope = (fn: any) => fn({ 
  setMeasurement: () => {},
  setTag: () => {},
  setContext: () => {},
  setUser: () => {},
  setLevel: () => {},
});
export const setUser = () => {};
export const setTag = () => {};
export const setContext = () => {};
export const configureScope = (fn: any) => fn({ 
  setMeasurement: () => {},
  setTag: () => {},
  setContext: () => {},
  setUser: () => {},
  setLevel: () => {},
});
export const browserTracingIntegration = () => ({});
export const replayIntegration = () => ({});

// Export as both named and default
export default { 
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
  replayIntegration
};