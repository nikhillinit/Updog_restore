import { BacktestingWorkspace } from '@/components/backtesting/BacktestingWorkspace';
import { OneWayPanel } from '@/components/sensitivity/OneWayPanel';
import { TwoWayPanel } from '@/components/sensitivity/TwoWayPanel';
import { StressPanel } from '@/components/sensitivity/StressPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFundContext } from '@/contexts/FundContext';

export default function SensitivityAnalysisPage() {
  const { fundId } = useFundContext();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Sensitivity Analysis</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Sensitivity analysis surface: Monte Carlo backtesting, one-way and two-way parameter
          sweeps, and named stress scenarios -- all fund-scoped and persisted.
        </p>
      </div>

      <Tabs defaultValue="monte-carlo" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
          <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
          <TabsTrigger value="one-way">One-Way</TabsTrigger>
          <TabsTrigger value="two-way">Two-Way</TabsTrigger>
          <TabsTrigger value="stress">Stress</TabsTrigger>
        </TabsList>

        <TabsContent value="monte-carlo" className="mt-0">
          <BacktestingWorkspace
            fundId={fundId}
            showHeader={false}
            containerClassName="px-0 pt-0 pb-0"
          />
        </TabsContent>

        <TabsContent value="one-way" className="mt-0">
          <OneWayPanel fundId={fundId} />
        </TabsContent>

        <TabsContent value="two-way" className="mt-0">
          <TwoWayPanel fundId={fundId} />
        </TabsContent>

        <TabsContent value="stress" className="mt-0">
          <StressPanel fundId={fundId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
