import { logger } from '../../lib/logger';
import type { RankedReserveShadowTelemetry } from './ranked-reserve-orchestrator';

export interface RankedReserveShadowTelemetryEvent extends RankedReserveShadowTelemetry {
  fundId: number;
  asOfDate: string;
}

export interface RankedReserveShadowLogger {
  info(bindings: RankedReserveShadowTelemetryEvent, message: string): void;
}

export function emitRankedShadowTelemetry(
  input: { fundId: number; asOfDate: string; telemetry: RankedReserveShadowTelemetry },
  log: RankedReserveShadowLogger = logger
): void {
  try {
    log.info(
      {
        fundId: input.fundId,
        asOfDate: input.asOfDate,
        totalAllocationDeltaCents: input.telemetry.totalAllocationDeltaCents,
        rankAgreement: input.telemetry.rankAgreement,
        excludedCountsByReason: input.telemetry.excludedCountsByReason,
        envelopeInputHash: input.telemetry.envelopeInputHash.slice(0, 12),
        factsInputHash: input.telemetry.factsInputHash.slice(0, 12),
        assumptionsHash: input.telemetry.assumptionsHash.slice(0, 12),
      },
      'ranked reserve shadow comparison generated'
    );
  } catch {
    return;
  }
}
