function hostnameFor(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function shouldUseNodePostgresDriver(connectionString: string): boolean {
  const hostname = hostnameFor(connectionString);
  if (!hostname) {
    return false;
  }

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}
