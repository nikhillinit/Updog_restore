// client/src/services/funds.ts
import { logFeature, logError } from '../lib/telemetry';

export interface FundCreatePayload {
  // keep aligned with your backend
  basics: any;
  stages: Array<{ name: string; graduate: number; exit: number; months: number }>;
  followOnChecks?: { A: number; B: number; C: number };
  modelVersion: string;
}

export async function createFund(payload: FundCreatePayload) {
  try {
    const res = await fetch('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
    }
    const data = await res.json();
    logFeature('fund_created', {
      stages: payload.stages.length,
      modelVersion: payload.modelVersion,
    });
    return data;
  } catch (err) {
    logError(err as Error, { context: 'fund_create_failed' });
    throw err;
  }
}
