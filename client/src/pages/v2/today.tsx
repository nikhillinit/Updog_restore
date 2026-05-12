import { AppShell } from '@/components/presson-v2/AppShell';
import { Btn } from '@/components/presson-v2/primitives';
import { decisions, watchList } from '@/components/presson-v2/mock';

/**
 * Today · Press On v2 dashboard.
 *
 * Aesthetic: editorial broadsheet for capital allocators.
 * The thesis-statement headline IS the dashboard. Truth-line reads as a
 * Bloomberg-style ticker. Decisions render as a numbered editorial list.
 */
export default function TodayV2() {
  return (
    <AppShell>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Masthead — broadsheet folio line */}
        <header className="pv2-masthead">
          <div className="pv2-masthead-l">
            <span>
              <span className="pv2-masthead-pulse" />
              LIVE · SYNCED 2 MIN AGO
            </span>
            <span>KRAKATOA VENTURES · FUND II · VINTAGE 2021</span>
          </div>
          <div className="pv2-masthead-r">
            <span>VOL XII · NO 132</span>
            <span>MON · MAY 12 · 2026</span>
            <Btn>Export</Btn>
            <Btn primary kbd="⌘N">
              New scenario
            </Btn>
          </div>
        </header>

        {/* Hero · thesis */}
        <section className="pv2-hero">
          <div>
            <h1 className="pv2-thesis">
              You&rsquo;re <em>on plan</em>,
              <br />
              behind by <em>two quarters</em>.
            </h1>
            <p className="pv2-hero-sub">
              Reserve deployment is <em>6.7% under pace</em> against the 2021 construction plan.{' '}
              <em>Four decisions</em> sit on the desk &mdash; two of them due Friday. The fund is
              still tracking toward a 3.05× TVPI.
            </p>
          </div>
          <div className="pv2-hero-stamp">
            PROJECTED FUND VALUE
            <span className="pv2-hero-bigfig">$535.1M</span>
            <span style={{ display: 'block', marginTop: 6, color: 'var(--pv2-pos)' }}>
              ▲ +$12.4M week
            </span>
          </div>
        </section>

        {/* Ticker — borderless truth-line */}
        <section className="pv2-ticker">
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">TVPI</div>
            <div className="pv2-ticker-v">
              3.05<span className="unit">×</span>
            </div>
            <div className="pv2-ticker-d pos">▲ +0.04 wk</div>
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">GROSS MOIC</div>
            <div className="pv2-ticker-v">
              3.57<span className="unit">×</span>
            </div>
            <div className="pv2-ticker-d pos">▲ +0.06 wk</div>
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">IRR</div>
            <div className="pv2-ticker-v">
              22.4<span className="unit">%</span>
            </div>
            <div className="pv2-ticker-d pos">▲ +0.8 vs Q1</div>
          </div>
          <div className="pv2-ticker-cell warm">
            <div className="pv2-ticker-k">RESERVE RATIO</div>
            <div className="pv2-ticker-v">
              48.2<span className="unit">%</span>
            </div>
            <div className="pv2-ticker-d neg">▼ −6.7 vs plan</div>
          </div>
          <div className="pv2-ticker-cell">
            <div className="pv2-ticker-k">CAPITAL REMAINING</div>
            <div className="pv2-ticker-v">
              $77.6<span className="unit">M</span>
            </div>
            <div className="pv2-ticker-d mute">52% of fund</div>
          </div>
        </section>

        {/* §01 · Capital pacing — single dominant figure */}
        <div className="pv2-section pv2-d1">
          <span className="pv2-section-num">§01</span>
          <span className="pv2-section-ttl">Capital pacing</span>
          <span className="pv2-section-meta">DEPLOYED $42.6M · OF $120.3M INVESTABLE</span>
        </div>
        <figure className="pv2-figure pv2-d1">
          <PacingChart />
          <figcaption className="pv2-figure-caption">
            <b>The fund is two quarters behind plan.</b> Capital deployment has slowed since
            Q4&nbsp;&rsquo;24 as bridge requests displace new initial checks. Forecast assumes the
            construction plan reasserts by year-end.
          </figcaption>
        </figure>

        {/* §02 · Decisions */}
        <div className="pv2-section pv2-d2">
          <span className="pv2-section-num">§02</span>
          <span className="pv2-section-ttl">On the desk</span>
          <span className="pv2-section-meta">4 PENDING · 2 DUE FRIDAY</span>
        </div>
        <ol
          className="pv2-decisions pv2-d2"
          style={{ margin: 0, padding: '4px 32px 32px', listStyle: 'none' }}
        >
          {decisions.map((d, i) => (
            <li key={d.title} className="pv2-decision">
              <span className={`pv2-decision-num${i > 1 ? ' muted' : ''}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="pv2-decision-body">
                <h4>{d.title}</h4>
                <p>{d.sub}</p>
              </div>
              <span className={`pv2-decision-due${d.urgent ? ' urgent' : ''}`}>{d.due}</span>
            </li>
          ))}
        </ol>

        {/* §03 · Watch */}
        <div className="pv2-section pv2-d3">
          <span className="pv2-section-num">§03</span>
          <span className="pv2-section-ttl">Outside the band</span>
          <span className="pv2-section-meta">7 OF 57 COMPANIES · SORTED BY DEVIATION</span>
        </div>
        <div className="pv2-watch pv2-d3">
          <table>
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Company</th>
                <th>Stage</th>
                <th className="n">FMV</th>
                <th className="n">MOIC</th>
                <th className="n">ARR / Δ</th>
                <th className="n">Runway</th>
                <th>Trigger</th>
                <th>Last note</th>
              </tr>
            </thead>
            <tbody>
              {watchList.map((w) => (
                <WatchRow key={w.name} w={w} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Colophon */}
        <footer className="pv2-colophon">
          <span>
            <b>UPDOG</b> · PRESS ON VENTURES · DESIGN PHILOSOPHY v2
          </span>
          <span>SET IN INTER &amp; POPPINS · DATA AS OF MAY 12, 09:14</span>
        </footer>
      </div>
    </AppShell>
  );
}

/**
 * Pacing chart — the lead figure. Plan band, actual, and forecast share
 * a single canvas; "NOW" is a vertical rule and a callout.
 */
function PacingChart() {
  return (
    <svg
      viewBox="0 0 1200 320"
      preserveAspectRatio="none"
      style={{ width: '100%', height: 360, display: 'block' }}
      aria-label="Capital pacing: actual versus plan and forecast"
    >
      <defs>
        <pattern id="pv2-grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="transparent" />
          <circle cx="0.5" cy="0.5" r="0.3" fill="rgba(41,41,41,0.04)" />
        </pattern>
      </defs>

      {/* gridlines */}
      <g stroke="#EEE9E3" strokeWidth="1">
        <line x1="0" y1="70" x2="1200" y2="70" />
        <line x1="0" y1="140" x2="1200" y2="140" />
        <line x1="0" y1="210" x2="1200" y2="210" />
        <line x1="0" y1="280" x2="1200" y2="280" />
      </g>

      {/* y-axis labels */}
      <g fontFamily="JetBrains Mono" fontSize="9.5" fill="#A8A8A8" letterSpacing="0.1em">
        <text x="6" y="66">
          $120M
        </text>
        <text x="6" y="136">
          $90M
        </text>
        <text x="6" y="206">
          $60M
        </text>
        <text x="6" y="276">
          $30M
        </text>
      </g>

      {/* Plan band (the construction plan envelope) */}
      <path
        d="M0,260 L200,220 L400,180 L600,140 L800,100 L1000,68 L1200,40 L1200,55 L1000,82 L800,118 L600,158 L400,200 L200,238 L0,275 Z"
        fill="#E0D8D1"
        opacity="0.85"
      />
      {/* Grain overlay */}
      <rect width="1200" height="320" fill="url(#pv2-grain)" />

      {/* Plan line (dashed) */}
      <path
        d="M0,267 L200,229 L400,190 L600,149 L800,109 L1000,75 L1200,47"
        stroke="#292929"
        strokeWidth="1"
        strokeDasharray="4 4"
        fill="none"
      />

      {/* Actual (solid) */}
      <path
        d="M0,294 L100,290 L200,272 L300,255 L400,242 L500,226 L600,210"
        stroke="#292929"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Forecast (dashed continuation) */}
      <path
        d="M600,210 L720,194 L840,174 L960,150 L1080,118 L1200,82"
        stroke="#292929"
        strokeWidth="1.6"
        strokeDasharray="6 5"
        fill="none"
        strokeLinecap="round"
      />

      {/* NOW vertical rule */}
      <line x1="600" y1="20" x2="600" y2="300" stroke="#292929" strokeWidth="1" />
      <text
        x="606"
        y="32"
        fontFamily="JetBrains Mono"
        fontSize="10"
        fill="#292929"
        letterSpacing="0.1em"
      >
        NOW · Q2&rsquo;26
      </text>

      {/* Callout */}
      <circle cx="600" cy="210" r="5" fill="#292929" />
      <line x1="612" y1="204" x2="660" y2="178" stroke="#292929" strokeWidth="1" />
      <text
        x="668"
        y="174"
        fontFamily="Inter"
        fontSize="14"
        fontWeight="700"
        fill="#292929"
        letterSpacing="-0.01em"
      >
        $42.6M actual
      </text>
      <text
        x="668"
        y="190"
        fontFamily="JetBrains Mono"
        fontSize="10"
        fill="#7A7A7A"
        letterSpacing="0.06em"
      >
        vs $48.6M plan · −6.7%
      </text>

      {/* x-axis */}
      <g fontFamily="JetBrains Mono" fontSize="10" fill="#A8A8A8" letterSpacing="0.1em">
        <text x="0" y="316">
          &rsquo;21
        </text>
        <text x="200" y="316">
          &rsquo;22
        </text>
        <text x="400" y="316">
          &rsquo;23
        </text>
        <text x="600" y="316">
          &rsquo;24
        </text>
        <text x="800" y="316">
          &rsquo;25
        </text>
        <text x="1000" y="316">
          &rsquo;26
        </text>
        <text x="1170" y="316">
          &rsquo;27
        </text>
      </g>

      {/* legend */}
      <g fontFamily="JetBrains Mono" fontSize="10" fill="#7A7A7A" letterSpacing="0.08em">
        <line x1="900" y1="304" x2="922" y2="304" stroke="#292929" strokeWidth="2.5" />
        <text x="930" y="308">
          ACTUAL
        </text>
        <line
          x1="990"
          y1="304"
          x2="1012"
          y2="304"
          stroke="#292929"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text x="1020" y="308">
          PLAN
        </text>
        <line
          x1="1070"
          y1="304"
          x2="1092"
          y2="304"
          stroke="#292929"
          strokeWidth="1.6"
          strokeDasharray="6 5"
        />
        <text x="1100" y="308">
          FORECAST
        </text>
      </g>
    </svg>
  );
}

type WatchItem = (typeof watchList)[number];

function WatchRow({ w }: { w: WatchItem }) {
  const arrColor = w.arrNeg ? 'var(--pv2-neg)' : 'var(--pv2-pos)';
  const triggerCls = `pv2-tag${w.trigger === 'RUNWAY' || w.trigger === 'ARR' ? ' active' : ''}`;
  const hbarCls = `pv2-hbar${w.runwayNeg ? ' neg' : ''}`;
  return (
    <tr>
      <td>
        <span className="co">{w.name}</span>
        <span className="co-sub">{w.sector}</span>
      </td>
      <td className="pv2-mono" style={{ fontSize: 11, color: 'var(--pv2-mute)' }}>
        {w.stage}
      </td>
      <td className="n">{w.fmv}</td>
      <td className="n">{w.moic}</td>
      <td className="n">
        {w.arr} <span style={{ color: arrColor }}>{w.arrDelta}</span>
      </td>
      <td className="n">
        <span className={hbarCls} style={{ width: w.runway * 4 }} /> {w.runway}mo
      </td>
      <td>
        <span className={triggerCls}>{w.trigger}</span>
      </td>
      <td className="pv2-mono" style={{ color: 'var(--pv2-mute)', fontSize: 11 }}>
        {w.note}
      </td>
    </tr>
  );
}
