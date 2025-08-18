export function gate(name: string, fallback=false): boolean {
  const key = `FLAG_${name.toUpperCase().replace(/[^A-Z0-9_]/g,'_')}`;
  const val = process.env[key];
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}
