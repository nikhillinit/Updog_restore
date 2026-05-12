import type { CSSProperties } from 'react';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { cashCalls, cashBreakdown } from '@/components/presson-v2/mock';

/**
 * Cash & forecast · Press On v2 ledger.
 *
 * Aesthetic: treasurer's ledger / cash ribbon.
 * One dominant horizontal ribbon dominates the page. Past on the left,
 * forecast cone on the right, with a vertical "today" rule.
 */
export default function CashV2() {
  return (
    <AppShell>
      <div className="pv2-ledger">
        <LedgerMast />
        <RibbonSection />
        <div className="pv2-ledger-grid">
          <BreakdownCard />
          <CallsCard />
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- masthead ---------- */

const MAST_EYEBROW_STYLE: CSSProperties = {
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--pv2-mute)',
  marginBottom: 10,
};

function LedgerMast() {
  return (
    <header className="pv2-ledger-mast">
      <div>
        <div className="pv2-bench-eyebrow" style={MAST_EYEBROW_STYLE}>
          FUND II · JUL 2025 → DEC 2025 · 6-MONTH HORIZON
        </div>
        <h1 className="pv2-ledger-h1">
          Cash &amp; <em>forecast.</em>
        </h1>
        <p className="pv2-ledger-h-sub">
          PROBABILITY-WEIGHTED REQUIREMENT · $5.92M · MAXIMUM $7.09M · CURRENT BALANCE SUFFICIENT
          THROUGH Q4'25
        </p>
      </div>
      <div className="pv2-ledger-balance">
        CURRENT BALANCE
        <span className="pv2-ledger-balance-fig">$12.4M</span>
        <div style={{ marginTop: 14, color: 'var(--pv2-pos)' }}>▲ +$2.1M wk · 1 call cleared</div>
        <div className="pv2-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <Btn>CSV</Btn>
          <Btn primary kbd="⌘N">
            Initiate call
          </Btn>
        </div>
      </div>
    </header>
  );
}

/* ---------- ribbon section ---------- */

function RibbonSection() {
  return (
    <section className="pv2-ribbon">
      <div className="pv2-ribbon-legend">
        <span>
          <b>CASH RIBBON</b> · WEEKLY · JAN → JUL
        </span>
        <span>BANDS · P10 · P50 · P90</span>
      </div>
      <CashRibbon />
    </section>
  );
}

/* ---------- breakdown card ---------- */

const TH: CSSProperties = {
  textAlign: 'right',
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--pv2-mute)',
  fontWeight: 500,
  padding: '8px 0',
  borderBottom: '1px solid var(--pv2-rule)',
};
const TH_LEFT: CSSProperties = { ...TH, textAlign: 'left' };
const TD: CSSProperties = {
  padding: '14px 0',
  textAlign: 'right',
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 12.5,
  borderBottom: '1px solid var(--pv2-rule-2)',
};
const TD_CAT: CSSProperties = {
  padding: '14px 0',
  fontFamily: 'var(--pv2-font-heading)',
  fontWeight: 500,
  fontSize: 14,
  borderBottom: '1px solid var(--pv2-rule-2)',
};
const TD_BAR: CSSProperties = { padding: '14px 0', borderBottom: '1px solid var(--pv2-rule-2)' };
const TD_TOTAL_LABEL: CSSProperties = {
  padding: '16px 0',
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--pv2-ink)',
  fontWeight: 600,
  borderTop: '1px solid var(--pv2-ink)',
};
const TD_TOTAL_VAL: CSSProperties = {
  ...TD,
  fontWeight: 700,
  color: 'var(--pv2-ink)',
  fontSize: 14,
  borderTop: '1px solid var(--pv2-ink)',
  borderBottom: 'none',
};
const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontVariantNumeric: 'tabular-nums',
};

function barColor(tone: 'warm' | 'tint' | 'ink'): string {
  if (tone === 'warm') return 'var(--pv2-warm-deep, #C9BFB4)';
  if (tone === 'tint') return 'var(--pv2-rule)';
  return 'var(--pv2-ink)';
}

function BreakdownCard() {
  return (
    <div className="pv2-ledger-card">
      <div className="pv2-ledger-card-h">
        <span>Capital required · breakdown</span>
        <span>3 months</span>
      </div>
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_LEFT}>Category</th>
            <th style={TH}>Prob-weighted</th>
            <th style={TH}>Maximum</th>
            <th style={TH_LEFT}>Risk</th>
          </tr>
        </thead>
        <tbody>
          {cashBreakdown.map((row) => (
            <BreakdownRow key={row.cat} row={row} />
          ))}
          <tr>
            <td style={TD_TOTAL_LABEL}>Total required</td>
            <td style={TD_TOTAL_VAL}>$5.92M</td>
            <td style={TD_TOTAL_VAL}>$7.09M</td>
            <td style={{ borderTop: '1px solid var(--pv2-ink)' }} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BreakdownRow({ row }: { row: (typeof cashBreakdown)[number] }) {
  const emphasize = row.tone === 'warm';
  const valStyle: CSSProperties = {
    color: emphasize ? 'var(--pv2-ink)' : undefined,
    fontWeight: emphasize ? 600 : 400,
  };
  return (
    <tr>
      <td style={TD_CAT}>{row.cat}</td>
      <td style={TD}>
        <span style={valStyle}>{row.prob}</span>
      </td>
      <td style={TD}>
        <span style={valStyle}>{row.max}</span>
      </td>
      <td style={TD_BAR}>
        <span
          style={{
            display: 'inline-block',
            height: 4,
            width: row.bar,
            background: barColor(row.tone),
          }}
        />
      </td>
    </tr>
  );
}

/* ---------- queued calls card ---------- */

const CALL_NOTE_STYLE: CSSProperties = {
  fontFamily: 'var(--pv2-font-mono)',
  fontSize: 10,
  color: 'var(--pv2-mute)',
  marginTop: 8,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

function statusLabel(status: 'ready' | 'missing' | 'draft'): string {
  if (status === 'ready') return 'READY';
  if (status === 'missing') return 'MISSING INFO';
  return 'DRAFT';
}

function statusTagSuffix(status: 'ready' | 'missing' | 'draft'): string {
  if (status === 'ready') return ' pos';
  if (status === 'missing') return ' active';
  return '';
}

function CallsCard() {
  return (
    <div className="pv2-ledger-card">
      <div className="pv2-ledger-card-h">
        <span>Queued capital calls</span>
        <span>2 pending · 1 draft</span>
      </div>
      {cashCalls.map((c, i) => (
        <CallRow key={i} call={c} />
      ))}
    </div>
  );
}

function CallRow({ call: c }: { call: (typeof cashCalls)[number] }) {
  return (
    <div className="pv2-ledger-call">
      <div>
        <h6>
          {c.fund} · {c.n}
        </h6>
        <p>
          {c.lps} LPS · {c.amount} · DUE {c.due}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={`pv2-tag${statusTagSuffix(c.status)}`}>{statusLabel(c.status)}</span>
        {c.note && <div style={CALL_NOTE_STYLE}>{c.note}</div>}
      </div>
    </div>
  );
}

/* ---------- ribbon SVG ---------- */

function CashRibbon() {
  return (
    <svg
      viewBox="0 0 1320 280"
      preserveAspectRatio="none"
      style={{ width: '100%', height: 280, display: 'block' }}
    >
      <defs>
        <linearGradient id="pv2-ribbon-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#E0D8D1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#E0D8D1" stopOpacity="0" />
        </linearGradient>
        <pattern id="pv2-ribbon-grain" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.3" fill="rgba(41,41,41,0.05)" />
        </pattern>
      </defs>

      <g stroke="#EEE9E3">
        <line x1="32" y1="70" x2="1300" y2="70" />
        <line x1="32" y1="140" x2="1300" y2="140" />
        <line x1="32" y1="210" x2="1300" y2="210" />
      </g>

      <g fontFamily="JetBrains Mono" fontSize="9.5" fill="#A8A8A8" letterSpacing="0.1em">
        <text x="6" y="74">
          $18M
        </text>
        <text x="6" y="144">
          $12M
        </text>
        <text x="6" y="214">
          $6M
        </text>
      </g>

      <path
        d="M32,96 L120,100 L208,90 L296,106 L384,112 L472,120 L560,128 L600,132"
        stroke="#292929"
        strokeWidth="2.5"
        fill="none"
      />

      <path
        d="M600,132 L740,148 L880,156 L1020,180 L1160,196 L1300,218 L1300,96 L1160,70 L1020,60 L880,82 L740,104 L600,132 Z"
        fill="url(#pv2-ribbon-grad)"
      />
      <path
        d="M600,132 L740,148 L880,156 L1020,180 L1160,196 L1300,218"
        stroke="#C9BFB4"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M600,132 L740,104 L880,82 L1020,60 L1160,70 L1300,96"
        stroke="#C9BFB4"
        strokeWidth="1"
        fill="none"
      />

      <path
        d="M600,132 L740,126 L880,118 L1020,128 L1160,138 L1300,148"
        stroke="#292929"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        fill="none"
      />

      <line x1="600" y1="20" x2="600" y2="248" stroke="#292929" strokeWidth="1" />
      <text
        x="608"
        y="34"
        fontFamily="JetBrains Mono"
        fontSize="10"
        fill="#292929"
        letterSpacing="0.1em"
      >
        TODAY · MAY 12
      </text>

      <Pin x={240} y={90} label="+$2.1M call" />
      <Pin x={480} y={120} label="−$1.4M Amplio" />
      <Pin x={820} y={118} label="+$7.06M proj call" dashed />
      <Pin x={1080} y={140} label="−$2.5M new inv" dashed />

      <rect width="1320" height="280" fill="url(#pv2-ribbon-grain)" />

      <g fontFamily="JetBrains Mono" fontSize="10" fill="#A8A8A8" letterSpacing="0.1em">
        <text x="32" y="266">
          JAN
        </text>
        <text x="240" y="266">
          FEB
        </text>
        <text x="420" y="266">
          MAR
        </text>
        <text x="600" y="266">
          MAY
        </text>
        <text x="780" y="266">
          JUN
        </text>
        <text x="960" y="266">
          JUL
        </text>
        <text x="1140" y="266">
          AUG
        </text>
      </g>
    </svg>
  );
}

function Pin({ x, y, label, dashed }: { x: number; y: number; label: string; dashed?: boolean }) {
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + 18}
        stroke="#292929"
        strokeWidth="1"
        strokeDasharray={dashed ? '2 2' : undefined}
      />
      <circle cx={x} cy={y} r="3.5" fill="#292929" />
      <text
        x={x + 8}
        y={y + 2}
        fontFamily="Inter"
        fontSize="11.5"
        fontWeight="600"
        fill="#292929"
        letterSpacing="-0.01em"
      >
        {label}
      </text>
    </g>
  );
}
