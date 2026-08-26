function toAbsoluteBaseUrl(rawBaseUrl: string): string | null {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed || trimmed === '/' || trimmed === '//' || trimmed.startsWith('//')) {
    return null;
  }

  const candidate =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    return parsed.hostname ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function resolveIntegrationBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicitBaseUrl = toAbsoluteBaseUrl(env.BASE_URL ?? '');
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const port = (env.PORT ?? '').trim();
  if (/^\d+$/.test(port) && Number(port) > 0) {
    return `http://127.0.0.1:${port}`;
  }

  return 'http://127.0.0.1:3000';
}

export function resolveIntegrationUrl(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return new URL(pathname, resolveIntegrationBaseUrl(env)).toString();
}
