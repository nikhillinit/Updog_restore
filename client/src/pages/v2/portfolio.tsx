import { useState, Fragment } from 'react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { companies, sectorGroups, type Company } from '@/components/presson-v2/mock';

/**
 * Portfolio · Press On v2 blotter.
 *
 * Aesthetic: Bloomberg blotter / Financial Times tablesheet.
 * Left-edge heat strip is the visual scan column. Sector cohorts read as
 * editorial sub-heads. The inspector is a typographic company card.
 */

type ViewKey = 'all' | 'watch' | 'top' | 'exited';

const VIEWS: { key: ViewKey; label: string; count: number }[] = [
  { key: 'all', label: 'All active', count: 57 },
  { key: 'watch', label: 'Watch · drift', count: 7 },
  { key: 'top', label: 'Top deciles', count: 12 },
  { key: 'exited', label: 'Exited', count: 14 },
];

const FILTERS = [
  { label: 'Stage = Series A — C', on: true },
  { label: 'Held ≥ 2yr', on: true },
  { label: 'Sector ≠ Exited', on: false },
  { label: 'Geography · Any', on: false },
];

export default function PortfolioV2() {
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string>('digitalwave');
  const [view, setView] = useState<ViewKey>('all');
  const selected = companies.find((c) => c.id === selectedId) ?? companies[0];

  return (
    <AppShell>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Aggregate masthead — six editorial figures */}
        <header className="pv2-blot-mast">
          <div className="pv2-blot-mast-title">
            <div className="pv2-blot-mast-eyebrow">
              Krakatoa Ventures · Fund II · as of May 12, 2026
            </div>
            <h1 className="pv2-blot-mast-h1">
              Portfolio<em>.</em>
              <sup>57</sup>
            </h1>
          </div>
          <Fig k="COST" v="$42.62" unit="M" />
          <Fig k="FMV" v="$129.0" unit="M" d="▲ +$3.2M wk" tone="pos" />
          <Fig k="GROSS MOIC" v="3.02" unit="×" d="▲ +0.04" tone="pos" />
          <Fig k="IRR" v="18.4" unit="%" d="▲ +0.6 vs Q1" tone="pos" />
          <Fig k="Δ VS PLAN" v="−6.7" unit="%" d="reserves under pace" tone="neg" />
        </header>

        {/* Saved-view pill rail */}
        <nav className="pv2-pillrail">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`pv2-pillrail-tab${view === v.key ? ' active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
              <span className="count">[{v.count}]</span>
            </button>
          ))}
          <span className="pv2-pillrail-spacer" />
          <span className="pv2-pillrail-filter">
            New view <kbd>+</kbd>
          </span>
          <div className="pv2-actions" style={{ padding: '8px 18px 8px 0' }}>
            <Btn>⇣ Export</Btn>
            <Btn primary kbd="⌘N">
              New investment
            </Btn>
          </div>
        </nav>

        {/* Active filter chips */}
        <div className="pv2-chiprail">
          {FILTERS.map((f) => (
            <span key={f.label} className={`pv2-chip${f.on ? ' on' : ''}`}>
              {f.label}
              {f.on && <span className="pv2-chip-x">×</span>}
            </span>
          ))}
          <span className="pv2-chip add">+ filter</span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--pv2-font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--pv2-mute)',
            }}
          >
            ⌘F to filter · ↑↓ to navigate · ↵ to open
          </span>
        </div>

        {/* The blotter + inspector */}
        <div className="pv2-blot-frame">
          <div className="pv2-blot-scroll">
            <table className="pv2-blot">
              <thead>
                <tr>
                  <th />
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Sector</th>
                  <th className="n">Cost</th>
                  <th className="n">FMV</th>
                  <th className="n">MOIC</th>
                  <th className="n">IRR</th>
                  <th>Δ vs plan</th>
                  <th>Last mark</th>
                </tr>
              </thead>
              <tbody>
                {/* Aggregate row */}
                <tr className="agg">
                  <td />
                  <td colSpan={3}>
                    <span className="agg-k">Aggregate · 57 companies</span>
                  </td>
                  <td className="n">$42.62M</td>
                  <td className="n">$129.01M</td>
                  <td className="n">3.02×</td>
                  <td className="n">18.4%</td>
                  <td>
                    <span className="pv2-dev">
                      <span className="pv2-dev-bar" style={{ width: 42 }} />
                      <span className="pv2-dev-bar warm" style={{ width: 14 }} />
                    </span>
                  </td>
                  <td className="pv2-mono" style={{ fontSize: 10, color: 'var(--pv2-mute)' }}>
                    rolling 7d
                  </td>
                </tr>

                {/* Sector cohorts */}
                {sectorGroups.map((sector) => (
                  <Fragment key={sector.name}>
                    <tr className="sector">
                      <td colSpan={10}>
                        <span className="sector-title">{sector.name}</span>
                        <span className="sector-meta">
                          {sector.count} cos · {sector.cost} cost · {sector.fmv} FMV · {sector.moic}
                        </span>
                        <span className="sector-spark">
                          <SectorSpark name={sector.name} />
                        </span>
                      </td>
                    </tr>
                    {companies
                      .filter((c) => sector.ids.includes(c.id))
                      .map((co) => (
                        <BlotterRow
                          key={co.id}
                          co={co}
                          selected={selected.id === co.id}
                          onSelect={() => setSelectedId(co.id)}
                        />
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inspector — typographic company card */}
          <Inspector company={selected} onOpen={() => navigate(`/v2/companies/${selected.id}`)} />
        </div>
      </div>
    </AppShell>
  );
}

/* ----- pieces ----- */

function Fig({
  k,
  v,
  unit,
  d,
  tone,
}: {
  k: string;
  v: string;
  unit?: string;
  d?: string;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div className="pv2-blot-mast-fig">
      <div className="pv2-blot-mast-k">{k}</div>
      <div className="pv2-blot-mast-v">
        {v}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {d && <div className={`pv2-blot-mast-d${tone ? ` ${tone}` : ''}`}>{d}</div>}
    </div>
  );
}

const SECTOR_TD_STYLE = {
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 11,
  color: 'var(--pv2-mute)',
  letterSpacing: '0.04em',
} as const;

const MARK_TD_STYLE_BASE = {
  fontSize: 10.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
} as const;

function rowTone(co: Company): 'neg' | 'hot' | 'pos' {
  if (co.barNeg) return 'neg';
  if (co.highlight) return 'hot';
  return 'pos';
}

function devBarSuffix(co: Company): string {
  if (co.barNeg) return ' neg';
  if (co.highlight) return ' warm';
  return '';
}

function BlotterRow({
  co,
  selected,
  onSelect,
}: {
  co: Company;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = rowTone(co);
  const rowCls = `row${selected ? ' active' : ''}${co.highlight ? ' hot' : ''}`;
  const devBarCls = `pv2-dev-bar${devBarSuffix(co)}`;
  const irrStyle = co.irrNeg ? { color: 'var(--pv2-neg)' } : undefined;
  const markStyle = {
    ...MARK_TD_STYLE_BASE,
    color: co.markNeg ? 'var(--pv2-neg)' : 'var(--pv2-mute)',
  };
  return (
    <tr className={rowCls} data-tone={tone} onClick={onSelect}>
      <td className="heat" />
      <td className="name">{co.name}</td>
      <td>
        <span className="pv2-stage">{co.stage}</span>
      </td>
      <td style={SECTOR_TD_STYLE}>{co.sector}</td>
      <td className="n">{co.cost}</td>
      <td className="n">{co.fmv}</td>
      <td className="n" style={{ fontWeight: 600 }}>
        {co.moic}
      </td>
      <td className="n" style={irrStyle}>
        {co.irr}
      </td>
      <td>
        <span className="pv2-dev">
          <span className={devBarCls} style={{ width: Math.round(co.bar * 0.8) }} />
        </span>
      </td>
      <td className="pv2-mono" style={markStyle}>
        {co.lastMark}
      </td>
    </tr>
  );
}

function Inspector({ company, onOpen }: { company: Company; onOpen: () => void }) {
  const status = company.highlight ? 'on watch' : 'in motion';
  return (
    <aside className="pv2-inspector">
      <div className="pv2-inspector-eyebrow">
        <span>Inspector · ↑↓</span>
        <span>{company.id.slice(0, 6).toUpperCase()}</span>
      </div>
      <div className="pv2-inspector-mast">
        <h2 className="pv2-inspector-name">
          {company.name}
          <em>· {status}</em>
        </h2>
        {company.highlight && <span className="pv2-tag active">WATCH</span>}
        <div className="pv2-inspector-meta">
          {company.sector.toUpperCase()} · SERIES {company.stage} · LED BY US · HELD 2.4YR
        </div>
      </div>

      <div className="pv2-inspector-kpis">
        <KpiCell label="COST" value={company.cost} />
        <KpiCell label="FMV" value={company.fmv} />
        <KpiCell label="MOIC" value={company.moic} />
        <KpiCell label="OWN" value={company.ownership ?? '—'} />
      </div>

      {company.arr && (
        <div className="pv2-inspector-section">
          <h5>
            <span>ARR · last 6Q</span>
            <span
              style={{
                color: company.arrDeltaNeg ? 'var(--pv2-neg)' : 'var(--pv2-pos)',
              }}
            >
              {company.arrDeltaQoq} qoq
            </span>
          </h5>
          <svg viewBox="0 0 320 64" style={{ width: '100%', height: 60 }}>
            <defs>
              <linearGradient id="pv2-spark-fade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#E0D8D1" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#E0D8D1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,52 L53,48 L106,38 L160,40 L213,22 L266,32 L320,16 L320,64 L0,64 Z"
              fill="url(#pv2-spark-fade)"
            />
            <path
              d="M0,52 L53,48 L106,38 L160,40 L213,22 L266,32 L320,16"
              fill="none"
              stroke="#292929"
              strokeWidth="1.5"
            />
            <circle cx="320" cy="16" r="3" fill="#292929" />
          </svg>
          <div
            style={{
              fontFamily: 'var(--pv2-font-mono)',
              fontSize: 11,
              color: 'var(--pv2-ink)',
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{company.arr}</span>
            <span style={{ color: 'var(--pv2-mute)' }}>Q1 → Q2</span>
          </div>
        </div>
      )}

      <div className="pv2-inspector-section">
        <h5>
          <span>Activity</span>
          <span style={{ color: 'var(--pv2-mute)' }}>last 30 days</span>
        </h5>
        <ul className="pv2-log">
          <li>
            <time>MAY 09</time>
            <span>
              <b style={{ color: 'var(--pv2-ink)', fontWeight: 500 }}>CEO call requested</b> · 30
              min slot offered Friday
            </span>
          </li>
          <li>
            <time>MAY 02</time>
            <span>Q1 board pack received · 12 pages</span>
          </li>
          <li>
            <time>APR 18</time>
            <span>
              Mark refreshed to{' '}
              <b style={{ color: 'var(--pv2-ink)', fontWeight: 500 }}>{company.fmv}</b>
            </span>
          </li>
          <li>
            <time>APR 04</time>
            <span>Bridge term sheet circulated · $1.2M follow-on</span>
          </li>
        </ul>
      </div>

      <div className="pv2-inspector-actions">
        <Btn onClick={onOpen}>Open file</Btn>
        <Btn>Model exit</Btn>
        <Btn primary>Add note</Btn>
      </div>
    </aside>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="pv2-inspector-kpi">
      <div className="pv2-inspector-kpi-k">{label}</div>
      <div className="pv2-inspector-kpi-v">{value}</div>
    </div>
  );
}

/** Tiny aggregate sparkline next to each sector cohort title. */
function SectorSpark({ name }: { name: string }) {
  // hand-tuned paths so each cohort gets its own visual personality
  const paths: Record<string, string> = {
    'B2B SaaS': 'M0,18 L20,16 L40,12 L60,14 L80,8 L100,4',
    Agriculture: 'M0,20 L20,18 L40,20 L60,12 L80,14 L100,6',
    Fintech: 'M0,10 L20,12 L40,14 L60,16 L80,15 L100,18',
  };
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={paths[name] ?? 'M0,12 L100,12'} fill="none" stroke="#292929" strokeWidth="1.5" />
      <circle
        cx="100"
        cy={Number((paths[name] ?? 'M0,12 L100,12').match(/L\s*100\s*,\s*([\d.]+)/)?.[1] ?? 12)}
        r="2.2"
        fill="#292929"
      />
    </svg>
  );
}
