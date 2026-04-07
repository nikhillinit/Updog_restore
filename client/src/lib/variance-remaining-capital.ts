export type RemainingCapitalInputs = {
  actualCommitted: number | null;
  actualDeployed: number | null;
  targetDeployed: number | null;
};

export type RemainingCapitalSummary = {
  remainingDeployableCapital: number | null;
  plannedRemainingDeployableCapital: number | null;
  remainingDeployableGap: number | null;
};

export function computeRemainingCapital(inputs: RemainingCapitalInputs): RemainingCapitalSummary {
  const { actualCommitted, actualDeployed, targetDeployed } = inputs;

  const remainingDeployableCapital =
    actualCommitted != null && actualDeployed != null
      ? Math.max(actualCommitted - actualDeployed, 0)
      : null;

  const plannedRemainingDeployableCapital =
    actualCommitted != null && targetDeployed != null
      ? Math.max(actualCommitted - targetDeployed, 0)
      : null;

  const remainingDeployableGap =
    remainingDeployableCapital != null && plannedRemainingDeployableCapital != null
      ? remainingDeployableCapital - plannedRemainingDeployableCapital
      : null;

  return {
    remainingDeployableCapital,
    plannedRemainingDeployableCapital,
    remainingDeployableGap,
  };
}
