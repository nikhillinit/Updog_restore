import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title }: { title: string }) => (
  <div className="h-64 bg-pov-gray rounded-lg flex flex-col items-center justify-center">
    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4">
      <div className="h-8 w-8 text-charcoal-400">[chart]</div>
    </div>
    <p className="text-charcoal-500 font-medium">{title}</p>
    <p className="text-charcoal-400 text-sm mt-1">Chart placeholder - data available via API</p>
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
        <CardTitle className="text-lg font-semibold text-pov-charcoal">Cohort Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartPlaceholder title="Cohort Analysis Chart" />

        <div className="grid grid-cols-3 gap-4 text-center">
          {cohortData.map((cohort, index) => (
            <div key={index}>
              <p className="text-sm text-charcoal-600">{cohort.vintage} Vintage</p>
              <p className="text-lg font-bold text-pov-charcoal">{cohort.irr}% IRR</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
