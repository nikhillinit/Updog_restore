import { useState } from 'react';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { lps, type LP } from '@/components/presson-v2/mock';

/**
 * Partners · Press On v2 LP register.
 *
 * Aesthetic: relationship register / contact book.
 * Denormalized LP table on the left for ops work, a typographic relationship
 * card on the right with a vertical commitment timeline.
 */
export default function PartnersV2() {
  const [selectedId, setSelectedId] = useState<string>(lps[0].id);
  const selected = lps.find((l) => l.id === selectedId) ?? lps[0];

  return (
    <AppShell>
      <div className="pv2-register">
        <header className="pv2-register-mast">
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
              FIRM · 50 LPS · 4 FUNDS · ALL VINTAGES
            </div>
            <h1 className="pv2-register-h1">
              Partners <em>·</em> 50 LPs.
            </h1>
            <p className="pv2-register-sub">
              $487.6M COMMITTED · 51.4% CALLED · $114.2M DISTRIBUTED
            </p>
          </div>
          <div className="pv2-register-next">
            NEXT REPORT DUE
            <b>JUN 14 · Q2 LETTER</b>5 LPS PENDING SUBSCRIPTION
            <div className="pv2-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <Btn>CSV</Btn>
              <Btn>Send update</Btn>
              <Btn primary>New LP</Btn>
            </div>
          </div>
        </header>

        <div className="pv2-register-body">
          <div className="pv2-register-table-wrap">
            <table className="pv2-lp-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Type</th>
                  <th>Funds</th>
                  <th className="n">Committed</th>
                  <th className="n">Called %</th>
                  <th className="n">Distributed</th>
                  <th>Last call</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                <tr className="pv2-lp-agg">
                  <td colSpan={3}>— AGGREGATE · 50 LPS —</td>
                  <td className="n">
                    <b>$487.62M</b>
                  </td>
                  <td className="n">
                    <b>51.4%</b>
                  </td>
                  <td className="n">
                    <b>$114.18M</b>
                  </td>
                  <td colSpan={2} />
                </tr>
                {lps.map((lp) => (
                  <tr
                    key={lp.id}
                    className={selectedId === lp.id ? 'active' : ''}
                    onClick={() => setSelectedId(lp.id)}
                  >
                    <td className="name">{lp.name}</td>
                    <td>{lp.type}</td>
                    <td
                      style={{
                        fontFamily: 'var(--pv2-font-mono)',
                        fontSize: 11,
                        color: 'var(--pv2-mute)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {lp.funds}
                    </td>
                    <td className="n">{lp.committed}</td>
                    <td className="n">{lp.called}</td>
                    <td className="n">{lp.distributed}</td>
                    <td
                      style={{
                        fontFamily: 'var(--pv2-font-mono)',
                        fontSize: 11,
                        color: lp.missing ? 'var(--pv2-ink)' : 'var(--pv2-mute)',
                        fontWeight: lp.missing ? 600 : 400,
                      }}
                    >
                      {lp.lastCall}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          height: 4,
                          width: lp.health * 1.1,
                          background: lp.missing
                            ? 'var(--pv2-warm-deep, #C9BFB4)'
                            : 'var(--pv2-ink)',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <LPCard lp={selected} />
        </div>
      </div>
    </AppShell>
  );
}

function LPCard({ lp }: { lp: LP }) {
  // Synthesize a commitment timeline from the `funds` string
  const fundList = lp.funds.split(/\s*·\s*|\s+SPV/).filter(Boolean);

  return (
    <aside className="pv2-lp-card">
      <div className="pv2-lp-card-mast">
        <div className="pv2-lp-card-eyebrow">LP · INSPECTOR</div>
        <h2 className="pv2-lp-card-name">{lp.name}</h2>
        {lp.missing && <span className="pv2-tag active">MISSING INFO</span>}
        <div className="pv2-lp-card-meta">
          {lp.type.toUpperCase()} · LP IN {fundList.length} FUND{fundList.length === 1 ? '' : 'S'}
        </div>
      </div>

      <div className="pv2-inspector-kpis">
        <div className="pv2-inspector-kpi">
          <div className="pv2-inspector-kpi-k">COMMITTED</div>
          <div className="pv2-inspector-kpi-v">{lp.committed}</div>
        </div>
        <div className="pv2-inspector-kpi">
          <div className="pv2-inspector-kpi-k">CALLED</div>
          <div className="pv2-inspector-kpi-v">{lp.called}</div>
        </div>
        <div className="pv2-inspector-kpi">
          <div className="pv2-inspector-kpi-k">DISTRIBUTED</div>
          <div className="pv2-inspector-kpi-v">{lp.distributed}</div>
        </div>
        <div className="pv2-inspector-kpi">
          <div className="pv2-inspector-kpi-k">HEALTH</div>
          <div className="pv2-inspector-kpi-v">{lp.health}</div>
        </div>
      </div>

      <div className="pv2-inspector-section">
        <h5>
          <span>Commitment timeline</span>
          <span style={{ color: 'var(--pv2-mute)' }}>{fundList.length} entries</span>
        </h5>
        <div className="pv2-tline">
          {fundList.map((fund, i) => (
            <div key={i} className="pv2-tline-step">
              <span className={`pv2-tline-dot${i === fundList.length - 1 ? ' active' : ''}`} />
              <div>
                <div className="pv2-tline-fund">{fund.trim()}</div>
                <div className="pv2-tline-meta">
                  {i === fundList.length - 1
                    ? 'ACTIVE · next call est. $80K'
                    : 'fully called · partial distribution'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pv2-inspector-section">
        <h5>
          <span>Contact</span>
          <span style={{ color: 'var(--pv2-mute)' }}>primary</span>
        </h5>
        <div
          style={{
            fontFamily: 'var(--pv2-font-heading)',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--pv2-ink)',
            letterSpacing: '-0.012em',
          }}
        >
          G. Accetta · Managing Director
        </div>
        <div
          style={{
            fontFamily: 'var(--pv2-font-mono)',
            fontSize: 11,
            color: 'var(--pv2-mute)',
            marginTop: 6,
            letterSpacing: '0.04em',
          }}
        >
          accetta@{lp.id}mgmt.com
        </div>
      </div>

      <div className="pv2-inspector-actions">
        <Btn>Send letter</Btn>
        <Btn primary>Initiate call</Btn>
      </div>
    </aside>
  );
}
