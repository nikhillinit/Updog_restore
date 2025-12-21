/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Info, TrendingUp } from "lucide-react";

interface RoundData {
  round: string;
  roundSize: number;
  valuation: number;
  esop: number;
  graduationRate: number;
  exitRate: number;
  failureRate: number;
  exitValuation: number;
  timeToGraduate: number; // months
}

interface SectorProfileData {
  name: string;
  rounds: RoundData[];
}

export default function SectorProfileBuilder() {
  const [sectorProfile, setSectorProfile] = useState<SectorProfileData>({
    name: "Default",
    rounds: [
      {
        round: "Pre-Seed",
        roundSize: 625000,
        valuation: 6750000,
        esop: 10.00,
        graduationRate: 70.00,
        exitRate: 0.00,
        failureRate: 30.00,
        exitValuation: 15000000,
        timeToGraduate: 18
      },
      {
        round: "Seed",
        roundSize: 3700000,
        valuation: 15000000,
        esop: 10.00,
        graduationRate: 50.00,
        exitRate: 0.00,
        failureRate: 50.00,
        exitValuation: 48000000,
        timeToGraduate: 24
      },
      {
        round: "Series A",
        roundSize: 10000000,
        valuation: 48000000,
        esop: 7.50,
        graduationRate: 50.00,
        exitRate: 10.00,
        failureRate: 40.00,
        exitValuation: 125000000,
        timeToGraduate: 30
      },
      {
        round: "Series B",
        roundSize: 22500000,
        valuation: 125000000,
        esop: 6.50,
        graduationRate: 65.00,
        exitRate: 15.00,
        failureRate: 20.00,
        exitValuation: 277000000,
        timeToGraduate: 36
      },
      {
        round: "Series C",
        roundSize: 35000000,
        valuation: 277000000,
        esop: 5.40,
        graduationRate: 70.00,
        exitRate: 20.00,
        failureRate: 10.00,
        exitValuation: 474000000,
        timeToGraduate: 42
      },
      {
        round: "Series D",
        roundSize: 57500000,
        valuation: 474000000,
        esop: 4.80,
        graduationRate: 75.00,
        exitRate: 20.00,
        failureRate: 5.00,
        exitValuation: 1654000000,
        timeToGraduate: 48
      },
      {
        round: "Series E+",
        roundSize: 60000000,
        valuation: 1654000000,
        esop: 2.50,
        graduationRate: 0.00,
        exitRate: 100.00,
        failureRate: 0.00,
        exitValuation: 2000000000,
        timeToGraduate: 60
      }
    ]
  });

  const updateRoundData = (roundIndex: number, field: keyof RoundData, value: number) => {
    setSectorProfile(prev => ({
      ...prev,
      rounds: prev.rounds.map((round: any, index: any) => 
        index === roundIndex 
          ? { ...round, [field]: value }
          : round
      )
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getRoundColor = (round: string) => {
    const colors: Record<string, string> = {
      "Pre-Seed": "bg-green-100 text-green-800",
      "Seed": "bg-blue-100 text-blue-800",
      "Series A": "bg-purple-100 text-purple-800",
      "Series B": "bg-orange-100 text-orange-800",
      "Series C": "bg-red-100 text-red-800",
      "Series D": "bg-indigo-100 text-indigo-800",
      "Series E+": "bg-gray-100 text-gray-800"
    };
    return colors[round] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Sector Profile Builder</CardTitle>
              <p className="text-gray-600 mt-1">
                Configure market-driven assumptions for valuations, graduation rates, and exit patterns
              </p>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              <TrendingUp className="w-3 h-3 mr-1" />
              Market Data Driven
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Market-Driven Methodology Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Market-Driven Methodology</h3>
              <p className="text-sm text-gray-600 mb-3">
                Instead of setting fixed exit multiples, this approach builds up performance expectations from granular market assumptions:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <strong>Market Dynamics:</strong>
                  <ul className="list-disc ml-6 mt-1 space-y-1">
                    <li>Actual valuation step-ups by sector and geography</li>
                    <li>Probability of early exits at lower multiples</li>
                    <li>Impact of follow-on investments on exit multiples</li>
                  </ul>
                </div>
                <div>
                  <strong>Timing Controls:</strong>
                  <ul className="list-disc ml-6 mt-1 space-y-1">
                    <li>Initial investment pacing controlled at allocation level</li>
                    <li>Follow-on timing driven by "Time to Graduate" field</li>
                    <li>Market-driven graduation rates and exit patterns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rounds Configuration Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Valuations and Round Size Expectations</CardTitle>
          <p className="text-sm text-gray-600">Configure market expectations for each funding round</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Round</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Round Size</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Valuation</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">ESOP (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Graduation (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Exit (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Failure (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Exit Valuation</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Time to Graduate (mo)</th>
                </tr>
              </thead>
              <tbody>
                {sectorProfile.rounds.map((round: any, index: any) => (
                  <tr key={round.round} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <Badge className={getRoundColor(round.round)}>
                        {round.round}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.roundSize}
                        onChange={(e: any) => updateRoundData(index, 'roundSize', parseFloat(e.target.value) || 0)}
                        className="w-24 h-8 text-center bg-yellow-50 border-yellow-200"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.valuation}
                        onChange={(e: any) => updateRoundData(index, 'valuation', parseFloat(e.target.value) || 0)}
                        className="w-32 h-8 text-center bg-yellow-50 border-yellow-200"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <Input
                          type="number"
                          step="0.1"
                          value={round.esop}
                          onChange={(e: any) => updateRoundData(index, 'esop', parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                        />
                        <span className="text-xs ml-1">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <Input
                          type="number"
                          step="0.1"
                          value={round.graduationRate}
                          onChange={(e: any) => updateRoundData(index, 'graduationRate', parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                        />
                        <span className="text-xs ml-1">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <Input
                          type="number"
                          step="0.1"
                          value={round.exitRate}
                          onChange={(e: any) => updateRoundData(index, 'exitRate', parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                        />
                        <span className="text-xs ml-1">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <span className="text-sm text-red-600 font-medium">
                          {formatPercentage(round.failureRate)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.exitValuation}
                        onChange={(e: any) => updateRoundData(index, 'exitValuation', parseFloat(e.target.value) || 0)}
                        className="w-32 h-8 text-center bg-yellow-50 border-yellow-200"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.timeToGraduate}
                        onChange={(e: any) => updateRoundData(index, 'timeToGraduate', parseFloat(e.target.value) || 0)}
                        className="w-20 h-8 text-center bg-yellow-50 border-yellow-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Performance Expectations Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Expectations</CardTitle>
          <p className="text-sm text-gray-600">
            Based on graduation rates, exit rates, and market valuations
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">5.40x</div>
              <div className="text-sm text-green-700 mt-1">Expected MOIC</div>
              <div className="text-xs text-gray-600 mt-2">
                Probability-weighted across all exit scenarios
              </div>
            </div>
            
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">33.33%</div>
              <div className="text-sm text-blue-700 mt-1">Reserve Ratio</div>
              <div className="text-xs text-gray-600 mt-2">
                Auto-calculated from follow-on strategy
              </div>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">18.5%</div>
              <div className="text-sm text-purple-700 mt-1">Overall Success Rate</div>
              <div className="text-xs text-gray-600 mt-2">
                Companies achieving meaningful exits
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline">
          Import Market Data
        </Button>
        <div className="space-x-2">
          <Button variant="outline">
            Save as Template
          </Button>
          <Button>
            Apply to Allocations
          </Button>
        </div>
      </div>
    </div>
  );
}
