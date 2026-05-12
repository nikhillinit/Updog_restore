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
        <header className="pv2-ledger-mast">
          <div>
            <div
              className="pv2-bench-eyebrow"
              style={{
                fontFamily: 'var(--pv2-font-mono)',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--pv2-mute)',
                marginBottom: 10,
              }}
            >
              FUND II · JUL 2025 → DEC 2025 · 6-MONTH HORIZON
            </div>
            <h1 className="pv2-ledger-h1">
              Cash &amp; <em>forecast.</em>
            </h1>
            <p className="pv2-ledger-h-sub">
              PROBABILITY-WEIGHTED REQUIREMENT · $5.92M · MAXIMUM $7.09M · CURRENT BALANCE
              SUFFICIENT THROUGH Q4'25
            </p>
          </div>
          <div className="pv2-ledger-balance">
            CURRENT BALANCE
            <span className="pv2-ledger-balance-fig">$12.4M</span>
            <div style={{ marginTop: 14, color: 'var(--pv2-pos)' }}>
              ▲ +$2.1M wk · 1 call cleared
            </div>
            <div className="pv2-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <Btn>CSV</Btn>
              <Btn primary kbd="⌘N">
                Initiate call
              </Btn>
            </div>
          </div>
        </header>

        {/* The ribbon */}
        <section className="pv2-ribbon">
          <div className="pv2-ribbon-legend">
            <span>
              <b>CASH RIBBON</b> · WEEKLY · JAN → JUL
            </span>
            <span>BANDS · P10 · P50 · P90</span>
          </div>
          <CashRibbon />
        </section>

        {/* Cards */}
        <div className="pv2-ledger-grid">
          <div className="pv2-ledger-card">
            <div className="pv2-ledger-card-h">
              <span>Capital required · breakdown</span>
              <span>3 months</span>
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      fontFamily: 'var(--pv2-font-mono)',
                      fontSize: 9.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--pv2-mute)',
                      fontWeight: 500,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--pv2-rule)',
                    }}
                  >
                    Category
                  </th>
                  <th style={th()}>Prob-weighted</th>
                  <th style={th()}>Maximum</th>
                  <th style={{ ...th(), textAlign: 'left' }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {cashBreakdown.map((row, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        padding: '14px 0',
                        fontFamily: 'var(--pv2-font-heading)',
                        fontWeight: 500,
                        fontSize: 14,
                        borderBottom: '1px solid var(--pv2-rule-2)',
                      }}
                    >
                      {row.cat}
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          color: row.tone === 'warm' ? 'var(--pv2-ink)' : undefined,
                          fontWeight: row.tone === 'warm' ? 600 : 400,
                        }}
                      >
                        {row.prob}
                      </span>
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          color: row.tone === 'warm' ? 'var(--pv2-ink)' : undefined,
                          fontWeight: row.tone === 'warm' ? 600 : 400,
                        }}
                      >
                        {row.max}
                      </span>
                    </td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid var(--pv2-rule-2)' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          height: 4,
                          width: row.bar,
                          background:
                            row.tone === 'warm'
                              ? 'var(--pv2-warm-deep, #C9BFB4)'
                              : row.tone === 'tint'
                                ? 'var(--pv2-rule)'
                                : 'var(--pv2-ink)',
                        }}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    style={{
                      padding: '16px 0',
                      fontFamily: 'var(--pv2-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--pv2-ink)',
                      fontWeight: 600,
                      borderTop: '1px solid var(--pv2-ink)',
                    }}
                  >
                    Total required
                  </td>
                  <td
                    style={{
                      ...td(),
                      fontWeight: 700,
                      color: 'var(--pv2-ink)',
                      fontSize: 14,
                      borderTop: '1px solid var(--pv2-ink)',
                      borderBottom: 'none',
                    }}
                  >
                    $5.92M
                  </td>
                  <td
                    style={{
                      ...td(),
                      fontWeight: 700,
                      color: 'var(--pv2-ink)',
                      fontSize: 14,
                      borderTop: '1px solid var(--pv2-ink)',
                      borderBottom: 'none',
                    }}
                  >
                    $7.09M
                  </td>
                  <td style={{ borderTop: '1px solid var(--pv2-ink)' }} />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pv2-ledger-card">
            <div className="pv2-ledger-card-h">
              <span>Queued capital calls</span>
              <span>2 pending · 1 draft</span>
            </div>
            {cashCalls.map((c, i) => (
              <div key={i} className="pv2-ledger-call">
                <div>
                  <h6>
                    {c.fund} · {c.n}
                  </h6>
                  <p>
                    {c.lps} LPS · {c.amount} · DUE {c.due}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    className={`pv2-tag${c.status === 'ready' ? ' pos' : c.status === 'missing' ? ' active' : ''}`}
                  >
                    {c.status === 'ready'
                      ? 'READY'
                      : c.status === 'missing'
                        ? 'MISSING INFO'
                        : 'DRAFT'}
                  </span>
                  {c.note && (
                    <div
                      style={{
                        fontFamily: 'var(--pv2-font-mono)',
                        fontSize: 10,
                        color: 'var(--pv2-mute)',
                        marginTop: 8,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {c.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function th(): React.CSSProperties {
  return {
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
}
function td(): React.CSSProperties {
  return {
    padding: '14px 0',
    textAlign: 'right',
    fontFamily: 'var(--pv2-font-mono)',
    fontSize: 12.5,
    borderBottom: '1px solid var(--pv2-rule-2)',
  };
}

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

      {/* gridlines */}
      <g stroke="#EEE9E3">
        <line x1="32" y1="70" x2="1300" y2="70" />
        <line x1="32" y1="140" x2="1300" y2="140" />
        <line x1="32" y1="210" x2="1300" y2="210" />
      </g>

      {/* y labels */}
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

      {/* past actual */}
      <path
        d="M32,96 L120,100 L208,90 L296,106 L384,112 L472,120 L560,128 L600,132"
        stroke="#292929"
        strokeWidth="2.5"
        fill="none"
      />

      {/* p10–p90 cone */}
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

      {/* p50 forecast */}
      <path
        d="M600,132 L740,126 L880,118 L1020,128 L1160,138 L1300,148"
        stroke="#292929"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        fill="none"
      />

      {/* today rule */}
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

      {/* events */}
      <Pin x={240} y={90} label="+$2.1M call" />
      <Pin x={480} y={120} label="−$1.4M Amplio" />
      <Pin x={820} y={118} label="+$7.06M proj call" dashed />
      <Pin x={1080} y={140} label="−$2.5M new inv" dashed />

      {/* grain */}
      <rect width="1320" height="280" fill="url(#pv2-ribbon-grain)" />

      {/* x labels */}
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
