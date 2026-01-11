import type { Request, Response } from 'express';
import express from 'express';
import { FundModelInputsSchema } from '@shared/schemas/fund-model';
import type { FundModelInputs, PeriodResult } from '@shared/schemas/fund-model';
import { formatForCSV } from '@shared/lib/decimal-utils';
// TODO: Issue #309 - Move fund-calc to shared package
// For now, import from client (ESLint boundary violation - tracked for refactoring)
// eslint-disable-next-line no-restricted-imports -- Issue #309 tracked for refactoring to shared package
import { runFundModel } from '../../client/src/lib/fund-calc.js';

const router = express.Router();

/**
 * Type guard to check if error is a ZodError
 */
function isZodError(error: unknown): error is { name: 'ZodError'; errors: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ZodError'
  );
}

/**
 * Type guard to check if error has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Convert period results to CSV format
 */
function convertToCSV(periodResults: PeriodResult[]): string {
  const headers = [
    'periodIndex',
    'periodStart',
    'periodEnd',
    'contributions',
    'investments',
    'managementFees',
    'exitProceeds',
    'distributions',
    'unrealizedPnl',
    'nav',
    'tvpi',
    'dpi',
    'irrAnnualized'
  ].join(',');

  const rows = periodResults.map(period => [
    period.periodIndex,
    period.periodStart,
    period.periodEnd,
    formatForCSV(period.contributions, 'currency'),
    formatForCSV(period.investments, 'currency'),
    formatForCSV(period.managementFees, 'currency'),
    formatForCSV(period.exitProceeds, 'currency'),
    formatForCSV(period.distributions, 'currency'),
    formatForCSV(period.unrealizedPnl, 'currency'),
    formatForCSV(period.nav, 'currency'),
    formatForCSV(period.tvpi, 'ratio'),
    formatForCSV(period.dpi, 'ratio'),
    formatForCSV(period.irrAnnualized, 'percent')
  ].join(','));

  return [headers, ...rows].join('\n');
}

/**
 * POST /api/calculations/export-csv
 */
router["post"]('/export-csv', async (req: Request, res: Response) => {
  try {
    const inputs: FundModelInputs = FundModelInputsSchema.parse(req.body);
    const outputs = runFundModel(inputs);
    const csv = convertToCSV(outputs.periodResults);

    res["setHeader"]('Content-Type', 'text/csv');
    res["setHeader"]('Content-Disposition', 'attachment; filename="fund-model-export.csv"');
    res["status"](200)["send"](csv);
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res["status"](400)["json"]({
        error: 'validation_error',
        message: 'Invalid fund model inputs',
        details: error.errors
      });
    }

    if (hasMessage(error) && error.message.includes('not yet implemented')) {
      return res["status"](501)["json"]({
        error: 'not_implemented',
        message: error.message
      });
    }

    console.error('CSV export error:', error);
    res["status"](500)["json"]({
      error: 'internal_error',
      message: 'Failed to generate CSV export'
    });
  }
});

/**
 * POST /api/calculations/run
 */
router["post"]('/run', async (req: Request, res: Response) => {
  try {
    const inputs: FundModelInputs = FundModelInputsSchema.parse(req.body);
    const outputs = runFundModel(inputs);
    res["status"](200)["json"](outputs);
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res["status"](400)["json"]({
        error: 'validation_error',
        message: 'Invalid fund model inputs',
        details: error.errors
      });
    }

    if (hasMessage(error) && error.message.includes('not yet implemented')) {
      return res["status"](501)["json"]({
        error: 'not_implemented',
        message: error.message
      });
    }

    console.error('Fund calculation error:', error);
    res["status"](500)["json"]({
      error: 'internal_error',
      message: 'Failed to run fund model'
    });
  }
});

export default router;
