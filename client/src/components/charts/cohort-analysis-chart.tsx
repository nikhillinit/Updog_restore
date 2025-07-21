import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cohortData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="vintage" 
                stroke="#666"
                fontSize={12}
              />
              <YAxis 
                stroke="#666"
                fontSize={12}
              />
              <Tooltip 
                formatter={(value, name) => [
                  `${value}${name === 'irr' ? '%' : 'x'}`, 
                  name === 'irr' ? 'IRR' : 'Multiple'
                ]}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
              <Bar dataKey="irr" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
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
