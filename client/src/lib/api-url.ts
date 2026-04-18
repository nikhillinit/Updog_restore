function getConfiguredApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';
}

export function resolveApiBaseUrl(hostname: string | null, configuredApiBaseUrl: string): string {
  // Vercel deployments expose frontend assets and API routes from the same host.
  // For previews, forcing an absolute API base points requests at the production
  // apex domain and turns same-origin calls into CORS preflights.
  if (hostname?.endsWith('.vercel.app')) {
    return '';
  }

  return configuredApiBaseUrl;
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl(globalThis.location?.hostname?.toLowerCase() ?? null, getConfiguredApiBaseUrl());
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

export function joinApiBaseUrl(path: string, apiBaseUrl: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${normalizePath(path)}`;
}

export function withApiBase(path: string): string {
  return joinApiBaseUrl(path, getApiBaseUrl());
}
