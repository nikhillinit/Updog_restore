import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useFundContext } from '@/contexts/FundContext';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

export default function FinancialModeling() {
  const { fundId, currentFund } = useFundContext();

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Workspace row (D-F.2). Comparison surface: Construction and Current
          render side by side by nature, and the indicator reflects that (D-E). */}
      <WorkspaceNav
        fundId={fundId !== null ? String(fundId) : null}
        fundLabel={currentFund?.name ?? 'No fund selected'}
        active="forecast"
        indicator={<WorkspaceBasisIndicator mode="side-by-side" />}
      />
      <div className="mb-8 mt-6">
        <h1 className="text-3xl font-bold">Financial Modeling & Forecasting</h1>
        <p className="text-muted-foreground mt-2">
          Fund-scoped forecasts from current fund inputs. Forward-looking values are labeled as
          projections.
        </p>
      </div>

      <Tabs defaultValue="forecast" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="forecast">Fund Projection</TabsTrigger>
          <TabsTrigger value="modeling">Scenario Modeling</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast">
          <ErrorBoundary>
            <DualForecastDashboard />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="modeling">
          <Card>
            <CardHeader>
              <CardTitle>Scenario modeling remains deferred</CardTitle>
              <CardDescription>
                The fund projection tab is the current source for forward-looking values. The
                scenario-modeling tab is intentionally not presenting hardcoded KPI cards or
                placeholder charts as if they were production actuals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Use the fund projection tab for forecasts backed by the current fund context and
                published inputs.
              </p>
              <p>
                Additional scenario-modeling and reserve-analysis work remains queued until those
                sections can be backed by authoritative inputs instead of placeholder content.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
