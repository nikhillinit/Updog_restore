import { useFundContext } from '@/contexts/FundContext';

export type ScenarioSummary = {
  TVPI?: string | number;
  DPI?: string | number;
  NAV?: string | number;
  IRR?: string | number | null;
};

interface KpiBlock {
  tvpi?: number;
  dpi?: number;
  nav?: number;
  irr?: number;
}

export function useScenarioSummary(): ScenarioSummary {
  const ctx = useFundContext?.() ?? {};
  // Duck-type check for kpis property (may be added by context extensions)
  const k = (ctx as unknown as Record<string, unknown>)['kpis'] as KpiBlock | undefined;
  if (k && (k.tvpi != null || k.dpi != null || k.nav != null || k.irr != null)) {
    return {
      TVPI: formatRatio(k.tvpi),
      DPI: formatRatio(k.dpi),
      NAV: formatMoney(k.nav),
      IRR: formatPct(k.irr),
    };
  }
  const select = (ctx as unknown as Record<string, unknown>)['selectFundKpis'] as
    | (() => KpiBlock | undefined)
    | undefined;
  if (typeof select === 'function') {
    const kp = select();
    return {
      TVPI: formatRatio(kp?.tvpi),
      DPI: formatRatio(kp?.dpi),
      NAV: formatMoney(kp?.nav),
      IRR: formatPct(kp?.irr),
    };
  }
  // Demo-safe placeholder to keep save flow working
  return { TVPI: '—', DPI: '—', NAV: '—', IRR: '—' };
}

function formatRatio(x?: number) {
  return x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(2)}×`;
}
function formatMoney(x?: number) {
  return x == null || !Number.isFinite(x) ? '—' : `$${(x / 1e6).toFixed(1)}M`;
}
function formatPct(x?: number | null) {
  return x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`;
}
