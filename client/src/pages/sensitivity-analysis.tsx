import { BacktestingWorkspace } from '@/components/backtesting/BacktestingWorkspace';
import { OneWayPanel } from '@/components/sensitivity/OneWayPanel';
import { TwoWayPanel } from '@/components/sensitivity/TwoWayPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFundContext } from '@/contexts/FundContext';

const COMING_SOON_TABS = [{ value: 'stress', label: 'Stress Testing' }] as const;

export default function SensitivityAnalysisPage() {
  const { fundId } = useFundContext();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Sensitivity Analysis</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Monte Carlo backtesting, one-way parameter sensitivity, and two-way parameter sensitivity
          are live. Stress-testing remains intentionally disabled until it has a fund-scoped backend
          endpoint, a stable comparison contract, and persisted scenario data behind it.
        </p>
      </div>

      <Tabs defaultValue="monte-carlo" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
          <TabsTrigger value="monte-carlo">Monte Carlo Backtesting</TabsTrigger>
          <TabsTrigger value="one-way">One-Way Analysis</TabsTrigger>
          <TabsTrigger value="two-way">Two-Way Sensitivity</TabsTrigger>
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

        <TabsContent value="one-way" className="mt-0">
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="flex flex-col gap-1 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Live now</p>
              <p>
                One-way parameter sensitivity sweeps using the deterministic shared engines. Vary
                one fund-config parameter across a range and observe how a single metric responds.
              </p>
            </CardContent>
          </Card>
          <div className="mt-6">
            <OneWayPanel fundId={fundId} />
          </div>
        </TabsContent>

        <TabsContent value="two-way" className="mt-0">
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="flex flex-col gap-1 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Live now</p>
              <p>
                Two-way deterministic parameter sweeps over the published fund config. Vary two
                parameters across grids and observe how a single metric responds.
              </p>
            </CardContent>
          </Card>
          <div className="mt-6">
            <TwoWayPanel fundId={fundId} />
          </div>
        </TabsContent>

        {COMING_SOON_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card className="border-dashed border-slate-300 bg-slate-50">
              <CardContent className="px-6 py-8 text-center text-sm text-slate-600">
                {tab.label} stays disabled until this surface has a fund-scoped backend endpoint, a
                comparison contract, and persisted scenario data for that mode.
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
