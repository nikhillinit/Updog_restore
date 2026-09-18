import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  values: vi.fn(),
  recordError: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: {
    insert: vi.fn(() => ({ values: state.values })),
  },
}));

vi.mock('../../../server/observability/lp-metrics', () => ({
  recordError: state.recordError,
}));

import { LPAuditLogger } from '../../../server/services/lp-audit-logger';

describe('LP audit persistence policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('measures failed availability-first reads', async () => {
    state.values.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(new LPAuditLogger().logDocumentsListView(7, undefined)).resolves.toBeUndefined();
    expect(state.recordError).toHaveBeenCalledWith(
      'lp_audit_logger',
      'AUDIT_PERSISTENCE_FAILURE',
      500
    );
  });

  it('fails closed when a document download audit cannot persist', async () => {
    state.values.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(new LPAuditLogger().logDocumentDownload(7, 'doc-1', undefined)).rejects.toThrow(
      'database unavailable'
    );
    expect(state.recordError).toHaveBeenCalledOnce();
  });

  it.each(['payment', 'preferences', 'wire instructions'] as const)(
    'fails closed when the %s audit cannot persist',
    async (operation) => {
      state.values.mockRejectedValueOnce(new Error('database unavailable'));
      const logger = new LPAuditLogger();
      const result =
        operation === 'payment'
          ? logger.logPaymentSubmission(7, 'call-1', 'submission-1', '9')
          : operation === 'preferences'
            ? logger.logNotificationPrefsUpdate(7, '9')
            : logger.logWireInstructionsAccess(7, 'call-1', '9');
      await expect(result).rejects.toThrow('database unavailable');
      expect(state.recordError).toHaveBeenCalledOnce();
    }
  );

  it('measures audit loss without inviting resubmission of an already queued report', async () => {
    state.values.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      new LPAuditLogger().logReportGeneration(7, 'report-1', 'quarterly', '9')
    ).resolves.toBeUndefined();
    expect(state.recordError).toHaveBeenCalledWith(
      'lp_audit_logger',
      'AUDIT_PERSISTENCE_FAILURE',
      500
    );
  });
});
