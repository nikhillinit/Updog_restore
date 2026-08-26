import { useParams, useLocation } from 'wouter';
import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { companies, kpiSparklines } from '@/components/presson-v2/mock';
import { presson } from '@/theme/presson.tokens';

/**
 * Company file · Press On v2.
 *
 * Aesthetic: magazine monograph / investor dossier.
 * Single scrollable page, top-down: mast, ticker, capital trajectory ribbon,
 * KPI sparkline mosaic.
 */
export default function CompanyV2() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const company = companies.find((c) => c.id === params.id) ?? companies[2];

  const initials = company.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const status = company.highlight ? 'on watch' : 'in motion';

  return (
    <AppShell>
      <div className="pv2-dossier">
        {/* Mast */}
        <header className="pv2-dossier-mast">
          <div className="pv2-monogram">{initials}</div>
          <div>
            <div className="pv2-dossier-kicker">
              <b>FUND II</b> · {company.sector.toUpperCase()} · SERIES {company.stage} · LED BY F.
              CHARLESTON · HELD 2.4YR
            </div>
            <h1 className="pv2-dossier-name">
              {company.name}
              <br />
              <em>{status}.</em>
            </h1>
          </div>
          <div className="pv2-dossier-watchers">
            <div className="pv2-dossier-watchers-k">5 partners watching</div>
            <div className="pv2-dossier-watchers-row">
              <span className="pv2-avatar">PJ</span>
              <span className="pv2-avatar">FC</span>
              <span className="pv2-avatar" style={{ background: presson.color.textMuted }}>
                KS
              </span>
              <span className="pv2-avatar" style={{ background: presson.color.textMuted }}>
                +2
              </span>
            </div>
            <div className="pv2-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <Btn onClick={() => navigate('/v2/portfolio')}>← Portfolio</Btn>
              <Btn>Documents</Btn>
              <Btn primary kbd="⌘E">
                Model exit
              </Btn>
            </div>
          </div>
        </header>

        {/* Ticker — borderless truth-line */}
        <section className="pv2-dossier-ticker">
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">COST</div>
            <div className="pv2-ticker-v">{company.cost}</div>
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">FMV</div>
            <div className="pv2-ticker-v">{company.fmv}</div>
          </div>
          <div className={`pv2-ticker-cell${company.highlight ? ' warm' : ''}`}>
            <div className="pv2-ticker-k">GROSS MOIC</div>
            <div className="pv2-ticker-v">{company.moic}</div>
            {!company.irrNeg && <div className="pv2-ticker-d pos">▲ +0.38</div>}
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">IRR</div>
            <div className="pv2-ticker-v">
              {company.irr.replaceAll('%', '').replaceAll('−', '–')}
              <span className="unit">%</span>
            </div>
            {company.irrNeg && <div className="pv2-ticker-d neg">below threshold</div>}
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">OWNERSHIP</div>
            <div className="pv2-ticker-v">
              {(company.ownership ?? '—').replaceAll('%', '')}
              <span className="unit">%</span>
            </div>
          </div>
        </section>

        {/* §01 — Trajectory */}
        <div className="pv2-dossier-section pv2-d1">
          <span className="pv2-dossier-section-num">§01</span>
          <span className="pv2-dossier-section-ttl">Capital trajectory</span>
          <span className="pv2-dossier-section-meta">RESERVE FOR FOLLOW-ON · $640K</span>
        </div>
        <figure className="pv2-dossier-figure pv2-d1" style={{ margin: 0 }}>
          <TrajectoryRibbon />
        </figure>

        {/* §02 — KPI mosaic */}
        <div className="pv2-dossier-section pv2-d2">
          <span className="pv2-dossier-section-num">§02</span>
          <span className="pv2-dossier-section-ttl">Operating signals</span>
          <span className="pv2-dossier-section-meta">LAST 8 QUARTERS · COMPANY-REPORTED</span>
        </div>
        <div className="pv2-dossier-figure pv2-d2" style={{ paddingTop: 16 }}>
          <div className="pv2-mosaic">
            {Object.entries(kpiSparklines).map(([label, k]) => (
              <div key={label} className="pv2-mosaic-cell">
                <div className="pv2-mosaic-k">{label}</div>
                <div className="pv2-mosaic-v">{k.v}</div>
                <svg
                  viewBox="0 0 200 36"
                  preserveAspectRatio="none"
                  className="pv2-mosaic-spark"
                  style={{ width: '100%', height: 36, display: 'block' }}
                >
                  <path d={k.spark} className="pv2-spark" />
                </svg>
                <div className={`pv2-mosaic-d${k.deltaTone !== 'mute' ? ` ${k.deltaTone}` : ''}`}>
                  {k.delta}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer
          style={{
            padding: '24px 32px',
            borderTop: '1px solid var(--pv2-ink)',
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--pv2-font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--pv2-mute)',
          }}
        >
          <span>UPDOG · COMPANY FILE · {company.name.toUpperCase()}</span>
          <span>NEXT BOARD · OCT 14 · NEXT MARK · Q3'26</span>
        </footer>
      </div>
    </AppShell>
  );
}

function TrajectoryRibbon() {
  return (
    <svg viewBox="0 0 1180 200" style={{ width: '100%', height: 200 }}>
      <defs>
        <pattern id="pv2-tr-grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.3" fill="rgba(41,41,41,0.05)" />
        </pattern>
      </defs>
      {/* Spine */}
      <line x1="40" y1="120" x2="1140" y2="120" stroke={presson.color.highlight} strokeWidth="2" />
      <rect x="40" y="118" width="460" height="4" fill={presson.color.text} />
      <rect x="500" y="118" width="640" height="4" fill={presson.color.highlight} />

      {/* SEED */}
      <Node x={80} r={6} label="SEED" date="JAN ’19" amount="$250K" pre="$3M pre" />
      {/* Series A */}
      <Node x={260} r={7} label="SERIES A" date="JAN ’21" amount="$2.43M led" pre="$42.5M pre" />
      {/* Series B (now, big) */}
      <Node
        x={500}
        r={9}
        label="SERIES B · NOW"
        date="AUG ’23"
        amount="$640K reserve"
        pre="$80M pre"
        big
      />
      {/* Series C projected */}
      <Node
        x={760}
        r={7}
        label="SERIES C"
        date="PROJ AUG ’26"
        amount="$0 follow-on"
        pre="$250M pre · 65%"
        projected
      />
      {/* Exit */}
      <Node
        x={1080}
        r={9}
        label="EXIT"
        date="PROJ FEB ’31"
        amount="$1.25B base"
        pre="11.82× MOIC"
      />

      <rect width="1180" height="200" fill="url(#pv2-tr-grain)" />
    </svg>
  );
}

function Node({
  x,
  r,
  label,
  date,
  amount,
  pre,
  big,
  projected,
}: {
  x: number;
  r: number;
  label: string;
  date: string;
  amount: string;
  pre: string;
  big?: boolean;
  projected?: boolean;
}) {
  return (
    <g fontFamily="JetBrains Mono" fontSize="10" fill={presson.color.textMuted} letterSpacing="0.06em">
      {projected ? (
        <circle
          cx={x}
          cy="120"
          r={r}
          fill="none"
          stroke={presson.color.text}
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      ) : (
        <circle cx={x} cy="120" r={r} fill={presson.color.text} />
      )}
      <text
        x={x}
        y="146"
        textAnchor="middle"
        fill={presson.color.text}
        fontWeight={big ? 700 : 500}
        letterSpacing="0.08em"
      >
        {label}
      </text>
      <text x={x} y="160" textAnchor="middle">
        {date}
      </text>
      <text
        x={x}
        y="100"
        textAnchor="middle"
        fill={presson.color.text}
        fontFamily="Inter"
        fontSize="12"
        fontWeight="600"
        letterSpacing="-0.01em"
      >
        {amount}
      </text>
      <text x={x} y="86" textAnchor="middle">
        {pre}
      </text>
    </g>
  );
}
