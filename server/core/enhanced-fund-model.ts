/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Minimal placeholder so the endpoint compiles.
// Wire to your real model once ready.
import { getConfig } from '../config';

export type FundModelInput = Record<string, unknown>;
export type FundModelResult = { result: Record<string, unknown> };

export class EnhancedFundModel {
  constructor(private input: FundModelInput) {}

  async calculate(_opts?: { signal?: AbortSignal; onProgress?: (_p: number) => void }): Promise<FundModelResult> {
    const started = Date.now();
    
    // Only add artificial delay in non-demo mode
    const { DEMO_MODE } = getConfig();
    if (!DEMO_MODE) {
      // Simulate some work
      await new Promise((r: any) => setTimeout(r, 50));
    }
    
    return {
      result: {
        tvpi: 2.5,
        input: this.input,
        durationMs: Date.now() - started
      }
    };
  }
}
