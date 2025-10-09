export function installFetchTap() {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env['VITE_WIZARD_DEBUG'] !== '1') return;
  if ((window as any).__fetch_tap_installed) return;
  (window as any).__fetch_tap_installed = true;

  const orig = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const t0 = performance.now();
    try {
      const res = await orig(input, init);
      console.log(`[FETCH] ${init?.method ?? 'GET'} ${url} -> ${res.status} in ${(performance.now()-t0).toFixed(1)}ms`);
      return res;
    } catch (e) {
      console.warn(`[FETCH] ${init?.method ?? 'GET'} ${url} -> NETWORK ERROR`, e);
      throw e;
    }
  };
}


