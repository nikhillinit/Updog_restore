import type { Request, Response } from 'express';
import express from 'express';
import { FundModelInputsSchema } from '@shared/schemas/fund-model';
import type { FundModelInputs } from '@shared/schemas/fund-model';
import { runFundModel } from '../../client/src/lib/fund-calc.js';
import { formatForCSV } from '../../client/src/lib/decimal-utils.js';

const router = express.Router();

/**
 * Convert period results to CSV format
 */
function convertToCSV(periodResults: any[]): string {
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
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res["status"](400)["json"]({
        error: 'validation_error',
        message: 'Invalid fund model inputs',
        details: error.errors
      });
    }

    if (error.message?.includes('not yet implemented')) {
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
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res["status"](400)["json"]({
        error: 'validation_error',
        message: 'Invalid fund model inputs',
        details: error.errors
      });
    }

    if (error.message?.includes('not yet implemented')) {
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
