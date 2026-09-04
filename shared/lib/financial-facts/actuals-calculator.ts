/**
 * Pure Decimal.js calculator for fixed-template actuals.
 *
 * The publication path supplies cumulative template rows. The direct inputs
 * exist only for unit vectors that exercise the Plan A correction and NAV
 * invariants which the fixed templates cannot express.
 */
import type {
  ActualsPilotCashFlowPayload,
  ActualsPilotValuationMarkPayload,
} from '../../contracts/lp-reporting/actuals-pilot.contract';
import {
  FinancialCapitalActualsV1Schema,
  FinancialValuationActualsV1Schema,
} from '../../contracts/financial-facts-snapshot-v1.contract';
import type {
  ActualsAvailabilityReasonV1,
  FinancialCapitalActualsV1,
  FinancialValuationActualsV1,
} from '../../contracts/financial-facts-snapshot-v1.contract';
import { MoneyDecimalStringSchema } from '../decimal-string';
import { Decimal } from '../decimal-config';

export type ActualsCalculatorLedgerEventType =
  | 'settled_contribution'
  | 'lp_distribution'
  | 'management_fee'
  | 'fund_expense'
  | 'portfolio_investment'
  | 'realized_proceeds';

export interface ActualsCalculatorLedgerRowV1 extends ActualsPilotCashFlowPayload {
  readonly canonicalAmount: string;
  readonly eventType: ActualsCalculatorLedgerEventType;
  readonly effectiveDate: string;
  readonly resolvedCompanyId: number | null;
  readonly resolvedVehicleId: number | null;
}

export interface ActualsCalculatorValuationMarkV1 extends ActualsPilotValuationMarkPayload {
  readonly markId: number;
  readonly markDate: string;
  readonly positionFairValue: string;
  readonly markSource: string;
  readonly confidenceLevel: 'high' | 'medium' | 'low';
  readonly resolvedCompanyId: number;
  readonly resolvedVehicleId: number;
  readonly externalRefHash: string;
}

export interface ActualsCalculatorVehicleCommitmentV1 {
  readonly vehicleId: number;
  readonly amount: string;
  readonly sourceHash: string;
}

export interface ActualsCalculatorCalledCapitalSourceV1 {
  readonly sourceExternalRef: string;
  readonly amount: string;
}

export interface ActualsCalculatorCalledCapitalIssuedV1 {
  readonly amount: string;
  readonly sources: readonly ActualsCalculatorCalledCapitalSourceV1[];
}

export interface ActualsCalculatorReferenceBackedReversalV1 {
  readonly reversalExternalRef: string;
  readonly referencedSourceExternalRef: string;
  readonly amount: string;
  readonly replacementAmount?: string;
}

export interface ActualsCalculatorRosterEntryV1 {
  readonly vehicleId: number;
  readonly companyId: number;
}

export interface ActualsCalculatorAssertedAggregatesV1 {
  readonly committedCapital?: string;
  readonly calledCapitalIssued?: string;
  readonly settledPaidInCapital?: string;
  readonly deployedCapital?: string;
  readonly initialDeployedCapital?: string;
  readonly followOnDeployedCapital?: string;
  readonly secondaryDeployedCapital?: string;
  readonly otherDeployedCapital?: string;
  readonly managementFeesPaid?: string;
  readonly otherExpensesPaid?: string;
  readonly realizedFundProceeds?: string;
  readonly distributionsToPartners?: string;
  readonly recallableDistributions?: string;
  readonly netCalledCapital?: string;
  readonly uncalledCapital?: string;
  readonly portfolioFmv?: string;
  readonly nav?: string;
}

export interface ActualsCalculatorInputV1 {
  readonly ledgerRows: readonly ActualsCalculatorLedgerRowV1[];
  readonly vehicleCommitment: ActualsCalculatorVehicleCommitmentV1;
  readonly roster: readonly ActualsCalculatorRosterEntryV1[];
  readonly valuationMarks: readonly ActualsCalculatorValuationMarkV1[];
  readonly ledgerCoverage: 'complete' | 'partial';
  readonly ledgerPayloadSha256: string;
  readonly valuationPayloadSha256: string | null;
  readonly predecessorSnapshotInputHash: string | null;
  readonly calledCapitalIssued?: string | ActualsCalculatorCalledCapitalIssuedV1;
  readonly referenceBackedReversals?: readonly ActualsCalculatorReferenceBackedReversalV1[];
  readonly nav?: string;
  readonly assertedAggregates?: ActualsCalculatorAssertedAggregatesV1;
}

export type ActualsCalculatorRefusalCode =
  | 'SOURCE_FACT_CONTRADICTION'
  | 'NEGATIVE_UNCALLED_CAPITAL'
  | 'CORRECTION_LINEAGE_INVALID'
  | 'COMPANY_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND';

export interface ActualsCalculatorRefusalV1 {
  readonly ok: false;
  readonly code: ActualsCalculatorRefusalCode;
  readonly message: string;
}

export interface ActualsCalculatorSuccessV1 {
  readonly ok: true;
  readonly capitalActuals: FinancialCapitalActualsV1;
  readonly valuationActuals: FinancialValuationActualsV1;
}

export type ActualsCalculatorResultV1 = ActualsCalculatorSuccessV1 | ActualsCalculatorRefusalV1;

type DecimalAggregate = Record<keyof ActualsCalculatorAssertedAggregatesV1, Decimal | null>;

const ASSERTED_AGGREGATE_FIELDS: readonly (keyof ActualsCalculatorAssertedAggregatesV1)[] = [
  'committedCapital',
  'calledCapitalIssued',
  'settledPaidInCapital',
  'deployedCapital',
  'initialDeployedCapital',
  'followOnDeployedCapital',
  'secondaryDeployedCapital',
  'otherDeployedCapital',
  'managementFeesPaid',
  'otherExpensesPaid',
  'realizedFundProceeds',
  'distributionsToPartners',
  'recallableDistributions',
  'netCalledCapital',
  'uncalledCapital',
  'portfolioFmv',
  'nav',
];

function refusal(code: ActualsCalculatorRefusalCode, message: string): ActualsCalculatorRefusalV1 {
  return { ok: false, code, message };
}

function parseNonnegativeMoney(value: string): Decimal | null {
  if (!MoneyDecimalStringSchema.safeParse(value).success || value.startsWith('-')) {
    return null;
  }
  return new Decimal(value);
}

function formatMoney(value: Decimal): string {
  return value.toFixed(6);
}

function formatRatio(value: Decimal): string {
  return value.toDecimalPlaces(12, Decimal.ROUND_HALF_EVEN).toFixed(12);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function sourceRefs(...refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.filter((ref): ref is string => ref !== null && ref !== undefined))];
}

function availableMoney(value: Decimal, refs: readonly string[]) {
  return {
    value: formatMoney(value),
    availability: 'available' as const,
    reasonCodes: [] as ActualsAvailabilityReasonV1[],
    sourceRefs: [...refs],
  };
}

function unavailableMoney(reason: ActualsAvailabilityReasonV1) {
  return {
    value: null,
    availability: 'unavailable' as const,
    reasonCodes: [reason],
    sourceRefs: [],
  };
}

function availableRatio(value: Decimal, refs: readonly string[]) {
  return {
    value: formatRatio(value),
    availability: 'available' as const,
    reasonCodes: [] as ActualsAvailabilityReasonV1[],
    sourceRefs: [...refs],
  };
}

function unavailableRatio(reason: ActualsAvailabilityReasonV1) {
  return {
    value: null,
    availability: 'unavailable' as const,
    reasonCodes: [reason],
    sourceRefs: [],
  };
}

function compareAssertedAggregates(
  asserted: ActualsCalculatorAssertedAggregatesV1 | undefined,
  computed: DecimalAggregate
): ActualsCalculatorRefusalV1 | null {
  if (asserted === undefined) return null;

  for (const field of ASSERTED_AGGREGATE_FIELDS) {
    const assertedValue = asserted[field];
    if (assertedValue === undefined) continue;

    const parsed = parseNonnegativeMoney(assertedValue);
    const actual = computed[field];
    if (parsed === null || actual === null || !actual.eq(parsed)) {
      return refusal(
        'SOURCE_FACT_CONTRADICTION',
        `Asserted aggregate ${field} does not match source-backed components.`
      );
    }
  }

  return null;
}

function resolveCalledCapital(
  input: ActualsCalculatorInputV1
):
  | { readonly amount: Decimal; readonly sources: ReadonlyMap<string, Decimal> | null }
  | ActualsCalculatorRefusalV1
  | null {
  if (input.calledCapitalIssued === undefined) return null;

  if (typeof input.calledCapitalIssued === 'string') {
    const amount = parseNonnegativeMoney(input.calledCapitalIssued);
    return amount === null
      ? refusal('SOURCE_FACT_CONTRADICTION', 'Called capital must be a non-negative money value.')
      : { amount, sources: null };
  }

  const amount = parseNonnegativeMoney(input.calledCapitalIssued.amount);
  if (amount === null) {
    return refusal(
      'SOURCE_FACT_CONTRADICTION',
      'Called capital must be a non-negative money value.'
    );
  }

  const sources = new Map<string, Decimal>();
  let sourceTotal = new Decimal(0);
  for (const source of input.calledCapitalIssued.sources) {
    if (source.sourceExternalRef.length === 0 || sources.has(source.sourceExternalRef)) {
      return refusal(
        'CORRECTION_LINEAGE_INVALID',
        'Called-capital source references must be unique.'
      );
    }
    const sourceAmount = parseNonnegativeMoney(source.amount);
    if (sourceAmount === null) {
      return refusal(
        'SOURCE_FACT_CONTRADICTION',
        'Called-capital source amounts must be non-negative money values.'
      );
    }
    sources.set(source.sourceExternalRef, sourceAmount);
    sourceTotal = sourceTotal.plus(sourceAmount);
  }

  if (!sourceTotal.eq(amount)) {
    return refusal(
      'SOURCE_FACT_CONTRADICTION',
      'Called-capital source components must equal the asserted aggregate.'
    );
  }

  return { amount, sources };
}

function applyReferenceBackedReversals(
  calledCapital: {
    readonly amount: Decimal;
    readonly sources: ReadonlyMap<string, Decimal> | null;
  } | null,
  reversals: readonly ActualsCalculatorReferenceBackedReversalV1[]
): Decimal | ActualsCalculatorRefusalV1 | null {
  if (reversals.length === 0) return calledCapital?.amount ?? null;
  if (calledCapital === null || calledCapital.sources === null) {
    return refusal(
      'CORRECTION_LINEAGE_INVALID',
      'Reference-backed reversals require exact called-capital source references.'
    );
  }

  const remaining = new Map(calledCapital.sources);
  const seenReversalRefs = new Set<string>();
  let netCalled = calledCapital.amount;

  for (const reversal of reversals) {
    if (
      reversal.reversalExternalRef.length === 0 ||
      seenReversalRefs.has(reversal.reversalExternalRef)
    ) {
      return refusal('CORRECTION_LINEAGE_INVALID', 'Reversal source references must be unique.');
    }
    seenReversalRefs.add(reversal.reversalExternalRef);

    const originalRemaining = remaining.get(reversal.referencedSourceExternalRef);
    const reversalAmount = parseNonnegativeMoney(reversal.amount);
    const replacementAmount =
      reversal.replacementAmount === undefined
        ? new Decimal(0)
        : parseNonnegativeMoney(reversal.replacementAmount);

    if (reversalAmount === null || replacementAmount === null) {
      return refusal(
        'SOURCE_FACT_CONTRADICTION',
        'Correction magnitudes must be non-negative money values.'
      );
    }
    if (originalRemaining === undefined || reversalAmount.gt(originalRemaining)) {
      return refusal(
        'CORRECTION_LINEAGE_INVALID',
        'Reversal must reference an existing remaining source amount.'
      );
    }

    remaining.set(reversal.referencedSourceExternalRef, originalRemaining.minus(reversalAmount));
    netCalled = netCalled.minus(reversalAmount).plus(replacementAmount);
  }

  return netCalled;
}

export function calculateActualsV1(input: ActualsCalculatorInputV1): ActualsCalculatorResultV1 {
  if (!isSha256(input.ledgerPayloadSha256)) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'Ledger payload hash must be SHA-256.');
  }
  if (input.valuationPayloadSha256 !== null && !isSha256(input.valuationPayloadSha256)) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'Valuation payload hash must be SHA-256.');
  }
  if (!isPositiveInteger(input.vehicleCommitment.vehicleId)) {
    return refusal(
      'SOURCE_FACT_CONTRADICTION',
      'Vehicle commitment must identify a positive vehicle.'
    );
  }
  if (input.vehicleCommitment.sourceHash.length === 0) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'Vehicle commitment must have a source hash.');
  }

  const commitment = parseNonnegativeMoney(input.vehicleCommitment.amount);
  if (commitment === null) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'Commitment must be a non-negative money value.');
  }

  const rosterKeys = new Set<string>();
  const roster = [...input.roster];
  for (const entry of roster) {
    if (!isPositiveInteger(entry.vehicleId) || !isPositiveInteger(entry.companyId)) {
      return refusal('SOURCE_FACT_CONTRADICTION', 'Roster identifiers must be positive integers.');
    }
    const key = `${entry.vehicleId}:${entry.companyId}`;
    if (rosterKeys.has(key)) {
      return refusal('SOURCE_FACT_CONTRADICTION', 'Roster position identities must be unique.');
    }
    rosterKeys.add(key);
  }
  roster.sort(
    (left, right) => left.vehicleId - right.vehicleId || left.companyId - right.companyId
  );

  let settledPaidIn = new Decimal(0);
  let deployed = new Decimal(0);
  let initialDeployed = new Decimal(0);
  let followOnDeployed = new Decimal(0);
  let secondaryDeployed = new Decimal(0);
  let otherDeployed = new Decimal(0);
  let managementFees = new Decimal(0);
  let otherExpenses = new Decimal(0);
  let realizedFundProceeds = new Decimal(0);
  let distributionsToPartners = new Decimal(0);
  let recallableDistributions = new Decimal(0);
  let deploymentCategoryComplete = true;

  for (const row of input.ledgerRows) {
    const amount = parseNonnegativeMoney(row.canonicalAmount);
    if (amount === null) {
      return refusal(
        'SOURCE_FACT_CONTRADICTION',
        'Ledger amounts must be non-negative money values.'
      );
    }

    switch (row.eventType) {
      case 'settled_contribution':
        settledPaidIn = settledPaidIn.plus(amount);
        break;
      case 'lp_distribution':
        distributionsToPartners = distributionsToPartners.plus(amount);
        if (row.recallable === true) {
          recallableDistributions = recallableDistributions.plus(amount);
        }
        break;
      case 'management_fee':
        managementFees = managementFees.plus(amount);
        break;
      case 'fund_expense':
        otherExpenses = otherExpenses.plus(amount);
        break;
      case 'portfolio_investment':
        if (!isPositiveInteger(row.resolvedCompanyId ?? 0)) {
          return refusal('COMPANY_NOT_FOUND', 'Portfolio investment requires a resolved company.');
        }
        if (!isPositiveInteger(row.resolvedVehicleId ?? 0)) {
          return refusal('VEHICLE_NOT_FOUND', 'Portfolio investment requires a resolved vehicle.');
        }
        deployed = deployed.plus(amount);
        if (row.deploymentCategory === null) {
          deploymentCategoryComplete = false;
        } else {
          switch (row.deploymentCategory) {
            case 'initial':
              initialDeployed = initialDeployed.plus(amount);
              break;
            case 'follow_on':
              followOnDeployed = followOnDeployed.plus(amount);
              break;
            case 'secondary':
              secondaryDeployed = secondaryDeployed.plus(amount);
              break;
            case 'other':
              otherDeployed = otherDeployed.plus(amount);
              break;
            default:
              return refusal('SOURCE_FACT_CONTRADICTION', 'Deployment category is not supported.');
          }
        }
        break;
      case 'realized_proceeds':
        if (!isPositiveInteger(row.resolvedCompanyId ?? 0)) {
          return refusal('COMPANY_NOT_FOUND', 'Realized proceeds require a resolved company.');
        }
        if (!isPositiveInteger(row.resolvedVehicleId ?? 0)) {
          return refusal('VEHICLE_NOT_FOUND', 'Realized proceeds require a resolved vehicle.');
        }
        realizedFundProceeds = realizedFundProceeds.plus(amount);
        break;
      default:
        return refusal('SOURCE_FACT_CONTRADICTION', 'Ledger event type is not supported.');
    }
  }

  if (recallableDistributions.gt(distributionsToPartners)) {
    return refusal(
      'SOURCE_FACT_CONTRADICTION',
      'Recallable distributions cannot exceed partner distributions.'
    );
  }

  const calledCapital = resolveCalledCapital(input);
  if (calledCapital !== null && 'ok' in calledCapital) return calledCapital;
  const netCalled = applyReferenceBackedReversals(
    calledCapital === null || calledCapital === undefined ? null : calledCapital,
    input.referenceBackedReversals ?? []
  );
  if (netCalled !== null && 'ok' in netCalled) return netCalled;
  if (netCalled !== null && netCalled.isNegative()) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'Net called capital cannot be negative.');
  }

  const nav = input.nav === undefined ? null : parseNonnegativeMoney(input.nav);
  if (input.nav !== undefined && nav === null) {
    return refusal('SOURCE_FACT_CONTRADICTION', 'NAV must be a non-negative money value.');
  }

  const valuationMarks: Array<{
    readonly input: ActualsCalculatorValuationMarkV1;
    readonly value: Decimal;
  }> = [];
  const valuationPairs = new Set<string>();
  let valuationDate: string | null = null;
  for (const mark of input.valuationMarks) {
    if (
      !isPositiveInteger(mark.markId) ||
      !isPositiveInteger(mark.resolvedVehicleId) ||
      !isPositiveInteger(mark.resolvedCompanyId) ||
      !isSha256(mark.externalRefHash) ||
      mark.markSource.length === 0
    ) {
      return refusal('SOURCE_FACT_CONTRADICTION', 'Valuation mark identity is invalid.');
    }
    const value = parseNonnegativeMoney(mark.positionFairValue);
    if (value === null || mark.markDate.length === 0) {
      return refusal(
        'SOURCE_FACT_CONTRADICTION',
        'Valuation marks must use canonical money and dates.'
      );
    }
    if (valuationDate === null) valuationDate = mark.markDate;
    if (valuationDate !== mark.markDate) {
      return refusal('SOURCE_FACT_CONTRADICTION', 'Valuation marks must share one valuation date.');
    }
    const pair = `${mark.resolvedVehicleId}:${mark.resolvedCompanyId}`;
    if (valuationPairs.has(pair)) {
      return refusal('SOURCE_FACT_CONTRADICTION', 'Valuation position marks must be unique.');
    }
    valuationPairs.add(pair);
    valuationMarks.push({ input: mark, value });
  }
  if (input.valuationPayloadSha256 === null && valuationMarks.length > 0) {
    return refusal(
      'SOURCE_FACT_CONTRADICTION',
      'Valuation marks require a valuation payload hash.'
    );
  }
  valuationMarks.sort(
    (left, right) =>
      left.input.resolvedCompanyId - right.input.resolvedCompanyId ||
      left.input.markId - right.input.markId ||
      left.input.resolvedVehicleId - right.input.resolvedVehicleId
  );

  const coveredPairs = new Set(
    valuationMarks
      .filter(({ input: mark }) =>
        rosterKeys.has(`${mark.resolvedVehicleId}:${mark.resolvedCompanyId}`)
      )
      .map(({ input: mark }) => `${mark.resolvedVehicleId}:${mark.resolvedCompanyId}`)
  );
  const missingCompanyIds = [
    ...new Set(
      roster
        .filter((entry) => !coveredPairs.has(`${entry.vehicleId}:${entry.companyId}`))
        .map((entry) => entry.companyId)
    ),
  ].sort((left, right) => left - right);
  const valuationCoverage: FinancialValuationActualsV1['coverage'] =
    input.valuationPayloadSha256 === null
      ? 'not_supplied'
      : missingCompanyIds.length === 0
        ? 'complete'
        : 'partial';

  let portfolioFmv = new Decimal(0);
  for (const mark of valuationMarks) {
    if (rosterKeys.has(`${mark.input.resolvedVehicleId}:${mark.input.resolvedCompanyId}`)) {
      portfolioFmv = portfolioFmv.plus(mark.value);
    }
  }

  const ledgerRef = `actuals-pilot:ledger:${input.ledgerPayloadSha256}`;
  const valuationRef =
    input.valuationPayloadSha256 === null
      ? null
      : `actuals-pilot:valuation:${input.valuationPayloadSha256}`;
  const commitmentRef = `fund-commitment:${input.vehicleCommitment.sourceHash}`;
  const predecessorRef =
    input.predecessorSnapshotInputHash === null
      ? null
      : `facts-predecessor:${input.predecessorSnapshotInputHash}`;
  const ledgerRefs = sourceRefs(ledgerRef, predecessorRef);
  const directRefs = sourceRefs(ledgerRef, predecessorRef);

  const valuationActuals: FinancialValuationActualsV1 = {
    valuationDate,
    roster,
    marks: valuationMarks.map(({ input: mark, value }) => ({
      markId: mark.markId,
      vehicleId: mark.resolvedVehicleId,
      companyId: mark.resolvedCompanyId,
      positionFairValue: formatMoney(value),
      markSource: mark.markSource,
      confidenceLevel: mark.confidenceLevel,
      externalRefHash: mark.externalRefHash,
    })),
    coverage: valuationCoverage,
    missingCompanyIds,
  };

  const ledgerMoney = (value: Decimal) =>
    input.ledgerCoverage === 'complete'
      ? availableMoney(value, ledgerRefs)
      : unavailableMoney('COVERAGE_PARTIAL');
  const categoryMoney = (value: Decimal) =>
    input.ledgerCoverage !== 'complete'
      ? unavailableMoney('COVERAGE_PARTIAL')
      : deploymentCategoryComplete
        ? availableMoney(value, ledgerRefs)
        : unavailableMoney('DEPLOYMENT_CATEGORY_PARTIAL');
  const valuationMoney =
    valuationCoverage === 'complete'
      ? availableMoney(portfolioFmv, sourceRefs(...ledgerRefs, valuationRef))
      : unavailableMoney(
          valuationCoverage === 'not_supplied'
            ? 'VALUATION_NOT_SUPPLIED'
            : 'VALUATION_COVERAGE_PARTIAL'
        );

  const committedCapital = availableMoney(commitment, [commitmentRef]);
  const calledCapitalIssued =
    calledCapital === null
      ? unavailableMoney('CALL_NOTICE_NOT_IMPORTED')
      : availableMoney(calledCapital.amount, directRefs);
  const netCalledCapital =
    netCalled === null
      ? unavailableMoney('CALL_NOTICE_NOT_IMPORTED')
      : availableMoney(netCalled, directRefs);
  const recallableForFormula = input.ledgerCoverage === 'complete' ? recallableDistributions : null;

  let uncalledCapital;
  if (netCalled === null || recallableForFormula === null) {
    uncalledCapital = unavailableMoney(
      netCalled === null ? 'CALL_NOTICE_NOT_IMPORTED' : 'COVERAGE_PARTIAL'
    );
  } else {
    if (netCalled.gt(commitment.plus(recallableForFormula))) {
      return refusal(
        'NEGATIVE_UNCALLED_CAPITAL',
        'Net called capital exceeds commitment plus recallable distributions.'
      );
    }
    uncalledCapital = availableMoney(
      commitment.minus(netCalled).plus(recallableForFormula),
      sourceRefs(commitmentRef, ...ledgerRefs)
    );
  }

  const portfolioFmvValue = valuationCoverage === 'complete' ? portfolioFmv : null;
  const computedAggregates: DecimalAggregate = {
    committedCapital: commitment,
    calledCapitalIssued: calledCapital?.amount ?? null,
    settledPaidInCapital: input.ledgerCoverage === 'complete' ? settledPaidIn : null,
    deployedCapital: input.ledgerCoverage === 'complete' ? deployed : null,
    initialDeployedCapital:
      input.ledgerCoverage === 'complete' && deploymentCategoryComplete ? initialDeployed : null,
    followOnDeployedCapital:
      input.ledgerCoverage === 'complete' && deploymentCategoryComplete ? followOnDeployed : null,
    secondaryDeployedCapital:
      input.ledgerCoverage === 'complete' && deploymentCategoryComplete ? secondaryDeployed : null,
    otherDeployedCapital:
      input.ledgerCoverage === 'complete' && deploymentCategoryComplete ? otherDeployed : null,
    managementFeesPaid: input.ledgerCoverage === 'complete' ? managementFees : null,
    otherExpensesPaid: input.ledgerCoverage === 'complete' ? otherExpenses : null,
    realizedFundProceeds: input.ledgerCoverage === 'complete' ? realizedFundProceeds : null,
    distributionsToPartners: input.ledgerCoverage === 'complete' ? distributionsToPartners : null,
    recallableDistributions: input.ledgerCoverage === 'complete' ? recallableDistributions : null,
    netCalledCapital: netCalled,
    uncalledCapital:
      uncalledCapital.availability === 'available' && uncalledCapital.value !== null
        ? new Decimal(uncalledCapital.value)
        : null,
    portfolioFmv: portfolioFmvValue,
    nav,
  };
  const assertedRefusal = compareAssertedAggregates(input.assertedAggregates, computedAggregates);
  if (assertedRefusal !== null) return assertedRefusal;

  const paidInAvailable = input.ledgerCoverage === 'complete';
  const paidInForRatio = paidInAvailable ? settledPaidIn : null;
  const dpi =
    paidInForRatio === null
      ? unavailableRatio('SETTLED_PAID_IN_UNAVAILABLE')
      : paidInForRatio.isZero()
        ? unavailableRatio('PAID_IN_ZERO')
        : availableRatio(distributionsToPartners.div(paidInForRatio), ledgerRefs);
  const ratioUnavailableReason =
    paidInForRatio === null
      ? 'SETTLED_PAID_IN_UNAVAILABLE'
      : paidInForRatio.isZero()
        ? 'PAID_IN_ZERO'
        : nav === null
          ? 'NAV_UNAVAILABLE'
          : null;
  const rvpi =
    ratioUnavailableReason === null
      ? availableRatio(nav!.div(paidInForRatio!), sourceRefs(valuationRef, ...directRefs))
      : unavailableRatio(ratioUnavailableReason);
  const tvpi =
    ratioUnavailableReason === null
      ? availableRatio(
          distributionsToPartners.plus(nav!).div(paidInForRatio!),
          sourceRefs(valuationRef, ...directRefs)
        )
      : unavailableRatio(ratioUnavailableReason);

  const capitalActuals: FinancialCapitalActualsV1 = {
    ledgerCoverage: input.ledgerCoverage,
    committedCapital,
    calledCapitalIssued,
    paidInCapital: ledgerMoney(settledPaidIn),
    deployedCapital: ledgerMoney(deployed),
    initialDeployedCapital: categoryMoney(initialDeployed),
    followOnDeployedCapital: categoryMoney(followOnDeployed),
    secondaryDeployedCapital: categoryMoney(secondaryDeployed),
    otherDeployedCapital: categoryMoney(otherDeployed),
    managementFeesPaid: ledgerMoney(managementFees),
    otherExpensesPaid: ledgerMoney(otherExpenses),
    realizedFundProceeds: ledgerMoney(realizedFundProceeds),
    distributionsToPartners: ledgerMoney(distributionsToPartners),
    recallableDistributions: ledgerMoney(recallableDistributions),
    netCalledCapital,
    uncalledCapital,
    availableRecallCapacity: unavailableMoney('RECALL_LIFECYCLE_UNAVAILABLE'),
    portfolioFmv: valuationMoney,
    fundCash: unavailableMoney('SOURCE_NOT_SUPPLIED'),
    otherAssets: unavailableMoney('SOURCE_NOT_SUPPLIED'),
    liabilities: unavailableMoney('SOURCE_NOT_SUPPLIED'),
    nav:
      nav === null
        ? unavailableMoney('NAV_UNAVAILABLE')
        : availableMoney(nav, sourceRefs(valuationRef, ...directRefs)),
    dpi,
    rvpi,
    tvpi,
  };

  // Contract parse is an internal invariant: a violation is a programming error, not a refusal.
  return {
    ok: true,
    capitalActuals: FinancialCapitalActualsV1Schema.parse(capitalActuals),
    valuationActuals: FinancialValuationActualsV1Schema.parse(valuationActuals),
  };
}
