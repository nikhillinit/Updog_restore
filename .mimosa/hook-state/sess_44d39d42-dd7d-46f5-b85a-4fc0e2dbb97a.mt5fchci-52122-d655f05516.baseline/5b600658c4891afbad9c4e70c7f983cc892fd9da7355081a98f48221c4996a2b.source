import { lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReportsComponent from '@/components/reports/reports';

// Tear Sheets are mock-backed and ship a client-side PDF export that fabricates fund
// facts. Build-exclude the entire dashboard (and its chunk) from production:
// `import.meta.env.DEV` is statically replaced with `false` in production builds, so the
// dynamic import in the dead branch is dropped by Rollup and no chunk is emitted.
const SHOW_TEAR_SHEETS = import.meta.env.DEV;
const TearSheetDashboard = SHOW_TEAR_SHEETS
  ? lazy(() => import('@/components/reports/tear-sheet-dashboard'))
  : null;

export default function Reports() {
  return (
    <div className="min-h-screen bg-pov-gray">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-pov-charcoal">Reports & Documentation</h1>
          <p className="text-charcoal-600 mt-1">
            Generate comprehensive fund reports and tear sheets
          </p>
        </div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className={`grid w-full ${SHOW_TEAR_SHEETS ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="reports">Fund Reports</TabsTrigger>
            {SHOW_TEAR_SHEETS && <TabsTrigger value="tear-sheets">Tear Sheets</TabsTrigger>}
          </TabsList>

          <TabsContent value="reports" className="mt-6">
            <ReportsComponent />
          </TabsContent>

          {SHOW_TEAR_SHEETS && TearSheetDashboard && (
            <TabsContent value="tear-sheets" className="mt-6">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center p-12" role="status">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pov-charcoal mx-auto mb-4"></div>
                      <p className="text-charcoal-600">Preparing tear sheet workspace...</p>
                    </div>
                  </div>
                }
              >
                <TearSheetDashboard />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
