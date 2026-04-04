import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function FinancialModeling() {
  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Financial Modeling & Forecasting</h1>
        <p className="text-muted-foreground mt-2">
          Advanced scenario planning with live fund performance data
        </p>
      </div>

      <Tabs defaultValue="forecast" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="forecast">Live Forecasting</TabsTrigger>
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
                The canonical deterministic surface is now the live forecasting tab. The
                scenario-modeling tab is intentionally not presenting hardcoded KPI cards or
                placeholder charts as if they were live data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Use the live forecasting tab for the truthful deterministic surface backed by
                current fund context and real API data.
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
