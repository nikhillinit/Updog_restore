import React from 'react';

// TODO: Move to proper API types file when scenario API is implemented
type ScenarioRow = {
  name: string;
  result_summary_json?: {
    TVPI?: string | number;
  };
};

export function ScenarioCompareChart({ scenarios }: { scenarios: ScenarioRow[] }) {
  const data = scenarios.map((s) => {
    const tvpiRaw = String(s.result_summary_json?.TVPI ?? '').replace(/[×x]/g, '').trim();
    const tvpi = Number(tvpiRaw);
    return { name: s.name.replace(/[📊🚀⚠️]/g, '').trim(), tvpi: Number.isFinite(tvpi) ? tvpi : 0 };
  });
  const max = Math.max(1, ...data.map((d) => d.tvpi));

  return (
    <div style={{ marginTop: 12, background:'#f8fafc', border:'1px solid #eef2f7', borderRadius:8, padding:10 }}>
      <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>TVPI Comparison</div>
      {data.map((d, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <div style={{ width:120, fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name}</div>
          <div style={{ flex:1, height:22, background:'#e5e7eb', borderRadius:6, position:'relative' }}>
            <div style={{
              width: `${(d.tvpi / max) * 100}%`, height:'100%', background:'#2563eb',
              borderRadius:6, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8, color:'#fff', fontSize:12, fontWeight:700
            }}>
              {d.tvpi.toFixed(2)}×
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
