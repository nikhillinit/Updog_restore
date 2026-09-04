import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTUALS_LEDGER_TEMPLATE_HEADER,
  ACTUALS_LEDGER_TEMPLATE_SHA256,
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_HEADER,
  ACTUALS_VALUATION_TEMPLATE_SHA256,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import { sha256Bytes } from '../../../../server/lib/sha256-bytes';

const templates = [
  {
    fileName: 'actuals-ledger-1.0.0.csv',
    header: ACTUALS_LEDGER_TEMPLATE_HEADER,
    version: ACTUALS_LEDGER_TEMPLATE_VERSION,
    manifestDigest: ACTUALS_LEDGER_TEMPLATE_SHA256,
    expectedDigest: '03988ba4732fddd8c361f1a18802825ba32d04265e3c1b71be971c0caa7217b7',
  },
  {
    fileName: 'actuals-valuation-1.0.0.csv',
    header: ACTUALS_VALUATION_TEMPLATE_HEADER,
    version: ACTUALS_VALUATION_TEMPLATE_VERSION,
    manifestDigest: ACTUALS_VALUATION_TEMPLATE_SHA256,
    expectedDigest: '767b6f013b95ce29e21edc2d6a9305415c13b0dcfb2c50eca69f14ca510cc34f',
  },
] as const;

describe('actuals pilot templates', () => {
  it.each(templates)('$fileName matches its pinned header and digest', ({
    fileName,
    header,
    version,
    manifestDigest,
    expectedDigest,
  }) => {
    const payload = fs.readFileSync(path.join(process.cwd(), 'client/public/templates', fileName));

    expect(payload.toString('utf8')).toBe(`${header}\n`);
    expect(version).toMatch(/^actuals-(ledger|valuation)\/1\.0\.0$/);
    expect(manifestDigest).toBe(expectedDigest);
    expect(sha256Bytes(payload)).toBe(expectedDigest);
  });
});
