import { describe, expect, it } from 'vitest';

import {
  buildFundCompanyActualsFactsFromRows,
  type FundCompanyActualsFactsRows,
} from '../../../../server/services/fund-actuals/fund-company-actuals-facts-service';
import { FinancingTrancheV1Schema } from '../../../../shared/contracts/investment-ledger/financing-event.contract';
import { VehicleFinancingParticipationV1Schema } from '../../../../shared/contracts/investment-ledger/participation.contract';
import { resolveEffectiveTerms } from '../../../../shared/lib/investment-ledger/effective-terms';
import { projectParticipationCompatibility } from '../../../../shared/lib/investment-ledger/participation-quantization';

const FUND_ID = 117_410_010;
const COMPANY_ID = 117_410_011;
const INVESTMENT_ID = 117_410_012;
const ROUND_ID = 117_410_013;
const TRANCHE_ID = 117_410_014;
const PARTICIPATION_ID = 117_410_015;

describe('participation facts parity', () => {
  it('preserves participation compatibility literals through fund-company actuals facts', () => {
    const projection = projectParticipationCompatibility(
      resolveEffectiveTerms(
        FinancingTrancheV1Schema.parse({
          id: TRANCHE_ID,
          fundId: FUND_ID,
          financingEventId: 117_410_016,
          trancheKey: 'primary',
          version: 1,
          supersededByTrancheId: null,
          closingDate: '2026-01-15',
          securityType: 'equity',
          investmentAmount: '1000.000000',
          originalAmount: '1000.000000',
          currency: 'USD',
          fxRateToUsd: '1.0000000000',
          fxRateDate: '2026-01-15',
          pricePerShare: '10.000000',
          postMoneyValuation: '10000000.000000',
          valuationCap: null,
          conversionDiscountRate: null,
          interestRate: null,
          maturityDate: null,
          liquidationPreferenceMultiple: null,
          participatingPreferred: false,
          participationCapMultiple: null,
          proRataRightsPct: null,
          descriptiveTerms: {},
          calculationEligible: true,
          sourceObservationId: 117_410_017,
          createdBy: 5,
          idempotencyKey: 'task10-parity-tranche',
          requestHash: 'a'.repeat(64),
          createdAt: '2026-01-15T00:00:00.000Z',
        }),
        VehicleFinancingParticipationV1Schema.parse({
          id: PARTICIPATION_ID,
          fundId: FUND_ID,
          vehicleId: 117_410_018,
          financingEventId: 117_410_016,
          trancheKey: 'primary',
          financingTrancheId: TRANCHE_ID,
          version: 1,
          supersededByParticipationId: null,
          participationAmount: '123.456789',
          originalAmount: '123.456789',
          currency: 'USD',
          fxRateToUsd: '1.0000000000',
          fxRateDate: '2026-01-15',
          sharesAcquired: '12.34567890',
          closingDate: null,
          pricePerShare: null,
          postMoneyValuation: null,
          valuationCap: null,
          conversionDiscountRate: null,
          interestRate: null,
          liquidationPreferenceMultiple: null,
          participatingPreferred: null,
          participationCapMultiple: null,
          proRataRightsPct: null,
          maturityDate: null,
          descriptiveTerms: null,
          confirmedDuplicates: [],
          sourceObservationId: 117_410_019,
          createdBy: 5,
          idempotencyKey: 'task10-parity-participation',
          requestHash: 'b'.repeat(64),
          createdAt: '2026-01-15T00:00:00.000Z',
        })
      )
    );

    expect(projection).toMatchObject({
      investmentAmount: '123.46',
      roundInvestmentAmount: '123.456789',
      cashFlowAmount: '123.456789',
      costBasisCents: 12346n,
      lot: {
        sharePriceCents: 1000n,
        sharesAcquired: '12.34567890',
        costBasisCents: 12346n,
      },
    });

    const rows: FundCompanyActualsFactsRows = {
      fund: { id: FUND_ID, baseCurrency: 'USD' },
      companies: [{ id: COMPANY_ID, fundId: FUND_ID, name: 'Task10 Facts Parity Co' }],
      investments: [{ id: INVESTMENT_ID, fundId: FUND_ID, companyId: COMPANY_ID }],
      allRounds: [
        {
          id: ROUND_ID,
          fundId: FUND_ID,
          investmentId: INVESTMENT_ID,
          roundDate: '2026-01-15',
          createdAt: new Date('2026-01-15T00:00:00.000Z'),
          securityType: 'equity',
          currency: 'USD',
          investmentAmount: projection.roundInvestmentAmount,
          preMoneyValuation: null,
          roundSize: null,
          supersedesRoundId: null,
        },
      ],
      activeOverrides: [],
      planningMarks: [],
    };

    const response = buildFundCompanyActualsFactsFromRows({
      fundId: FUND_ID,
      asOfDate: '2026-01-31',
      now: new Date('2026-01-31T12:00:00.000Z'),
      rows,
    });

    expect(response.facts).toHaveLength(1);
    expect(response.facts[0]).toMatchObject({
      fundId: FUND_ID,
      companyId: COMPANY_ID,
      investmentIds: [INVESTMENT_ID],
      activeRoundIds: [ROUND_ID],
      initialInvestmentAmount: '123.456789',
      followOnInvestmentAmount: '0.000000',
    });
  });
});
