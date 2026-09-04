import {
  ActualMetricsETagSchema,
  ActualMetricsV2Schema,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  type ActualsAvailabilityReasonV1,
  type FinancialFactsSnapshotV5,
  type GovernedMoneyV1,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';

type ParsedActualsPilotFactsRow = FinancialFactsSnapshotV5 & { readonly id: number };

const ACTIONABILITY_FIELDS = [
  'committedCapital',
  'paidInCapital',
  'deployedCapital',
  'managementFeesPaid',
  'otherExpensesPaid',
  'realizedFundProceeds',
  'distributionsToPartners',
] as const;

function cloneMoney(value: GovernedMoneyV1): GovernedMoneyV1 {
  return {
    value: value.value,
    availability: value.availability,
    reasonCodes: [...value.reasonCodes],
    sourceRefs: [...value.sourceRefs],
  };
}

function unavailableMoney(reason: ActualsAvailabilityReasonV1): GovernedMoneyV1 {
  return {
    value: null,
    availability: 'unavailable',
    reasonCodes: [reason],
    sourceRefs: [],
  };
}

function actionabilityReasonCodes(
  capital: ParsedActualsPilotFactsRow['payload']['capitalActuals']
): ActualsAvailabilityReasonV1[] {
  const reasons = new Set<ActualsAvailabilityReasonV1>();

  if (capital.ledgerCoverage !== 'complete') {
    reasons.add('COVERAGE_PARTIAL');
  }

  for (const field of ACTIONABILITY_FIELDS) {
    const value = capital[field];
    if (value.availability !== 'available') {
      for (const reason of value.reasonCodes) reasons.add(reason);
    }
  }

  return [...reasons];
}

export function actualMetricsV2ETag(snapshotId: number, snapshotInputHash: string): string {
  return ActualMetricsETagSchema.parse(
    `"actual-metrics:${snapshotId}:${snapshotInputHash}:actual-metrics-2.0.0"`
  );
}

export function unavailableActualMetricsV2(fundId: number) {
  return ActualMetricsV2Schema.parse({
    contractVersion: 'actual-metrics/2.0.0',
    snapshotStatus: 'unavailable',
    fundId,
    asOfDate: null,
    knowledgeCutoff: null,
    financialFactsSnapshotId: null,
    snapshotInputHash: null,
    reasonCodes: ['FACTS_NOT_FOUND'],
  });
}

export function projectActualMetricsV2(
  parsedRow: ParsedActualsPilotFactsRow
) {
  if (parsedRow.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
    throw new Error('Actual metrics projector requires a policy-1.4 facts row.');
  }

  const { capitalActuals: capital, valuationActuals: valuation, companyActuals } =
    parsedRow.payload;
  const companyLabels = new Map(companyActuals.facts.map((fact) => [fact.companyId, fact.companyName]));
  const marksByPosition = new Map(
    valuation.marks.map((mark) => [`${mark.vehicleId}:${mark.companyId}`, mark])
  );

  const companies = [...valuation.roster]
    .sort(
      (left, right) =>
        left.companyId - right.companyId || left.vehicleId - right.vehicleId
    )
    .map((rosterEntry) => {
      const mark = marksByPosition.get(`${rosterEntry.vehicleId}:${rosterEntry.companyId}`);
      return {
        companyId: rosterEntry.companyId,
        companyLabel: companyLabels.get(rosterEntry.companyId) ?? `Company ${rosterEntry.companyId}`,
        positionFairValue:
          mark === undefined
            ? unavailableMoney(
                valuation.coverage === 'not_supplied'
                  ? 'VALUATION_NOT_SUPPLIED'
                  : 'VALUATION_COVERAGE_PARTIAL'
              )
            : {
                value: mark.positionFairValue,
                availability: 'available' as const,
                reasonCodes: [],
                sourceRefs: [mark.externalRefHash],
              },
      };
    });

  const reasonCodes = actionabilityReasonCodes(capital);

  return ActualMetricsV2Schema.parse({
    contractVersion: 'actual-metrics/2.0.0',
    snapshotStatus: 'resolved',
    fundId: parsedRow.fundId,
    asOfDate: parsedRow.asOfDate,
    knowledgeCutoff: parsedRow.knowledgeCutoff,
    financialFactsSnapshotId: parsedRow.id,
    snapshotInputHash: parsedRow.snapshotInputHash,
    capitalScope: 'aggregate_lp_and_gp',
    performancePerspective: 'fund_net_to_partners',
    deploymentPerspective: 'fund_gross',
    currency: 'USD',
    capital: {
      committed: cloneMoney(capital.committedCapital),
      calledIssued: cloneMoney(capital.calledCapitalIssued),
      paidIn: cloneMoney(capital.paidInCapital),
      deployed: cloneMoney(capital.deployedCapital),
      initialDeployed: cloneMoney(capital.initialDeployedCapital),
      followOnDeployed: cloneMoney(capital.followOnDeployedCapital),
      secondaryDeployed: cloneMoney(capital.secondaryDeployedCapital),
      otherDeployed: cloneMoney(capital.otherDeployedCapital),
      recallableDistributions: cloneMoney(capital.recallableDistributions),
      availableRecallCapacity: cloneMoney(capital.availableRecallCapacity),
      outstandingCalls: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      remainingCallable: cloneMoney(capital.uncalledCapital),
      unfunded: cloneMoney(capital.uncalledCapital),
    },
    expenses: {
      managementFeesPaid: cloneMoney(capital.managementFeesPaid),
      otherExpensesPaid: cloneMoney(capital.otherExpensesPaid),
    },
    value: {
      portfolioFmv: cloneMoney(capital.portfolioFmv),
      nav: cloneMoney(capital.nav),
      realizedFundProceeds: cloneMoney(capital.realizedFundProceeds),
      distributionsToPartners: cloneMoney(capital.distributionsToPartners),
    },
    valuation: {
      valuationDate: valuation.valuationDate,
      rosterCount: valuation.roster.length,
      markedCount: valuation.marks.length,
      companies,
    },
    performance: {
      dpi: cloneMoney(capital.dpi),
      rvpi: cloneMoney(capital.rvpi),
      tvpi: cloneMoney(capital.tvpi),
    },
    actionability: {
      scope: 'actuals_reporting',
      status: reasonCodes.length === 0 ? 'actionable' : 'blocked',
      reasonCodes,
    },
  });
}
