/**
 * Unit tests for reallocation utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  hasBlockingErrors,
  getBlockingErrors,
  formatDelta,
  getDeltaColorClass,
  getDeltaIcon,
  formatPercentChange,
  getWarningIcon,
  getWarningBadgeVariant,
  sortDeltasByMagnitude,
  groupWarningsBySeverity,
  calculateTotalDelta,
  canCommit,
} from '../reallocation-utils';
import type {
  ReallocationPreviewResponse,
  ReallocationDelta,
  ReallocationWarning,
} from '@/types/reallocation';

describe('reallocation-utils', () => {
  describe('hasBlockingErrors', () => {
    it('should return false when preview data is null', () => {
      expect(hasBlockingErrors(null)).toBe(false);
    });

    it('should return true when validation is invalid', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 0,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [],
        validation: {
          is_valid: false,
          errors: ['Some error'],
        },
      };

      expect(hasBlockingErrors(preview)).toBe(true);
    });

    it('should return true when there are error severity warnings', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 0,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [
          {
            type: 'cap_exceeded',
            severity: 'error',
            message: 'Cap exceeded',
          },
        ],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(hasBlockingErrors(preview)).toBe(true);
    });

    it('should return false when there are only warning severity warnings', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 0,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [
          {
            type: 'high_concentration',
            severity: 'warning',
            message: 'High concentration',
          },
        ],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(hasBlockingErrors(preview)).toBe(false);
    });
  });

  describe('getBlockingErrors', () => {
    it('should return empty array when preview data is null', () => {
      expect(getBlockingErrors(null)).toEqual([]);
    });

    it('should return validation errors', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 0,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [],
        validation: {
          is_valid: false,
          errors: ['Error 1', 'Error 2'],
        },
      };

      expect(getBlockingErrors(preview)).toEqual(['Error 1', 'Error 2']);
    });

    it('should return error severity warning messages', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 0,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [
          {
            type: 'cap_exceeded',
            severity: 'error',
            message: 'Cap exceeded',
          },
        ],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(getBlockingErrors(preview)).toEqual(['Cap exceeded']);
    });
  });

  describe('formatDelta', () => {
    it('should format positive delta with sign', () => {
      expect(formatDelta(100000, { showSign: true })).toContain('+');
      expect(formatDelta(100000, { showSign: true })).toContain('1,000');
    });

    it('should format negative delta with sign', () => {
      expect(formatDelta(-100000, { showSign: true })).toContain('-');
      expect(formatDelta(-100000, { showSign: true })).toContain('1,000');
    });

    it('should format zero delta without sign', () => {
      expect(formatDelta(0, { showSign: true })).not.toContain('+');
      expect(formatDelta(0, { showSign: true })).not.toContain('-');
    });

    it('should format without sign when showSign is false', () => {
      const result = formatDelta(100000, { showSign: false });
      expect(result).not.toContain('+');
    });
  });

  describe('getDeltaColorClass', () => {
    it('should return green for positive delta', () => {
      expect(getDeltaColorClass(100)).toBe('text-green-600');
    });

    it('should return red for negative delta', () => {
      expect(getDeltaColorClass(-100)).toBe('text-red-600');
    });

    it('should return gray for zero delta', () => {
      expect(getDeltaColorClass(0)).toBe('text-gray-500');
    });
  });

  describe('getDeltaIcon', () => {
    it('should return up arrow for increased', () => {
      expect(getDeltaIcon('increased')).toBe('↑');
    });

    it('should return down arrow for decreased', () => {
      expect(getDeltaIcon('decreased')).toBe('↓');
    });

    it('should return right arrow for unchanged', () => {
      expect(getDeltaIcon('unchanged')).toBe('→');
    });
  });

  describe('formatPercentChange', () => {
    it('should format positive percentage with sign', () => {
      expect(formatPercentChange(25.5)).toBe('+25.50%');
    });

    it('should format negative percentage with sign', () => {
      expect(formatPercentChange(-15.75)).toBe('-15.75%');
    });

    it('should format zero percentage without sign', () => {
      expect(formatPercentChange(0)).toBe('0.00%');
    });
  });

  describe('getWarningIcon', () => {
    it('should return X icon for error severity', () => {
      expect(getWarningIcon('error')).toBe('❌');
    });

    it('should return warning icon for warning severity', () => {
      expect(getWarningIcon('warning')).toBe('⚠️');
    });
  });

  describe('getWarningBadgeVariant', () => {
    it('should return destructive for error severity', () => {
      expect(getWarningBadgeVariant('error')).toBe('destructive');
    });

    it('should return secondary for warning severity', () => {
      expect(getWarningBadgeVariant('warning')).toBe('secondary');
    });
  });

  describe('sortDeltasByMagnitude', () => {
    it('should sort deltas by absolute value', () => {
      const deltas: ReallocationDelta[] = [
        {
          company_id: 1,
          company_name: 'A',
          from_cents: 0,
          to_cents: 10000,
          delta_cents: 10000,
          delta_pct: 100,
          status: 'increased',
        },
        {
          company_id: 2,
          company_name: 'B',
          from_cents: 50000,
          to_cents: 20000,
          delta_cents: -30000,
          delta_pct: -60,
          status: 'decreased',
        },
        {
          company_id: 3,
          company_name: 'C',
          from_cents: 0,
          to_cents: 5000,
          delta_cents: 5000,
          delta_pct: 50,
          status: 'increased',
        },
      ];

      const sorted = sortDeltasByMagnitude(deltas);

      expect(sorted[0].company_name).toBe('B'); // -30000
      expect(sorted[1].company_name).toBe('A'); // 10000
      expect(sorted[2].company_name).toBe('C'); // 5000
    });

    it('should not mutate original array', () => {
      const deltas: ReallocationDelta[] = [
        {
          company_id: 1,
          company_name: 'A',
          from_cents: 0,
          to_cents: 10000,
          delta_cents: 10000,
          delta_pct: 100,
          status: 'increased',
        },
      ];

      const sorted = sortDeltasByMagnitude(deltas);
      expect(sorted).not.toBe(deltas);
    });
  });

  describe('groupWarningsBySeverity', () => {
    it('should group warnings by severity', () => {
      const warnings: ReallocationWarning[] = [
        {
          type: 'cap_exceeded',
          severity: 'error',
          message: 'Error 1',
        },
        {
          type: 'high_concentration',
          severity: 'warning',
          message: 'Warning 1',
        },
        {
          type: 'negative_delta',
          severity: 'error',
          message: 'Error 2',
        },
      ];

      const grouped = groupWarningsBySeverity(warnings);

      expect(grouped.errors).toHaveLength(2);
      expect(grouped.warnings).toHaveLength(1);
    });
  });

  describe('calculateTotalDelta', () => {
    it('should sum all deltas', () => {
      const deltas: ReallocationDelta[] = [
        {
          company_id: 1,
          company_name: 'A',
          from_cents: 0,
          to_cents: 10000,
          delta_cents: 10000,
          delta_pct: 100,
          status: 'increased',
        },
        {
          company_id: 2,
          company_name: 'B',
          from_cents: 50000,
          to_cents: 20000,
          delta_cents: -30000,
          delta_pct: -60,
          status: 'decreased',
        },
      ];

      expect(calculateTotalDelta(deltas)).toBe(-20000);
    });

    it('should return zero for empty array', () => {
      expect(calculateTotalDelta([])).toBe(0);
    });
  });

  describe('canCommit', () => {
    it('should return false when preview data is null', () => {
      expect(canCommit(null, 'Some reason')).toBe(false);
    });

    it('should return false when reason is empty', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [
          {
            company_id: 1,
            company_name: 'A',
            from_cents: 0,
            to_cents: 10000,
            delta_cents: 10000,
            delta_pct: 100,
            status: 'increased',
          },
        ],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 10000,
          delta_cents: 10000,
          delta_pct: 100,
        },
        warnings: [],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(canCommit(preview, '')).toBe(false);
      expect(canCommit(preview, '   ')).toBe(false);
    });

    it('should return false when there are blocking errors', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [
          {
            company_id: 1,
            company_name: 'A',
            from_cents: 0,
            to_cents: 10000,
            delta_cents: 10000,
            delta_pct: 100,
            status: 'increased',
          },
        ],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 10000,
          delta_cents: 10000,
          delta_pct: 100,
        },
        warnings: [],
        validation: {
          is_valid: false,
          errors: ['Some error'],
        },
      };

      expect(canCommit(preview, 'Some reason')).toBe(false);
    });

    it('should return false when there are no changes', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [
          {
            company_id: 1,
            company_name: 'A',
            from_cents: 10000,
            to_cents: 10000,
            delta_cents: 0,
            delta_pct: 0,
            status: 'unchanged',
          },
        ],
        totals: {
          total_allocated_before: 10000,
          total_allocated_after: 10000,
          delta_cents: 0,
          delta_pct: 0,
        },
        warnings: [],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(canCommit(preview, 'Some reason')).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      const preview: ReallocationPreviewResponse = {
        deltas: [
          {
            company_id: 1,
            company_name: 'A',
            from_cents: 0,
            to_cents: 10000,
            delta_cents: 10000,
            delta_pct: 100,
            status: 'increased',
          },
        ],
        totals: {
          total_allocated_before: 0,
          total_allocated_after: 10000,
          delta_cents: 10000,
          delta_pct: 100,
        },
        warnings: [
          {
            type: 'high_concentration',
            severity: 'warning',
            message: 'Some warning',
          },
        ],
        validation: {
          is_valid: true,
          errors: [],
        },
      };

      expect(canCommit(preview, 'Valid reason')).toBe(true);
    });
  });
});
