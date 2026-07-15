import { describe, expect, it } from 'vitest';
import {
  CompanyScenarioCreateResponseSchema,
  CompanyScenarioListResponseSchema,
  assertCompanyId,
  assertFundId,
  assertScenarioSetId,
  companyScenariosApiPath,
  scenarioApiPath,
  scenarioSetApiPath,
} from '../../../client/src/lib/fund-scenario-workspace-api';

const VALID_UUID = '00000000-0000-0000-0000-000000000111';
const COMPANY_SCENARIO = {
  id: VALID_UUID,
  name: 'Base case',
  version: 4,
  updatedAt: '2026-07-15T10:00:00.000Z',
  isLocked: false,
  caseCount: 2,
};

describe('assertFundId', () => {
  it('accepts numeric strings', () => {
    expect(() => assertFundId('123')).not.toThrow();
  });
  it('rejects non-numeric strings', () => {
    expect(() => assertFundId('abc')).toThrow('Invalid fund ID');
  });
  it('rejects empty string', () => {
    expect(() => assertFundId('')).toThrow('Invalid fund ID');
  });
  it('rejects strings with non-digit characters', () => {
    expect(() => assertFundId('1e1')).toThrow('Invalid fund ID');
  });
});

describe('assertScenarioSetId', () => {
  it('accepts valid UUID', () => {
    expect(() => assertScenarioSetId(VALID_UUID)).not.toThrow();
  });
  it('rejects non-UUID strings', () => {
    expect(() => assertScenarioSetId('not-a-uuid')).toThrow('Invalid scenario set ID');
  });
});

describe('assertCompanyId', () => {
  it('accepts canonical positive safe integers', () => {
    expect(() => assertCompanyId('101')).not.toThrow();
    expect(() => assertCompanyId(String(Number.MAX_SAFE_INTEGER))).not.toThrow();
  });

  it.each(['', '0', '007', '1e3', '-4', 'abc', '9007199254740992'])(
    'rejects non-canonical or unsafe id %s',
    (companyId) => {
      expect(() => assertCompanyId(companyId)).toThrow('Invalid company ID');
    }
  );
});

describe('scenarioApiPath', () => {
  it('builds correct path for valid fundId', () => {
    expect(scenarioApiPath('123', '/scenario-sets')).toBe('/api/funds/123/scenario-sets');
  });
  it('throws for invalid fundId', () => {
    expect(() => scenarioApiPath('abc', '/scenario-sets')).toThrow('Invalid fund ID');
  });
});

describe('scenarioSetApiPath', () => {
  it('builds correct path for valid ids', () => {
    expect(scenarioSetApiPath('123', VALID_UUID)).toBe(
      `/api/funds/123/scenario-sets/${VALID_UUID}`
    );
  });
  it('appends suffix when provided', () => {
    expect(scenarioSetApiPath('123', VALID_UUID, '/calculate')).toBe(
      `/api/funds/123/scenario-sets/${VALID_UUID}/calculate`
    );
  });
});

describe('companyScenariosApiPath', () => {
  it('builds the company-scoped scenario route', () => {
    expect(companyScenariosApiPath('101')).toBe('/api/companies/101/scenarios');
  });

  it('rejects an unsafe company id before building the route', () => {
    expect(() => companyScenariosApiPath('9007199254740992')).toThrow('Invalid company ID');
  });
});

describe('company scenario response contracts', () => {
  it('accepts the strict list and create-new response shapes', () => {
    expect(CompanyScenarioListResponseSchema.parse([COMPANY_SCENARIO])).toEqual([
      COMPANY_SCENARIO,
    ]);
    expect(
      CompanyScenarioCreateResponseSchema.parse({ scenario: COMPANY_SCENARIO, replay: false })
    ).toEqual({ scenario: COMPANY_SCENARIO, replay: false });
  });

  it('rejects legacy snake_case and extra response fields', () => {
    expect(() =>
      CompanyScenarioListResponseSchema.parse([{ ...COMPANY_SCENARIO, case_count: 2 }])
    ).toThrow();
    expect(() =>
      CompanyScenarioCreateResponseSchema.parse({
        scenario: { ...COMPANY_SCENARIO, description: null },
        replay: false,
      })
    ).toThrow();
  });
});
