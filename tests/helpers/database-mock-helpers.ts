/**
 * Helper functions for database mock normalization
 * Handles conversion between Postgres and JavaScript types
 */

/**
 * Parse a Postgres array literal like '{"a","b"}' safely into a JS array
 */
export function parsePgTextArray(lit: unknown): string[] | undefined {
  if (lit == null) return undefined;
  if (Array.isArray(lit)) return lit as string[];
  const s = String(lit).trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return undefined;
  // naive but works: split on commas that aren't inside quotes
  const body = s.slice(1, -1);
  if (!body) return [];
  // remove wrapping quotes if present
  return body.split(',').map((token) => {
    const t = token.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  });
}

/**
 * Deterministic stringify for JSONB if you ever need string mode
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const stringify = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v.map(stringify);
      return Object.keys(v).sort().reduce((acc, k) => {
        acc[k] = stringify(v[k]);
        return acc;
      }, {} as Record<string, unknown>);
    }
    return v;
  };
  return JSON.stringify(stringify(value));
}

/**
 * Column type mappings
 */
export const JSONB_COLS: Record<string, Set<string>> = {
  fund_state_snapshots: new Set(['portfolio_state','fund_metrics','metadata']),
  snapshot_comparisons: new Set(['value_changes','portfolio_changes','insights']),
  timeline_events:      new Set(['event_data','impact_metrics']),
  state_restoration_logs: new Set(['changes_applied','before_state','after_state','affected_entities']),
};

export const ARRAY_COLS: Record<string, Set<string>> = {
  fund_state_snapshots: new Set(['tags']),
};

/**
 * Coerce inbound values (INSERT params) to JS objects/arrays
 */
export function coerceIn(table: string, row: Record<string, unknown>) {
  for (const [k, v] of Object.entries(row)) {
    if (JSONB_COLS[table]?.has(k) && typeof v === 'string') {
      try { row[k] = JSON.parse(v as string); } catch {}
    }
    if (ARRAY_COLS[table]?.has(k)) {
      const parsed = parsePgTextArray(v);
      if (parsed) row[k] = parsed;
    }
  }
  return row;
}

/**
 * Normalize outbound rows to what tests expect (prefer JS objects/arrays)
 */
export function normalizeOut(table: string, row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (JSONB_COLS[table]?.has(k) && typeof v === 'string') {
      try { out[k] = JSON.parse(v as string); } catch { /* keep string */ }
    }
    if (ARRAY_COLS[table]?.has(k)) {
      const parsed = parsePgTextArray(v);
      if (parsed) out[k] = parsed;
    }
  }
  return out;
}