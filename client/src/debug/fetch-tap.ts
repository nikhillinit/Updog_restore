import { logger } from '@/lib/logger';

type FetchTapWindow = Window & {
  __fetch_tap_installed?: boolean;
};

function getFetchTapWindow(): FetchTapWindow {
  return window as FetchTapWindow;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function installFetchTap() {
  if (import.meta.env['VITE_WIZARD_DEBUG'] !== '1' || typeof window === 'undefined') return;

  const fetchTapWindow = getFetchTapWindow();
  if (fetchTapWindow.__fetch_tap_installed) return;
  fetchTapWindow.__fetch_tap_installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    const method = init?.method ?? 'GET';
    const startedAt = performance.now();

    try {
      const response = await originalFetch(input, init);
      logger.debug('FETCH', {
        method,
        url,
        status: response.status,
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
      });
      return response;
    } catch (error: unknown) {
      logger.warn('FETCH NETWORK ERROR', {
        method,
        url,
        error: getErrorMessage(error),
      });
      throw error;
    }
  };
}
