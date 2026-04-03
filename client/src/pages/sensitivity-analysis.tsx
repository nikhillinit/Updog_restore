import { BacktestingWorkspace } from '@/components/backtesting/BacktestingWorkspace';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFundContext } from '@/contexts/FundContext';

const COMING_SOON_TABS = [
  { value: 'one-way', label: 'One-Way Analysis' },
  { value: 'two-way', label: 'Two-Way Sensitivity' },
  { value: 'stress', label: 'Stress Testing' },
] as const;

export default function SensitivityAnalysisPage() {
  const { fundId } = useFundContext();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Sensitivity Analysis</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Monte Carlo backtesting is the first live workspace in this surface. One-way, two-way, and
          stress-test tools remain planned and are intentionally marked as coming soon.
        </p>
      </div>

      <Tabs defaultValue="monte-carlo" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
          <TabsTrigger value="monte-carlo">Monte Carlo Backtesting</TabsTrigger>
          {COMING_SOON_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} disabled>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="monte-carlo" className="mt-0">
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="flex flex-col gap-1 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Live now</p>
              <p>
                Run fund-scoped async backtests, compare historical scenarios, resume work from
                queued jobs, and review persisted history from the shared backtesting stack.
              </p>
            </CardContent>
          </Card>

          <BacktestingWorkspace
            fundId={fundId}
            showHeader={false}
            containerClassName="px-0 pt-6 pb-0"
          />
        </TabsContent>

        {COMING_SOON_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card className="border-dashed border-slate-300 bg-slate-50">
              <CardContent className="px-6 py-8 text-center text-sm text-slate-600">
                {tab.label} is planned but not yet wired to a fund-backed backend.
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
