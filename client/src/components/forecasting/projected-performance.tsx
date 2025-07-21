import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConstructionActualComparison } from "./construction-actual-comparison";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Calendar } from "lucide-react";

interface PerformanceData {
  month: string;
  date: string;
  constructionProjection: number;
  actual: number;
  currentProjection: number;
  tvpiConstruction: number;
  tvpiActual: number;
  tvpiCurrent: number;
}

export default function ProjectedPerformance() {
  const [entryRound, setEntryRound] = useState<string>("all-rounds");
  const [timePeriod, setTimePeriod] = useState<string>("monthly");

  // Sample data based on your Tactyc screenshots
  const performanceData: PerformanceData[] = [
    { month: "Jan 2022", date: "2022-01", constructionProjection: 10, actual: 8, currentProjection: 10, tvpiConstruction: 1.0, tvpiActual: 1.0, tvpiCurrent: 1.0 },
    { month: "Mar 2022", date: "2022-03", constructionProjection: 12, actual: 11, currentProjection: 12, tvpiConstruction: 1.1, tvpiActual: 1.05, tvpiCurrent: 1.1 },
    { month: "Jun 2022", date: "2022-06", constructionProjection: 15, actual: 14, currentProjection: 15, tvpiConstruction: 1.2, tvpiActual: 1.15, tvpiCurrent: 1.2 },
    { month: "Sep 2022", date: "2022-09", constructionProjection: 18, actual: 16, currentProjection: 18, tvpiConstruction: 1.4, tvpiActual: 1.25, tvpiCurrent: 1.35 },
    { month: "Dec 2022", date: "2022-12", constructionProjection: 22, actual: 19, currentProjection: 21, tvpiConstruction: 1.6, tvpiActual: 1.35, tvpiCurrent: 1.5 },
    { month: "Mar 2023", date: "2023-03", constructionProjection: 26, actual: 22, currentProjection: 25, tvpiConstruction: 1.8, tvpiActual: 1.45, tvpiCurrent: 1.65 },
    { month: "Jun 2023", date: "2023-06", constructionProjection: 30, actual: 25, currentProjection: 28, tvpiConstruction: 2.0, tvpiActual: 1.55, tvpiCurrent: 1.8 },
    { month: "Sep 2023", date: "2023-09", constructionProjection: 34, actual: 28, currentProjection: 32, tvpiConstruction: 2.3, tvpiActual: 1.75, tvpiCurrent: 2.1 },
    { month: "Dec 2023", date: "2023-12", constructionProjection: 38, actual: 32, currentProjection: 36, tvpiConstruction: 2.6, tvpiActual: 1.95, tvpiCurrent: 2.4 },
    { month: "Mar 2024", date: "2024-03", constructionProjection: 42, actual: 35, currentProjection: 40, tvpiConstruction: 2.9, tvpiActual: 2.15, tvpiCurrent: 2.7 },
    { month: "Jun 2024", date: "2024-06", constructionProjection: 46, actual: 38, currentProjection: 44, tvpiConstruction: 3.2, tvpiActual: 2.35, tvpiCurrent: 3.0 },
    { month: "Sep 2024", date: "2024-09", constructionProjection: 50, actual: 42, currentProjection: 48, tvpiConstruction: 3.5, tvpiActual: 2.55, tvpiCurrent: 3.3 },
    { month: "Dec 2024", date: "2024-12", constructionProjection: 54, actual: 45, currentProjection: 52, tvpiConstruction: 3.8, tvpiActual: 2.75, tvpiCurrent: 3.6 },
    { month: "Mar 2025", date: "2025-03", constructionProjection: 54, actual: 45, currentProjection: 54, tvpiConstruction: 4.0, tvpiActual: 2.85, tvpiCurrent: 3.8 },
    { month: "Jun 2025", date: "2025-06", constructionProjection: 54, actual: 45, currentProjection: 54, tvpiConstruction: 4.2, tvpiActual: 2.95, tvpiCurrent: 4.0 }
  ];

  const formatTooltip = (value: number, name: string) => {
    if (name.includes('TVPI')) {
      return [`${value.toFixed(2)}x`, name];
    }
    return [value, name];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Projected Fund Performance</span>
          </CardTitle>
          <CardDescription>
            Track actual vs projected performance over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Entry Round:</label>
              <Select value={entryRound} onValueChange={setEntryRound}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-rounds">All Rounds</SelectItem>
                  <SelectItem value="seed">Seed</SelectItem>
                  <SelectItem value="series-a">Series A</SelectItem>
                  <SelectItem value="series-b">Series B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Time Period:</label>
              <Select value={timePeriod} onValueChange={setTimePeriod}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Initial Investment Pacing */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Initial investment pacing (number of deals)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        fontSize={10}
                      />
                      <YAxis />
                      <Tooltip formatter={formatTooltip} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="constructionProjection" 
                        stroke="#94a3b8" 
                        strokeDasharray="5 5"
                        name="Construction Projection"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#3b82f6" 
                        name="Actual"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="currentProjection" 
                        stroke="#10b981" 
                        name="Current Projection"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* TVPI Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">TVPI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        fontSize={10}
                      />
                      <YAxis />
                      <Tooltip formatter={formatTooltip} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="tvpiConstruction" 
                        stroke="#94a3b8" 
                        strokeDasharray="5 5"
                        name="Construction Projection"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="tvpiActual" 
                        stroke="#3b82f6" 
                        name="Actual"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="tvpiCurrent" 
                        stroke="#10b981" 
                        name="Current Projection"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">1.04x</div>
              <div className="text-sm text-muted-foreground">Est. Actual TVPI</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">3.55x</div>
              <div className="text-sm text-muted-foreground">Projected TVPI</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">45</div>
              <div className="text-sm text-muted-foreground">Deals to Date</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">9</div>
              <div className="text-sm text-muted-foreground">Remaining Deals</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Construction vs Actual Analysis */}
      <ConstructionActualComparison />
    </div>
  );
}