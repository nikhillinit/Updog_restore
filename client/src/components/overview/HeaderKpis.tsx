
import React from 'react';
import type { FundKpis, FundRawData } from '@core/types';
import { selectFundKpis } from '@core/selectors';
const MOCK_RAW: FundRawData = { fundId:'DEMO', committed:100_000_000, capitalCalls:[{date:'2025-01-01',amount:35_000_000}], distributions:[{date:'2025-06-01',amount:5_000_000}], navSeries:[{date:'2025-10-02',value:40_000_000}], investments:[{id:'I1',companyName:'DemoCo',initialAmount:10_000_000,followOns:[22_000_000],nav:35_000_000}], asOf:'2025-10-02' };
const MOCK = selectFundKpis(MOCK_RAW);
type KpiItemProps = { label: string; value: string; delta?: string };
const KpiItem: React.FC<KpiItemProps> = ({ label, value, delta }) => (<div className="card kpi"><div className="label">{label}</div><div className="value">{value}</div>{delta ? <div className="delta">{delta}</div> : null}</div>);
export const HeaderKpis: React.FC<{ data?: FundKpis }> = ({ data }) => {
  const kpis = data ?? MOCK;
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}%`);
  const cur = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (<section className="kpi-grid" aria-label="Fund KPIs">
    <KpiItem label="Committed" value={cur(kpis.committed)} />
    <KpiItem label="Called" value={cur(kpis.called)} />
    <KpiItem label="Uncalled" value={cur(kpis.uncalled)} />
    <KpiItem label="Invested" value={cur(kpis.invested)} />
    <KpiItem label="NAV" value={cur(kpis.nav)} />
    <KpiItem label="DPI" value={kpis.dpi.toFixed(2) + 'x'} />
    <KpiItem label="TVPI" value={kpis.tvpi.toFixed(2) + 'x'} />
    <KpiItem label="IRR" value={pct(kpis.irr)} />
  </section>);
};
