import { Decimal } from '@shared/lib/decimal-utils';
import type { PerformanceAlert } from '@shared/schema';

export interface TriggeredAlertData {
  ruleId: string;
  ruleName?: string;
  metricName: string;
  thresholdValue: number;
  actualValue: number | null;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
}

function isTriggeredAlertSeverity(value: unknown): value is TriggeredAlertData['severity'] {
  return value === 'info' || value === 'warning' || value === 'critical' || value === 'urgent';
}

export function normalizeTriggeredAlertSeverity(value: unknown): TriggeredAlertData['severity'] {
  return isTriggeredAlertSeverity(value) ? value : 'warning';
}

export function hasReturningQuery(
  value: unknown
): value is { returning: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'returning' in value &&
    typeof (value as { returning?: unknown }).returning === 'function'
  );
}

export function hasExecuteQuery(
  value: unknown
): value is { execute: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'execute' in value &&
    typeof (value as { execute?: unknown }).execute === 'function'
  );
}

export function toNullableDecimalString(
  value: Decimal | string | number | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value instanceof Decimal ? value.toString() : String(value);
}

export function isEmptyConfigPayload(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}
