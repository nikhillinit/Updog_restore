import { describe, expect, it } from 'vitest';
import {
  assertFundId,
  assertScenarioSetId,
  scenarioApiPath,
  scenarioSetApiPath,
} from '../../../client/src/lib/fund-scenario-workspace-api';

const VALID_UUID = '00000000-0000-0000-0000-000000000111';

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
