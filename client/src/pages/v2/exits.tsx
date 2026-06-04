import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { exitCases } from '@/components/presson-v2/mock';
import { presson } from '@/theme/presson.tokens';

/**
 * Exits · Press On v2 cinema.
 *
 * Aesthetic: dark room / projection screen.
 * The only dark surface in the v2 system. Three cases (Down / Base / Up) as
 * columns, with the base case spot-lit in warm beige.
 */
export default function ExitsV2() {
  return (
    <AppShell>
      <div className="pv2-cinema">
        <CinemaMast />
        <CasesGrid />
        <CinemaBottom />
      </div>
    </AppShell>
  );
}

function CinemaMast() {
  return (
    <header className="pv2-cinema-mast">
      <div>
        <div className="pv2-cinema-eyebrow">
          FUND II · 17 PROJECTED EXITS · 3 CASES EACH · WEIGHTED MOIC 3.57×
        </div>
        <h1 className="pv2-cinema-h1">
          Exit cases <em>·</em>
          <br />
          forecast surface.
        </h1>
        <p className="pv2-cinema-sub">
          Probability-weighted 25 / 50 / 25 →{' '}
          <span style={{ color: presson.color.accentOn }}>3.42× TVPI · $599M</span>
        </p>
      </div>
      <div className="pv2-cinema-fig">
        PROJ FUND VALUE · BASE
        <span className="pv2-cinema-fig-v">$535.1M</span>
        <div style={{ marginTop: 12, color: 'var(--pv2-warm)' }}>▲ +$12.4M wk</div>
        <div className="pv2-cinema-actions">
          <Btn>Sort · Exit MOIC</Btn>
          <Btn primary>Activate selected</Btn>
        </div>
      </div>
    </header>
  );
}

function CasesGrid() {
  return (
    <div className="pv2-cases">
      <div className="pv2-cases-head">
        <div className="pv2-cinema-eyebrow">Company · 12 of 57</div>
      </div>
      <div className="pv2-cases-head">
        <div className="pv2-cinema-eyebrow" style={{ color: 'var(--pv2-neg)' }}>
          Downside
        </div>
        <h4>Worst credible</h4>
      </div>
      <div className="pv2-cases-head base">
        <div className="pv2-cinema-eyebrow">Base · Active</div>
        <h4>Best estimate</h4>
      </div>
      <div className="pv2-cases-head">
        <div className="pv2-cinema-eyebrow" style={{ color: 'var(--pv2-pos)' }}>
          Upside
        </div>
        <h4>Best credible</h4>
      </div>
      {exitCases.map((c) => (
        <Row key={c.name} c={c} />
      ))}
      <div className="pv2-cases-foot label">PORTFOLIO TOTAL</div>
      <div className="pv2-cases-foot">
        <div className="pv2-cases-foot-moic">1.18×</div>
        <div className="pv2-cases-foot-val">$50.3M</div>
      </div>
      <div className="pv2-cases-foot base">
        <div className="pv2-cases-foot-moic">3.57×</div>
        <div className="pv2-cases-foot-val">$152.2M proceeds</div>
      </div>
      <div className="pv2-cases-foot">
        <div className="pv2-cases-foot-moic">7.84×</div>
        <div className="pv2-cases-foot-val">$334.0M</div>
      </div>
    </div>
  );
}

const FUND_RETURNS = [
  { label: 'DOWNSIDE', value: '$50M · 0.42×', width: '12%', fill: 'neg' as const },
  {
    label: 'BASE · ACTIVE',
    value: '$535.1M · 3.05× TVPI',
    width: '64%',
    fill: 'warm' as const,
    base: true,
  },
  { label: 'UPSIDE', value: '$1.04B · 6.92× TVPI', width: '96%', fill: 'pos' as const },
];

const WEIGHTED_LINE_STYLE = {
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  color: presson.color.highlight,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginTop: 20,
} as const;

function CinemaBottom() {
  return (
    <div className="pv2-cinema-bottom">
      <div className="pv2-cinema-panel">
        <div className="pv2-cinema-panel-h">
          <span>Exit multiple distribution</span>
          <span>BASE CASE · 17 EXITS</span>
        </div>
        <Distribution />
      </div>
      <div className="pv2-cinema-panel">
        <div className="pv2-cinema-panel-h">
          <span>Fund return under each case</span>
          <span>WHAT MAKES IT</span>
        </div>
        {FUND_RETURNS.map((r) => (
          <div key={r.label} className={`pv2-bar-row${r.base ? ' base' : ''}`}>
            <div className="pv2-bar-row-head">
              <span>{r.label}</span>
              <b>{r.value}</b>
            </div>
            <div className="pv2-bar-row-track">
              <div className={`pv2-bar-row-fill ${r.fill}`} style={{ width: r.width }} />
            </div>
          </div>
        ))}
        <div style={WEIGHTED_LINE_STYLE}>
          Probability-weighted · 25% / 50% / 25% →{' '}
          <span style={{ color: presson.color.accentOn }}>3.42× TVPI · $599M</span>
        </div>
      </div>
    </div>
  );
}

function Row({ c }: { c: (typeof exitCases)[number] }) {
  return (
    <>
      <div className="pv2-cases-row label">{c.name}</div>
      <div className="pv2-cases-row">
        <div className="pv2-cases-row-moic">{c.down.moic}</div>
        <div className="pv2-cases-row-val">{c.down.val}</div>
      </div>
      <div className="pv2-cases-row base">
        <div className="pv2-cases-row-moic">{c.base.moic}</div>
        <div className="pv2-cases-row-val">{c.base.val}</div>
      </div>
      <div className="pv2-cases-row">
        <div className="pv2-cases-row-moic">{c.up.moic}</div>
        <div className="pv2-cases-row-val">{c.up.val}</div>
      </div>
    </>
  );
}

function Distribution() {
  const bars = [
    { label: '<1×', pct: 54.5, h: 140 },
    { label: '1–3×', pct: 5.3, h: 14 },
    { label: '3–6×', pct: 5.9, h: 16 },
    { label: '6–10×', pct: 18.2, h: 48 },
    { label: '10–15×', pct: 9.1, h: 24 },
    { label: '15–20×', pct: 0, h: 4 },
    { label: '>20×', pct: 6.0, h: 16 },
  ];
  const colW = 84;
  return (
    <svg viewBox="0 0 720 220" style={{ width: '100%', height: 220 }}>
      <g stroke={presson.color.text}>
        <line x1="0" y1="60" x2="720" y2="60" />
        <line x1="0" y1="120" x2="720" y2="120" />
        <line x1="0" y1="180" x2="720" y2="180" />
      </g>
      {bars.map((b, i) => (
        <g key={b.label}>
          <rect
            x={20 + i * (colW + 6)}
            y={180 - b.h}
            width={colW}
            height={Math.max(b.h, 4)}
            fill={b.pct > 30 ? 'var(--pv2-warm)' : 'rgba(224, 216, 209, 0.65)'}
          />
          <text
            x={20 + i * (colW + 6) + colW / 2}
            y={180 - b.h - 8}
            textAnchor="middle"
            fontFamily="Inter"
            fontSize="12"
            fontWeight="600"
            fill={b.pct === 0 ? presson.color.textMuted : presson.color.accentOn}
            letterSpacing="-0.01em"
          >
            {b.pct}%
          </text>
          <text
            x={20 + i * (colW + 6) + colW / 2}
            y="206"
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="10"
            fill={presson.color.highlight}
            letterSpacing="0.06em"
          >
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
