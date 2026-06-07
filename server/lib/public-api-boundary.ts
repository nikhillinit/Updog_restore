const ALWAYS_PUBLIC_EXACT = new Set([
  '/healthz',
  '/readyz',
  '/health',
  '/health/ready',
  '/health/live',
  '/flags',
  '/flags/status',
]);

function normalizeMountRelativePath(mountRelativePath: string): string {
  if (mountRelativePath.endsWith('/') && mountRelativePath.length > 1) {
    return mountRelativePath.slice(0, -1);
  }

  return mountRelativePath;
}

export function isPublicApiPath(method: string, mountRelativePath: string): boolean {
  const normalizedPath = normalizeMountRelativePath(mountRelativePath);
  const normalizedMethod = method.toUpperCase();

  if (ALWAYS_PUBLIC_EXACT.has(normalizedPath)) {
    return true;
  }

  if (normalizedMethod === 'GET' && /^\/public\/shares\/[^/]+$/.test(normalizedPath)) {
    return true;
  }

  if (normalizedMethod === 'POST' && /^\/public\/shares\/[^/]+\/verify$/.test(normalizedPath)) {
    return true;
  }

  return false;
}
