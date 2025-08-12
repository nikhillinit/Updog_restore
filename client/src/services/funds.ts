// client/src/services/funds.ts
import { emitTelemetry } from '../lib/telemetry';

export interface FundCreatePayload {
  // keep aligned with your backend
  basics: any;
  stages: Array<{ name: string; graduate: number; exit: number; months: number }>;
  followOnChecks?: { A: number; B: number; C: number };
  modelVersion: string;
}

export async function createFund(payload: FundCreatePayload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);

  try {
    const res = await fetch('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      emitTelemetry({
        category: 'fund',
        event: 'create_failed',
        ok: false,
        meta: { status: res.status, body }
      });
      throw new Error(`Create fund failed: ${res.status} ${body}`);
    }

    const json = await res.json();
    emitTelemetry({
      category: 'fund',
      event: 'created',
      ok: true,
      meta: {
        stages: payload.stages.length,
        modelVersion: payload.modelVersion ?? 'reserves-ev1',
      }
    });
    return json;
  } finally {
    clearTimeout(t);
  }
}
