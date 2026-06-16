import { Badge } from '@/components/ui/badge';
import { WorkPanel } from '@/components/work-panel/WorkPanel';
import type { WorkPanelState } from '@/components/work-panel/work-panel-types';
import type { StressTestScenario } from '@/core/LiquidityEngine';
import { getImpactBadgeClass, getImpactTextClass } from '@/lib/display/impact-semantics';
import { toStressScenarioProofRows, toStressScenarioViewModel } from './stress-test-view-model';

export function StressScenarioProofPanel({
  scenarios,
  baselineCash,
  state,
  onClose,
}: {
  scenarios: StressTestScenario[];
  baselineCash: number;
  state: WorkPanelState | null;
  onClose: () => void;
}) {
  const isOpen = state?.panel === 'scenario';
  const index = state?.object != null ? Number(state.object) : Number.NaN;
  const scenario = Number.isInteger(index) && index >= 0 ? scenarios[index] : undefined;

  if (!scenario) {
    return (
      <WorkPanel open={isOpen} onClose={onClose} title="Scenario proof">
        <p className="text-sm text-charcoal-600">
          This scenario is unavailable. Run the stress test to view its proof.
        </p>
      </WorkPanel>
    );
  }

  const vm = toStressScenarioViewModel(scenario, baselineCash);
  const rows = toStressScenarioProofRows(vm, baselineCash);

  return (
    <WorkPanel open={isOpen} onClose={onClose} title={vm.name} description={vm.description}>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-charcoal-600">{row.label}</dt>
            <dd
              className={
                row.key === 'impact'
                  ? `text-sm font-medium ${getImpactTextClass({
                      direction: vm.impactDirection,
                      severity: vm.impactSeverity,
                    })}`
                  : 'text-sm font-medium text-charcoal-900'
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <Badge className={getImpactBadgeClass(vm.impactSeverity)}>{vm.impactSeverity} impact</Badge>
      </div>
    </WorkPanel>
  );
}
