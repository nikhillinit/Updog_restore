import React from 'react';
import { setDemoPersona, getDemoPersona, resetDemo, isDemoMode, type Persona } from '../core/demo/persona';

export function DemoToolbar() {
  if (!isDemoMode()) return null;
  const [visible, setVisible] = React.useState(true);
  const [role, setRole] = React.useState<Persona>(getDemoPersona() || 'GP');
  const [flags, setFlags] = React.useState({
    NEW_IA: localStorage.getItem('FF_NEW_IA') === 'true',
    ENABLE_SELECTOR_KPIS: localStorage.getItem('FF_ENABLE_SELECTOR_KPIS') === 'true',
  });

  React.useEffect(() => { if (visible) localStorage.setItem('DEMO_TOOLBAR','1'); }, [visible]);

  const toggleFlag = (k: keyof typeof flags) => {
    const next = !flags[k];
    setFlags({ ...flags, [k]: next });
    localStorage.setItem(`FF_${k}`, String(next));
    location.reload();
  };
  const onPersona = (p: Persona) => { setRole(p); setDemoPersona(p); location.reload(); };

  return (
    <div style={{
      position:'fixed', right:16, bottom:16, background:'#111', color:'#fff',
      padding:12, borderRadius:8, zIndex:9999, minWidth:260
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <strong>Demo</strong>
        <button onClick={() => setVisible(false)} style={{ color:'#fff', opacity:.7 }}>×</button>
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ fontSize:12, opacity:.7, marginBottom:4 }}>Persona</div>
        {(['GP','LP','Admin'] as Persona[]).map((p) => (
          <button key={p} onClick={() => onPersona(p)}
                  style={{
                    marginRight:6, marginBottom:6, padding:'6px 10px',
                    borderRadius:6, border:'1px solid #444',
                    background: role===p ? '#2563eb' : '#222', color:'#fff'
                  }}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:12, opacity:.7, marginBottom:4 }}>Flags</div>
        <label style={{ display:'block', marginBottom:6 }}>
          <input type="checkbox" checked={flags.NEW_IA} onChange={() => toggleFlag('NEW_IA')} /> NEW_IA
        </label>
        <label style={{ display:'block' }}>
          <input type="checkbox" checked={flags.ENABLE_SELECTOR_KPIS} onChange={() => toggleFlag('ENABLE_SELECTOR_KPIS')} /> KPIs
        </label>
      </div>
      <div style={{ marginTop:10, borderTop:'1px solid #333', paddingTop:10 }}>
        <button onClick={resetDemo} style={{ padding:'6px 10px', background:'#ef4444', color:'#fff', borderRadius:6, border:'1px solid #b91c1c' }}>
          Reset Demo
        </button>
      </div>
    </div>
  );
}
