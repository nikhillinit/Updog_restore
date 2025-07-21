import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState } from "react";

interface PerformanceData {
  month: string;
  portfolioValue: number;
  irr: number;
}

const sampleData: PerformanceData[] = [
  { month: 'Jan 2023', portfolioValue: 85, irr: 18.5 },
  { month: 'Feb 2023', portfolioValue: 88, irr: 19.2 },
  { month: 'Mar 2023', portfolioValue: 92, irr: 21.8 },
  { month: 'Apr 2023', portfolioValue: 89, irr: 20.1 },
  { month: 'May 2023', portfolioValue: 95, irr: 24.3 },
  { month: 'Jun 2023', portfolioValue: 102, irr: 26.7 },
  { month: 'Jul 2023', portfolioValue: 98, irr: 25.1 },
  { month: 'Aug 2023', portfolioValue: 105, irr: 27.8 },
  { month: 'Sep 2023', portfolioValue: 110, irr: 28.4 },
];

export default function PortfolioPerformanceChart() {
  const [timeRange, setTimeRange] = useState('YTD');

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-800">
            Portfolio Performance
          </CardTitle>
          <div className="flex space-x-2">
            {['YTD', '1Y', '3Y'].map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
                className={timeRange === range ? 'povc-bg-primary-light text-blue-700 border-blue-200' : ''}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="month" 
                stroke="#666"
                fontSize={12}
              />
              <YAxis 
                yAxisId="left"
                stroke="#666"
                fontSize={12}
                label={{ value: 'Portfolio Value (M)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                stroke="#666"
                fontSize={12}
                label={{ value: 'IRR (%)', angle: 90, position: 'insideRight' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="portfolioValue" 
                stroke="#3b82f6" 
                strokeWidth={3}
                name="Portfolio Value ($M)"
                dot={{ r: 4 }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="irr" 
                stroke="#06b6d4" 
                strokeWidth={3}
                name="IRR (%)"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
