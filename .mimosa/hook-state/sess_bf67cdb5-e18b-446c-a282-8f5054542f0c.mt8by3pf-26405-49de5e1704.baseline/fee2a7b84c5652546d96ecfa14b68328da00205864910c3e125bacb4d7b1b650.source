function getConfiguredApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';
}

function tryParseOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(
  currentOrigin: string | null,
  currentHostname: string | null,
  configuredApiBaseUrl: string
): string {
  if (!configuredApiBaseUrl) {
    return '';
  }

  const configuredApiOrigin = tryParseOrigin(configuredApiBaseUrl);
  if (!configuredApiOrigin) {
    return configuredApiBaseUrl;
  }

  if (currentOrigin && configuredApiOrigin === currentOrigin.toLowerCase()) {
    return '';
  }

  // Vercel deployments expose frontend assets and API routes from the same host.
  // For previews, forcing an absolute API base points requests at the production
  // apex domain and turns same-origin calls into CORS preflights.
  if (currentHostname?.endsWith('.vercel.app')) {
    return '';
  }

  return configuredApiBaseUrl;
}

export function getApiBaseUrl(): string {
  const currentOrigin = globalThis.location?.origin?.toLowerCase() ?? null;
  const currentHostname = globalThis.location?.hostname?.toLowerCase() ?? null;

  return resolveApiBaseUrl(currentOrigin, currentHostname, getConfiguredApiBaseUrl());
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
