import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Info, TrendingUp } from 'lucide-react';

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
    name: 'Default',
    rounds: [
      {
        round: 'Pre-Seed',
        roundSize: 625000,
        valuation: 6750000,
        esop: 10.0,
        graduationRate: 70.0,
        exitRate: 0.0,
        failureRate: 30.0,
        exitValuation: 15000000,
        timeToGraduate: 18,
      },
      {
        round: 'Seed',
        roundSize: 3700000,
        valuation: 15000000,
        esop: 10.0,
        graduationRate: 50.0,
        exitRate: 0.0,
        failureRate: 50.0,
        exitValuation: 48000000,
        timeToGraduate: 24,
      },
      {
        round: 'Series A',
        roundSize: 10000000,
        valuation: 48000000,
        esop: 7.5,
        graduationRate: 50.0,
        exitRate: 10.0,
        failureRate: 40.0,
        exitValuation: 125000000,
        timeToGraduate: 30,
      },
      {
        round: 'Series B',
        roundSize: 22500000,
        valuation: 125000000,
        esop: 6.5,
        graduationRate: 65.0,
        exitRate: 15.0,
        failureRate: 20.0,
        exitValuation: 277000000,
        timeToGraduate: 36,
      },
      {
        round: 'Series C',
        roundSize: 35000000,
        valuation: 277000000,
        esop: 5.4,
        graduationRate: 70.0,
        exitRate: 20.0,
        failureRate: 10.0,
        exitValuation: 474000000,
        timeToGraduate: 42,
      },
      {
        round: 'Series D',
        roundSize: 57500000,
        valuation: 474000000,
        esop: 4.8,
        graduationRate: 75.0,
        exitRate: 20.0,
        failureRate: 5.0,
        exitValuation: 1654000000,
        timeToGraduate: 48,
      },
      {
        round: 'Series E+',
        roundSize: 60000000,
        valuation: 1654000000,
        esop: 2.5,
        graduationRate: 0.0,
        exitRate: 100.0,
        failureRate: 0.0,
        exitValuation: 2000000000,
        timeToGraduate: 60,
      },
    ],
  });

  const updateRoundData = (roundIndex: number, field: keyof RoundData, value: number) => {
    setSectorProfile((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round, index) =>
        index === roundIndex ? { ...round, [field]: value } : round
      ),
    }));
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getRoundColor = (round: string) => {
    const colors: Record<string, string> = {
      'Pre-Seed': 'bg-[#cfe7df] text-pov-charcoal border-[#cfe7df]',
      Seed: 'bg-[#ddd6f5] text-pov-charcoal border-[#ddd6f5]',
      'Series A': 'bg-[#efd9bd] text-pov-charcoal border-[#efd9bd]',
      'Series B': 'bg-[#f2d7dc] text-pov-charcoal border-[#f2d7dc]',
      'Series C': 'bg-[#cfe7df] text-pov-charcoal border-[#cfe7df]',
      'Series D': 'bg-[#ddd6f5] text-pov-charcoal border-[#ddd6f5]',
      'Series E+': 'bg-pov-gray text-charcoal-700 border-beige-200',
    };
    return colors[round] || 'bg-pov-gray text-charcoal-700 border-beige-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Sector Profile Builder</CardTitle>
              <p className="text-charcoal-600 mt-1">
                Configure market-driven assumptions for valuations, graduation rates, and exit
                patterns
              </p>
            </div>
            <Badge
              variant="outline"
              className="bg-presson-info/10 text-presson-info border-presson-info/20"
            >
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
            <Info className="w-5 h-5 text-presson-info mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-pov-charcoal mb-2">Market-Driven Methodology</h3>
              <p className="text-sm text-charcoal-600 mb-3">
                Instead of setting fixed exit multiples, this approach builds up performance
                expectations from granular market assumptions:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-charcoal-600">
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
          <p className="text-sm text-charcoal-600">
            Configure market expectations for each funding round
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-pov-gray">
                  <th className="text-left py-3 px-4 font-medium text-charcoal-600">Round</th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">
                    Round Size
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">Valuation</th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">ESOP (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">
                    Graduation (%)
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">Exit (%)</th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">
                    Failure (%)
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">
                    Exit Valuation
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-charcoal-600">
                    Time to Graduate (mo)
                  </th>
                </tr>
              </thead>
              <tbody>
                {sectorProfile.rounds.map((round, index) => (
                  <tr key={round.round} className="border-b hover:bg-pov-gray">
                    <td className="py-3 px-4">
                      <Badge className={getRoundColor(round.round)}>{round.round}</Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.roundSize}
                        onChange={(e) =>
                          updateRoundData(index, 'roundSize', parseFloat(e.target.value) || 0)
                        }
                        className="w-24 h-8 text-center bg-warning/10 border-warning/50"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.valuation}
                        onChange={(e) =>
                          updateRoundData(index, 'valuation', parseFloat(e.target.value) || 0)
                        }
                        className="w-32 h-8 text-center bg-warning/10 border-warning/50"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <Input
                          type="number"
                          step="0.1"
                          value={round.esop}
                          onChange={(e) =>
                            updateRoundData(index, 'esop', parseFloat(e.target.value) || 0)
                          }
                          className="w-16 h-8 text-center bg-warning/10 border-warning/50"
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
                          onChange={(e) =>
                            updateRoundData(
                              index,
                              'graduationRate',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-16 h-8 text-center bg-warning/10 border-warning/50"
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
                          onChange={(e) =>
                            updateRoundData(index, 'exitRate', parseFloat(e.target.value) || 0)
                          }
                          className="w-16 h-8 text-center bg-warning/10 border-warning/50"
                        />
                        <span className="text-xs ml-1">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <span className="text-sm text-error font-medium">
                          {formatPercentage(round.failureRate)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.exitValuation}
                        onChange={(e) =>
                          updateRoundData(index, 'exitValuation', parseFloat(e.target.value) || 0)
                        }
                        className="w-32 h-8 text-center bg-warning/10 border-warning/50"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Input
                        type="number"
                        value={round.timeToGraduate}
                        onChange={(e) =>
                          updateRoundData(index, 'timeToGraduate', parseFloat(e.target.value) || 0)
                        }
                        className="w-20 h-8 text-center bg-warning/10 border-warning/50"
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
          <p className="text-sm text-charcoal-600">
            Based on graduation rates, exit rates, and market valuations
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-presson-positive/10 rounded-lg">
              <div className="text-2xl font-bold text-presson-positive">5.40x</div>
              <div className="text-sm text-presson-positive mt-1">Expected MOIC</div>
              <div className="text-xs text-charcoal-600 mt-2">
                Probability-weighted across all exit scenarios
              </div>
            </div>

            <div className="text-center p-4 bg-presson-info/10 rounded-lg">
              <div className="text-2xl font-bold text-presson-info">33.33%</div>
              <div className="text-sm text-presson-info mt-1">Reserve Ratio</div>
              <div className="text-xs text-charcoal-600 mt-2">
                Auto-calculated from follow-on strategy
              </div>
            </div>

            <div className="text-center p-4 bg-presson-positive/10 rounded-lg">
              <div className="text-2xl font-bold text-presson-positive">18.5%</div>
              <div className="text-sm text-presson-positive mt-1">Overall Success Rate</div>
              <div className="text-xs text-charcoal-600 mt-2">
                Companies achieving meaningful exits
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline">Import Market Data</Button>
        <div className="space-x-2">
          <Button variant="outline">Save as Template</Button>
          <Button>Apply to Allocations</Button>
        </div>
      </div>
    </div>
  );
}
