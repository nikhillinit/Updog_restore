import {
  AdmissionReceiptCoreV2Schema,
  FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
  FinancialFactsPayloadV6Schema,
  type AdmissionReceiptCoreV2,
  type FinancialFactsPayloadV6,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  FundCompanyActualsFactsResponseV2Schema,
  type FundCompanyActualsFactsResponse,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { ActualsPilotCashFlowPayloadSchema } from '../../../shared/contracts/lp-reporting/actuals-pilot.contract';
import { Decimal } from '../../../shared/lib/decimal-config';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  buildActualsPayloadFields,
  type BuildFinancialFactsPayloadV5Input,
} from './payload5-builder';
import { stripGeneratedAtLeaves } from '../financial-facts-snapshot-service';

interface CompanyCashRow {
  readonly id: number;
  readonly companyId: number | null;
  readonly eventType: string;
  readonly amount: string;
  readonly payload: unknown;
}

export function projectCompanyActualsFromEffectiveLedger(
  metadata: FundCompanyActualsFactsResponse,
  cashRows: readonly CompanyCashRow[]
): FinancialFactsPayloadV6['companyActuals'] {
  const facts = metadata.facts.map((fact) => {
    const deployments = cashRows.filter(
      (row) => row.eventType === 'portfolio_investment' && row.companyId === fact.companyId
    );
    let initial = new Decimal(0);
    let followOn = new Decimal(0);
    let unavailable = false;
    for (const row of deployments) {
      const payload = ActualsPilotCashFlowPayloadSchema.parse(row.payload);
      if (payload.deploymentCategory === 'initial') initial = initial.plus(row.amount);
      else if (payload.deploymentCategory === 'follow_on') followOn = followOn.plus(row.amount);
      else unavailable = true;
    }
    const sourceCashFlowEventIds = deployments
      .map((row) => row.id)
      .sort((left, right) => left - right);
    const monetaryFacts = unavailable
      ? {
          availability: 'unavailable' as const,
          reasonCodes: ['DEPLOYMENT_CATEGORY_UNMAPPED' as const],
          sourceCashFlowEventIds,
        }
      : { availability: 'available' as const, reasonCodes: [], sourceCashFlowEventIds };
    const amounts = {
      initialInvestmentAmount: unavailable ? null : initial.toFixed(6),
      followOnInvestmentAmount: unavailable ? null : followOn.toFixed(6),
      amountOnlyNonEquityAmount: unavailable ? null : '0.000000',
    };
    return {
      ...fact,
      ...amounts,
      monetaryFacts,
      inputHash: canonicalSha256({ metadataInputHash: fact.inputHash, ...amounts, monetaryFacts }),
    };
  });
  const result = FundCompanyActualsFactsResponseV2Schema.parse({
    ...metadata,
    facts,
    inputHash: canonicalSha256({
      metadataInputHash: metadata.inputHash,
      facts: facts.map((fact) => ({ companyId: fact.companyId, inputHash: fact.inputHash })),
    }),
  });
  return FinancialFactsPayloadV6Schema.shape.companyActuals.parse(stripGeneratedAtLeaves(result));
}

export function buildFinancialFactsPayloadV6(
  input: Omit<BuildFinancialFactsPayloadV5Input, 'companyActuals' | 'admissionReceiptCore'> & {
    readonly companyActuals: FinancialFactsPayloadV6['companyActuals'];
    readonly admissionReceiptCore: AdmissionReceiptCoreV2;
  }
): FinancialFactsPayloadV6 {
  const core = AdmissionReceiptCoreV2Schema.parse(input.admissionReceiptCore);
  return FinancialFactsPayloadV6Schema.parse({
    ...buildActualsPayloadFields(
      input,
      FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
      core.admitted.valuation?.payloadSha256 ?? null
    ),
    companyActuals: input.companyActuals,
    admissionReceiptCore: core,
    effectiveBasis: core.effectiveBasis,
  });
}
