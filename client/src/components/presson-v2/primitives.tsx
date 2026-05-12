import type { ReactNode, CSSProperties } from 'react';

/** Page-level breadcrumb + actions topbar */
export function Topbar({ crumbs, actions }: { crumbs: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pv2-topbar">
      <div className="pv2-crumbs">{crumbs}</div>
      {actions && <div className="pv2-actions">{actions}</div>}
    </div>
  );
}

/** Thesis-style page header — bold editorial h1 with italic accents */
export function PageHeader({
  title,
  sub,
  meta,
}: {
  title: ReactNode;
  sub?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="pv2-pagehd">
      <div>
        <h1>{title}</h1>
        {sub && <div className="pv2-pagehd-sub">{sub}</div>}
      </div>
      {meta && <div className="pv2-pagehd-meta">{meta}</div>}
    </div>
  );
}

/** Single KPI cell inside a truth-line band */
export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaTone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  deltaTone?: 'pos' | 'neg' | 'mute';
}) {
  return (
    <div className="pv2-kpi">
      <div className="pv2-kpi-k">{label}</div>
      <div className="pv2-kpi-v">
        {value}
        {unit && <span className="pv2-kpi-v-unit">{unit}</span>}
      </div>
      {delta && (
        <div
          className={`pv2-kpi-delta${deltaTone === 'pos' ? ' pos' : deltaTone === 'neg' ? ' neg' : ''}`}
          style={deltaTone === 'mute' ? { color: 'var(--pv2-mute)' } : undefined}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/** Truth-line: a single 5-up horizontal strip of canonical metrics */
export function KpiBand({ children }: { children: ReactNode }) {
  return <div className="pv2-kpiband">{children}</div>;
}

/** Generic chart/panel card with a mono uppercase title */
export function ChartCard({
  title,
  meta,
  children,
  style,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="pv2-chart" style={style}>
      <div className="pv2-chart-ttl">
        <span>{title}</span>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/** Small uppercase mono pill */
export function Tag({ children, tone }: { children: ReactNode; tone?: 'active' | 'pos' | 'neg' }) {
  const cls = tone ? `pv2-tag ${tone}` : 'pv2-tag';
  return <span className={cls}>{children}</span>;
}

/** Inline heat strip, used in tables to visualize deviation */
export function Hbar({ width, tone }: { width: number; tone?: 'neg' | 'tint' }) {
  const cls = tone ? `pv2-hbar ${tone}` : 'pv2-hbar';
  return <span className={cls} style={{ width }} />;
}

/** Tight inline sparkline from a normalized path. Pass `endpoint` for the terminal dot. */
export function Sparkline({
  path,
  viewBox = '0 0 200 36',
  height = 36,
  endpoint,
}: {
  path: string;
  viewBox?: string;
  height?: number;
  endpoint?: [number, number];
}) {
  return (
    <svg viewBox={viewBox} style={{ width: '100%', height, display: 'block' }}>
      <path d={path} className="pv2-spark" />
      {endpoint && <circle cx={endpoint[0]} cy={endpoint[1]} r={2.5} fill="var(--pv2-ink)" />}
    </svg>
  );
}

export function Btn({
  children,
  primary,
  kbd,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  primary?: boolean;
  kbd?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={primary ? 'pv2-btn pv2-btn-primary' : 'pv2-btn'}
      onClick={onClick}
    >
      {children}
      {kbd && <span className="pv2-btn-kbd">{kbd}</span>}
    </button>
  );
}
