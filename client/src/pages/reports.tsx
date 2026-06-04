import { lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReportsComponent from '@/components/reports/reports';

// Lazy-load PDF generation to reduce initial bundle size (saves ~430 KB gzipped)
const TearSheetDashboard = lazy(() => import('@/components/reports/tear-sheet-dashboard'));

export default function Reports() {
  return (
    <div className="min-h-screen bg-pov-gray">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-pov-charcoal">Reports & Documentation</h1>
          <p className="text-charcoal-600 mt-1">Generate comprehensive fund reports and tear sheets</p>
        </div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reports">Fund Reports</TabsTrigger>
            <TabsTrigger value="tear-sheets">Tear Sheets</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="mt-6">
            <ReportsComponent />
          </TabsContent>

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
        </Tabs>
      </div>
    </div>
  );
}
