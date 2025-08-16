/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title }: { title: string }) => (
  <div className="h-64 bg-gray-50 rounded-lg flex flex-col items-center justify-center">
    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
      <div className="h-8 w-8 text-gray-400">📊</div>
    </div>
    <p className="text-gray-500 font-medium">{title}</p>
    <p className="text-gray-400 text-sm mt-1">Chart placeholder - data available via API</p>
  </div>
);

const cohortData = [
  { vintage: '2020', irr: 45.2, multiple: 3.1 },
  { vintage: '2021', irr: 38.7, multiple: 2.8 },
  { vintage: '2022', irr: 28.1, multiple: 2.2 },
];

export default function CohortAnalysisChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-800">
          Cohort Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartPlaceholder title="Cohort Analysis Chart" />
        
        <div className="grid grid-cols-3 gap-4 text-center">
          {cohortData.map((cohort, index) => (
            <div key={index}>
              <p className="text-sm text-gray-600">{cohort.vintage} Vintage</p>
              <p className="text-lg font-bold text-gray-800">{cohort.irr}% IRR</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

