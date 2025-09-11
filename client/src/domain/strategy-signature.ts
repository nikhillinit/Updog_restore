import { sortById } from '@/utils/state-utils';

// Portable base64 (Node + browser)
function toBase64Url(s: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64url');
  }
  // browsers without base64url
  // eslint-disable-next-line no-undef
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Small, stable hash (FNV-1a 32-bit)
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  // unsigned
  return (h >>> 0).toString(16);
}

export function signatureForStrategy(input: any): string {
  const norm = {
    stages: (input?.stages ?? []).map((s: any) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      graduate: Number.isNaN(s.graduate) ? 0 : Math.round((s.graduate ?? 0) * 1000) / 1000,
      exit: Number.isNaN(s.exit) ? 0 : Math.round((s.exit ?? 0) * 1000) / 1000,
      months: s.months ?? 12,
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    sectorProfiles: (input?.sectorProfiles ?? []).slice().sort(sortById),
    allocations: (input?.allocations ?? []).slice().sort(sortById),
  };
  // JSON is fine after normalization; hash for compactness
  const json = JSON.stringify(norm);
  return `v1:${fnv1a(json)}:${toBase64Url(json).slice(0, 16)}`;
}