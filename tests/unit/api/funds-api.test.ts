import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

type FundInsertResult = {
  returning(selection: Record<string, unknown>): Promise<Array<{ id: number }>>;
};

type TransactionContext = {
  insert(table: unknown): {
    values(values: unknown): FundInsertResult | Promise<void>;
  };
};

const transactionMock =
  vi.fn<(callback: (tx: TransactionContext) => Promise<unknown>) => Promise<unknown>>();
const fundValuesSpy = vi.fn<(values: unknown) => FundInsertResult>();
const configValuesSpy = vi.fn<(values: unknown) => Promise<void>>();

vi.mock('../../../server/db', () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../server/shared/idempotency-instance', () => ({
  idem: new Map(),
}));

vi.mock('../../../server/lib/inflight-server', () => ({
  getOrStart: vi.fn(async (_idem: unknown, _key: string, factory: () => Promise<unknown>) => ({
    status: 'created',
    promise: factory(),
  })),
}));

vi.mock('../../../server/core/enhanced-fund-model', () => ({
  EnhancedFundModel: class {
    async calculate() {
      return {};
    }
  },
}));

vi.mock('../../../server/lib/hash', () => ({
  hashPayload: () => 'hash',
}));

vi.mock('../../../server/metrics', () => ({
  calcDurationMs: {
    startTimer: () => () => undefined,
  },
}));

// Ensure schema re-exports are available
const schemaModulePromise = import('@shared/schema');

let fundsRouter: typeof import('../../../server/routes/funds').default;

beforeEach(async () => {
  fundValuesSpy.mockReset();
  configValuesSpy.mockReset();
  transactionMock.mockReset();

  const schemaModule = await schemaModulePromise;

  const returningMock = vi.fn(async () => [{ id: 42 }]);

  fundValuesSpy.mockImplementation(() => ({
    returning: returningMock,
  }));

  configValuesSpy.mockImplementation(async () => {
    return undefined;
  });

  transactionMock.mockImplementation(async (callback) => {
    const txInsert = (table: unknown) => {
      if (table === schemaModule.funds) {
        return {
          values: (values: unknown) => fundValuesSpy(values),
        };
      }

      if (table === schemaModule.fundConfigs) {
        return {
          values: async (values: unknown) => {
            await configValuesSpy(values);
          },
        };
      }

      throw new Error('Unexpected table insert attempt');
    };

    return callback({
      insert: txInsert,
    });
  });

  // Re-import router to use latest mocks
  const module = await import('../../../server/routes/funds');
  fundsRouter = module.default;
});

const buildWizardPayload = () => ({
  generalInfo: {
    fundName: 'Test Fund',
    fundSize: 150_000_000,
    vintageYear: 2024,
    establishmentDate: '2024-01-01',
  },
  feesExpenses: {
    managementFee: {
      rate: 2,
    },
    carriedInterest: {
      enabled: true,
      rate: 20,
    },
  },
});

describe('POST /funds (wizard payload)', () => {
  // Helper to format rates as decimal strings with four places
  const toDecimalString = (rate: number) => (rate / 100).toFixed(4);

  it('persists fund and returns identifier', async () => {
    const app = express();
    app.use(express.json());
    app.use(fundsRouter);

    const payload = buildWizardPayload();
    const response = await request(app).post('/funds').send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 42 });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(fundValuesSpy).toHaveBeenCalledWith({
      name: payload.generalInfo.fundName,
      size: payload.generalInfo.fundSize.toString(),
      managementFee: toDecimalString(payload.feesExpenses.managementFee.rate),
      carryPercentage: toDecimalString(payload.feesExpenses.carriedInterest.rate),
      vintageYear: payload.generalInfo.vintageYear,
      establishmentDate: new Date(payload.generalInfo.establishmentDate),
      status: 'active',
    });
    expect(configValuesSpy).toHaveBeenCalledWith({
      fundId: 42,
      config: payload,
      isDraft: true,
      isPublished: false,
    });
  });

  it('rejects invalid payloads', async () => {
    const app = express();
    app.use(express.json());
    app.use(fundsRouter);

    const response = await request(app).post('/funds').send({});
    expect(response.status).toBe(400);
  });
});
