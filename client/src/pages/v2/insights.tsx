import { useState } from 'react';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { insights } from '@/components/presson-v2/mock';
import { presson } from '@/theme/presson.tokens';

const LENSES = [
  {
    group: 'Lens',
    items: [
      'Capital deployed',
      'Ownership',
      'Stage',
      'Sector',
      'Partner',
      'Geography',
      'Vintage',
      'Co-investor',
    ],
  },
];

/**
 * Insights · Press On v2 atlas.
 *
 * Aesthetic: chart anthology / atlas.
 * One sentence answers every chart. Big lens selector on the left, single
 * dominant chart, three insight tiles below.
 */
export default function InsightsV2() {
  const [lens, setLens] = useState('Capital deployed');

  return (
    <AppShell>
      <div className="pv2-atlas">
        <header className="pv2-atlas-mast">
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 32 }}
          >
            <div>
              <div className="pv2-atlas-eyebrow">FUND II · {lens.toUpperCase()} · 57 COMPANIES</div>
              <h1 className="pv2-atlas-h1">
                Top three positions: <em>38% of cost,</em> 58% of FMV.
              </h1>
              <div className="pv2-atlas-sub">
                Capital deployment · 57 companies · concentration shifting toward winners
              </div>
            </div>
            <div className="pv2-actions">
              <Btn>⇣ PNG</Btn>
              <Btn>⇣ CSV</Btn>
              <Btn primary>Pin to today</Btn>
            </div>
          </div>
        </header>

        <div className="pv2-atlas-body">
          <nav className="pv2-lens">
            {LENSES.map((g) => (
              <div key={g.group}>
                <div className="pv2-lens-group">{g.group}</div>
                {g.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`pv2-lens-item${item === lens ? ' on' : ''}`}
                    onClick={() => setLens(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="pv2-atlas-figure">
            <div
              style={{
                fontFamily: 'var(--pv2-font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--pv2-mute)',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                <b style={{ color: 'var(--pv2-ink)' }}>CAPITAL DEPLOYMENT</b> · INITIAL + RESERVES
              </span>
              <span>SORTED BY TOTAL DEPLOYED</span>
            </div>
            <DeploymentChart />

            <div
              style={{
                fontFamily: 'var(--pv2-font-mono)',
                fontSize: 10,
                color: 'var(--pv2-mute)',
                marginTop: 12,
                display: 'flex',
                gap: 18,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: 'var(--pv2-ink)',
                    verticalAlign: 'middle',
                  }}
                />{' '}
                INITIAL
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: presson.color.highlight,
                    verticalAlign: 'middle',
                  }}
                />{' '}
                RESERVES DEPLOYED
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: 'var(--pv2-rule)',
                    verticalAlign: 'middle',
                  }}
                />{' '}
                RESERVES REMAINING
              </span>
            </div>

            {/* Three insight tiles */}
            <div className="pv2-insights">
              {insights.map((i) => (
                <div key={i.n} className="pv2-insight">
                  <div className="pv2-insight-num">INSIGHT · {i.n}</div>
                  <div className="pv2-insight-text" dangerouslySetInnerHTML={{ __html: i.text }} />
                  <div className="pv2-insight-meta">{i.meta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function DeploymentChart() {
  const rows: [string, number, number, number, number][] = [
    ['Amplio', 14.0, 5, 5, 4],
    ['Modulate', 4.5, 5, 1, 0.5],
    ['Imprint', 3.0, 3, 0, 0],
    ['Bravura', 2.8, 2.8, 0, 0],
    ['AlphaTech', 2.43, 2.43, 0, 0],
    ['Neuromax', 2.1, 2.1, 0, 0],
    ['DigitalWave', 1.85, 1.85, 0, 0],
    ['Metaflux', 1.8, 1.8, 0, 0],
    ['Apico', 1.62, 1.62, 0, 0],
    ['Imprint II', 1.52, 1.52, 0, 0],
    ['Berry', 1.5, 1.5, 0, 0],
    ['Aprico', 1.45, 1.45, 0, 0],
    ['Modulate II', 1.44, 1.44, 0, 0],
    ['Bridgette', 1.0, 1.0, 0, 0],
    ['Spire', 1.0, 1.0, 0, 0],
    ['Synapse', 0.6, 0.6, 0, 0],
  ];
  return (
    <svg viewBox="0 0 1100 260" style={{ width: '100%', height: 280 }}>
      <g stroke={presson.color.borderSubtle}>
        <line x1="0" y1="60" x2="1100" y2="60" />
        <line x1="0" y1="120" x2="1100" y2="120" />
        <line x1="0" y1="180" x2="1100" y2="180" />
      </g>
      {rows.map((r, i) => {
        const x = 20 + i * 66;
        const initH = r[2] * 14;
        const resH = r[3] * 14;
        const remH = r[4] * 14;
        const y1 = 200 - initH;
        const y2 = y1 - resH;
        const y3 = y2 - remH;
        const label = r[1] >= 1 ? `$${r[1].toFixed(1)}M` : `$${(r[1] * 1000).toFixed(0)}K`;
        return (
          <g key={r[0]}>
            <rect x={x} y={y1} width="40" height={initH} fill={presson.color.text} />
            <rect x={x} y={y2} width="40" height={resH} fill={presson.color.highlight} />
            <rect x={x} y={y3} width="40" height={remH} fill={presson.color.surfaceSubtle} />
            <text
              x={x + 20}
              y={y3 - 6}
              textAnchor="middle"
              fontFamily="Inter"
              fontSize="10"
              fontWeight="600"
              fill={presson.color.text}
              letterSpacing="-0.01em"
            >
              {label}
            </text>
            <text
              x={x + 20}
              y="220"
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              fontSize="9"
              fill={presson.color.textMuted}
              letterSpacing="0.06em"
              transform={`rotate(35 ${x + 20} 220)`}
            >
              {r[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
