export function initRUM({ tier='free', ring='control' } = {}) {
  window.__UPDOG_RUM__ = { tier, ring };
  console.log('[RUM] initialized', { tier, ring });
}
