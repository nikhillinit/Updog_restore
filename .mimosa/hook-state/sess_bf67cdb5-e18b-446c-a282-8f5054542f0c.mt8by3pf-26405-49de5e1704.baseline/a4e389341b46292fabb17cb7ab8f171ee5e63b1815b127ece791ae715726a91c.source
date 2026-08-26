const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function apiProxyChangeOrigin(target: string): boolean {
  try {
    const hostname = new URL(target).hostname.replace(/^\[|\]$/g, '');
    return !LOOPBACK_HOSTNAMES.has(hostname);
  } catch {
    return true;
  }
}
