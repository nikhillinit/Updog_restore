import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FundScenarioSetDetailV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const { fetchScenarioSetDetailMock, queryMock, transactionMock, verifyFundExistsMock } = vi.hoisted(
  () => ({
    fetchScenarioSetDetailMock: vi.fn(),
    queryMock: vi.fn(),
    transactionMock: vi.fn(),
    verifyFundExistsMock: vi.fn(),
  })
);

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

vi.mock('../../../server/services/fund-scenario-set-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/fund-scenario-set-service')
  >('../../../server/services/fund-scenario-set-service.js');

  return {
    ...actual,
    fetchScenarioSetDetail: fetchScenarioSetDetailMock,
    verifyFundExists: verifyFundExistsMock,
  };
});

import { getFundScenarioCalculationStatus } from '../../../server/services/fund-scenario-calculation-status-service';

const scenarioSetId = '00000000-0000-0000-0000-000000000111';

type StubClient = {
  query: typeof queryMock;
};

type TransactionCallback = (client: StubClient) => unknown;

describe('fund scenario calculation status service', () => {
  beforeEach(() => {
    fetchScenarioSetDetailMock.mockReset();
    queryMock.mockReset();
    transactionMock.mockReset();
    verifyFundExistsMock.mockReset();

    transactionMock.mockImplementation(async (callback: TransactionCallback) =>
      callback({ query: queryMock })
    );
    verifyFundExistsMock.mockResolvedValue(undefined);
    fetchScenarioSetDetailMock.mockResolvedValue(feeScenarioSetDetail());
  });

  it('rejects fee-profile scenario sets through the real reserve identity guard', async () => {
    await expect(getFundScenarioCalculationStatus(123, scenarioSetId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'scenario_calculation_mode_mismatch',
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(verifyFundExistsMock).toHaveBeenCalledTimes(1);
    expect(fetchScenarioSetDetailMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

function feeScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    id: scenarioSetId,
    fundId: 123,
    name: 'Fee sensitivity',
    description: null,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    variantCount: 1,
    archivedAt: null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: 17,
    createdByLabel: 'analyst@example.com',
    updatedByUserId: 17,
    updatedByLabel: 'analyst@example.com',
    createdAt: '2026-05-29T12:00:00.000Z',
    updatedAt: '2026-05-29T12:00:00.000Z',
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000112',
        scenarioSetId,
        name: 'Lower fee',
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'fee_profile',
          payload: {
            feeProfiles: [
              {
                id: 'fee-profile-downside',
                name: 'Lower fees',
                feeTiers: [
                  {
                    id: 'tier-1',
                    name: 'Management fee',
                    percentage: 1.5,
                    feeBasis: 'committed_capital',
                    startMonth: 0,
                  },
                ],
              },
            ],
          },
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}
