import { useState, type CSSProperties } from 'react';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { scenarios, sliders as initialSliders } from '@/components/presson-v2/mock';

type Mode = 'sliders' | 'direct' | 'formula';
type BenchStatTone = 'muted' | 'positive';

type BenchStatProps = {
  label: string;
  value: string;
  unit: string;
  sub: string;
  subTone?: BenchStatTone;
};

function BenchStat({ label, value, unit, sub, subTone = 'muted' }: BenchStatProps) {
  return (
    <div>
      <div className="pv2-bench-hero-k">{label}</div>
      <div className="pv2-bench-stat-v">
        {value}
        <span className="unit">{unit}</span>
      </div>
      <div className={`pv2-bench-stat-sub${subTone === 'positive' ? ' pos' : ''}`}>{sub}</div>
    </div>
  );
}

/**
 * Scenarios · Press On v2 modeling bench.
 *
 * Aesthetic: engineering bench / control panel.
 * Mode switcher commits to the title bar; right rail "live deltas" is dominated
 * by one giant outcome number that updates as the sliders move.
 */
export default function ScenariosV2() {
  const [mode, setMode] = useState<Mode>('sliders');
  const [activeScenario, setActiveScenario] = useState('target-1b');
  const [vals, setVals] = useState(initialSliders.map((s) => s.value));

  // Derived: a back-of-envelope exit value computation that the sliders move
  // around, just enough to make the giant number feel alive.
  const fundSize = vals[0]; // 50–250
  const reserveRatio = vals[2]; // 30–80
  const targetReturn = vals[7]; // 1.5–5
  const grad = (vals[4] + vals[5] + vals[6]) / 3; // avg graduation
  const exitNeeded = Math.round(
    (fundSize * 1_000_000 * targetReturn) / Math.pow(grad / 100, 3) / 0.18 / 17
  );
  const fees = (fundSize * (vals[3] / 100) * 10).toFixed(1);
  const reserves = ((fundSize * reserveRatio) / 100).toFixed(1);
  const initialCap = (fundSize - parseFloat(reserves) - parseFloat(fees)).toFixed(1);

  return (
    <AppShell>
      <div className="pv2-bench">
        <header className="pv2-bench-mast">
          <div>
            <div className="pv2-bench-eyebrow">
              Scenarios · edited 4 min ago ·{' '}
              <b>{scenarios.find((s) => s.id === activeScenario)?.name}</b>
            </div>
            <h1 className="pv2-bench-h1">
              Three modes, <em>one scenario.</em>
            </h1>
          </div>
          <div className="pv2-modeswitch">
            <button className={mode === 'sliders' ? 'on' : ''} onClick={() => setMode('sliders')}>
              Sliders
            </button>
            <button className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}>
              Direct
            </button>
            <button className={mode === 'formula' ? 'on' : ''} onClick={() => setMode('formula')}>
              Formula
            </button>
          </div>
        </header>

        {/* Compare strip */}
        <div className="pv2-comparestrip">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pv2-compare${activeScenario === s.id ? ' on' : ''}`}
              onClick={() => setActiveScenario(s.id)}
              style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
            >
              <div className="pv2-compare-k">{activeScenario === s.id ? '▸ ACTIVE' : 'PIN'}</div>
              <div className="pv2-compare-name">{s.name}</div>
              <div className="pv2-compare-mini">
                EXIT MOIC <b>{s.moic}</b> · TVPI <b>{s.tvpi}</b> · IRR <b>{s.irr}</b>
              </div>
            </button>
          ))}
          <div className="pv2-compare-add">+ PIN</div>
        </div>

        <div className="pv2-bench-body">
          {/* Left: controls */}
          <section className="pv2-bench-controls">
            <div className="pv2-bench-h2">
              <span>Fund construction</span>
              <span>{initialSliders.length} parameters</span>
            </div>
            {initialSliders.map((s, i) => {
              const range = s.max - s.min;
              const pct = ((vals[i] - s.min) / range) * 100;
              const sliderId = `pv2-slider-${i}`;
              const displayValue = `${s.prefix}${s.step ? vals[i].toFixed(1) : vals[i]}${s.unit}`;
              return (
                <div key={s.label} className="pv2-slider">
                  <label className="pv2-slider-label" htmlFor={sliderId}>
                    {s.label}
                  </label>
                  <input
                    id={sliderId}
                    type="range"
                    className="pv2-slider-input"
                    min={s.min}
                    max={s.max}
                    step={s.step ?? 1}
                    value={vals[i]}
                    aria-valuetext={displayValue}
                    style={{ '--pv2-pct': `${pct}%` } as CSSProperties}
                    onChange={(e) => {
                      const nextValue = Number(e.target.value);
                      setVals((prev) => {
                        const next = [...prev];
                        next[i] = nextValue;
                        return next;
                      });
                    }}
                  />
                  <span className="pv2-slider-val">
                    {s.prefix}
                    {s.step ? vals[i].toFixed(1) : vals[i]}
                    <span className="unit">{s.unit}</span>
                  </span>
                </div>
              );
            })}
            <div className="pv2-bench-h2" style={{ marginTop: 28, color: 'var(--pv2-mute)' }}>
              <span>Active mode</span>
              <span style={{ color: 'var(--pv2-ink)' }}>{mode.toUpperCase()}</span>
            </div>
          </section>

          {/* Right: live deltas */}
          <section className="pv2-bench-deltas">
            <div className="pv2-bench-hero">
              <div className="pv2-bench-hero-k">
                <span>EXIT VALUE NEEDED</span>
                <span className="live">● LIVE</span>
              </div>
              <div className="pv2-bench-hero-v">
                ${(exitNeeded / 1_000_000).toFixed(2)}
                <span style={{ fontSize: 28, color: 'var(--pv2-mute)', marginLeft: 6 }}>M</span>
              </div>
              <div className="pv2-bench-hero-sub">
                AVG PER COMPANY · TO RETURN ${fundSize}M FUND AT {targetReturn.toFixed(1)}×
              </div>
            </div>

            <div className="pv2-bench-grid">
              <BenchStat
                label="INITIAL CAPITAL"
                value={`$${initialCap}`}
                unit="M"
                sub={`${((parseFloat(initialCap) / fundSize) * 100).toFixed(0)}% of fund`}
              />
              <BenchStat
                label="RESERVES"
                value={`$${reserves}`}
                unit="M"
                sub={`${reserveRatio}% follow-on`}
                subTone="positive"
              />
              <BenchStat
                label="FEES"
                value={`$${fees}`}
                unit="M"
                sub={`${vals[3].toFixed(1)}% × 10y`}
              />
            </div>

            <div className="pv2-formula">
              <div className="pv2-formula-k">
                <span>FORMULA</span>
                <span>⌘E to edit · mode: {mode.toUpperCase()}</span>
              </div>
              exit_value = fund_size × target_return ÷ (graduation_rate³ × ownership_at_exit) − fees
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Btn>Share link</Btn>
              <Btn>Fork</Btn>
              <Btn primary kbd="⌘S">
                Save
              </Btn>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
