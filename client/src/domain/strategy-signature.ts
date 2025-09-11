import { sortById } from '@/utils/state-utils';

export function signatureForStrategy(input: {
  stages: Array<{ 
    id: string; 
    name: string; 
    graduationRate?: number; 
    graduate?: number; 
    exitRate?: number; 
    exit?: number; 
    months?: number; 
  }>;
  sectorProfiles: Array<{ 
    id: string; 
    name: string; 
    targetPercentage: number; 
  }>;
  allocations: Array<{ 
    id: string; 
    category: string; 
    percentage: number; 
  }>;
}): string {
  const st = input.stages.slice().sort(sortById).map(s => [
    s.id, 
    s.name, 
    norm(s.graduationRate ?? s.graduate), 
    norm(s.exitRate ?? s.exit), 
    s.months ?? 12
  ]).join('|');

  const sp = input.sectorProfiles.slice().sort(sortById).map(p => [
    p.id, 
    p.name, 
    norm(p.targetPercentage)
  ]).join('|');

  const al = input.allocations.slice().sort(sortById).map(a => [
    a.id, 
    a.category, 
    norm(a.percentage)
  ]).join('|');

  return `st:${st}#sp:${sp}#al:${al}`;
}

function norm(n: any): string {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 'NaN';      // stable NaN representation
  return (Math.round(x * 1000) / 1000).toString(); // trim float jitter to 3 decimals
}