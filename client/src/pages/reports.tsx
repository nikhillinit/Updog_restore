import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TactycReports from "@/components/reports/tactyc-reports";
import TearSheetDashboard from "@/components/reports/tear-sheet-dashboard";

export default function Reports() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reports & Documentation</h1>
          <p className="text-gray-600 mt-1">Generate comprehensive fund reports and tear sheets</p>
        </div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reports">Fund Reports</TabsTrigger>
            <TabsTrigger value="tear-sheets">Tear Sheets</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="mt-6">
            <TactycReports />
          </TabsContent>

          <TabsContent value="tear-sheets" className="mt-6">
            <TearSheetDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}