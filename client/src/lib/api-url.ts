const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

export function withApiBase(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${normalizePath(path)}`;
}
