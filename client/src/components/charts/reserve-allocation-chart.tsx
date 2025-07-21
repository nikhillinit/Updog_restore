import { useReserveData } from '@/hooks/use-engine-data';
import NivoAllocationPie from './nivo-allocation-pie';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

interface ReserveAllocationChartProps {
  fundId: number;
}

export default function ReserveAllocationChart({ fundId }: ReserveAllocationChartProps) {
  const { data: reserveData, loading, error } = useReserveData(fundId);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Reserve Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Reserve Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-red-500">
            <AlertCircle className="h-6 w-6 mr-2" />
            <span>Error loading reserve data: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform reserve engine data to allocation pie chart format
  const pieData = reserveData.map((item, index) => ({
    id: `company-${index + 1}`,
    label: `Company ${index + 1}`,
    value: item.allocation,
    confidence: item.confidence
  }));

  // Calculate summary stats
  const totalAllocation = reserveData.reduce((sum, item) => sum + item.allocation, 0);
  const avgConfidence = reserveData.reduce((sum, item) => sum + item.confidence, 0) / reserveData.length;
  const highConfidenceCount = reserveData.filter(item => item.confidence >= 0.7).length;

  return (
    <div className="space-y-6">
      <NivoAllocationPie 
        title="Reserve Allocations by Portfolio Company"
        data={pieData}
        height={400}
      />
      
      {/* Engine Insights Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Reserves</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ${(totalAllocation / 1000000).toFixed(1)}M
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Avg Confidence</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {(avgConfidence * 100).toFixed(0)}%
                </p>
                <div className="flex items-center mt-2">
                  {avgConfidence >= 0.7 ? (
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-orange-500 mr-1" />
                  )}
                  <span className={`text-sm font-medium ${avgConfidence >= 0.7 ? 'text-green-600' : 'text-orange-600'}`}>
                    {avgConfidence >= 0.7 ? 'High confidence' : 'Cold-start mode'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">High Confidence</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {highConfidenceCount}/{reserveData.length}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {((highConfidenceCount / reserveData.length) * 100).toFixed(0)}% of positions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reserve Strategy Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Reserve Strategy Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {reserveData.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Company {index + 1}</p>
                  <p className="text-sm text-gray-600">{item.rationale}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800">
                    ${(item.allocation / 1000000).toFixed(1)}M
                  </p>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                    item.confidence >= 0.7 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-orange-50 text-orange-700'
                  }`}>
                    {(item.confidence * 100).toFixed(0)}% confidence
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}