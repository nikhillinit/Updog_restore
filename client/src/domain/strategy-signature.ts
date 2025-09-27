import { sortById } from '@/utils/state-utils';

// Portable base64url for Node + browser
function toBase64Url(s: string): string {
  // Node
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    // Node 18+ supports 'base64url'
    try {
      return Buffer.from(s, 'utf8').toString('base64url');
    } catch {
      const b64 = Buffer.from(s, 'utf8').toString('base64');
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
  }
  // Browser fallback
  // eslint-disable-next-line no-undef
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Small, stable FNV-1a 32-bit
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

// Keep the previous "trim float jitter to 3 decimals" idea.
// Return a string 'NaN' for non-finite inputs so JSON is stable.
function normNum(n: unknown): number | 'NaN' {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 'NaN';
  return Math.round(x * 1000) / 1000;
}

type StageIn = {
  id: string;
  name?: string;
  graduationRate?: number;
  graduate?: number;
  exitRate?: number;
  exit?: number;
  months?: number;
};

type SectorProfileIn = {
  id: string;
  name?: string;
  targetPercentage: number;
};

type AllocationIn = {
  id: string;
  category?: string;
  percentage: number;
};

type StrategyInput = {
  stages: StageIn[];
  sectorProfiles: SectorProfileIn[];
  allocations: AllocationIn[];
};

export function signatureForStrategy(input: StrategyInput): string {
  const stages = (input?.stages ?? [])
    .slice()
    .sort(sortById)
    .map((s: any) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      // Support either field name, normalize to a single one
      graduate: normNum(s.graduationRate ?? s.graduate),
      exit: normNum(s.exitRate ?? s.exit),
      months: s.months ?? 12,
    }));

  const sectorProfiles = (input?.sectorProfiles ?? [])
    .slice()
    .sort(sortById)
    .map((p: any) => ({
      id: p.id ?? '',
      name: p.name ?? '',
      targetPercentage: normNum(p.targetPercentage),
    }));

  const allocations = (input?.allocations ?? [])
    .slice()
    .sort(sortById)
    .map((a: any) => ({
      id: a.id ?? '',
      category: a.category ?? '',
      percentage: normNum(a.percentage),
    }));

  const json = JSON.stringify({ stages, sectorProfiles, allocations });
  return `v1:${fnv1a(json)}:${toBase64Url(json).slice(0, 16)}`;
}