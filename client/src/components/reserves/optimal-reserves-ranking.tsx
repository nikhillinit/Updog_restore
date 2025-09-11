/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Award,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Info
} from "lucide-react";

interface PerformanceCase {
  caseName: string;
  probability: number;
  exitValuation: number;
  exitMOIC: number;
  initialMOIC: number;
  followOnMOIC: number;
  followOnReserves: number;
}

interface ReserveRanking {
  rank: number;
  company: string;
  followOnMOIC: number; // Probability-weighted Follow-On MOIC across all cases
  planned: number;
  deployed: number;
  totalReserves: number;
  efficiency: number;
  stage: string;
  sector: string;
  performanceCases: PerformanceCase[];
  probabilityAdjustedReserves: number;
  returnTheFund: number;
  exitFMV: number;
}

interface OptimalReservesRankingProps {
  className?: string;
}

export default function OptimalReservesRanking({ className }: OptimalReservesRankingProps) {
  const [_sortBy, _setSortBy] = useState<'rank' | 'moic' | 'planned' | 'deployed'>('rank');
  const [filterStage, _setFilterStage] = useState<string>('all');

  // Calculate Follow-On MOIC using Tactyc methodology
  const calculateFollowOnMOIC = (cases: PerformanceCase[]): number => {
    return cases.reduce((weighted, case_) => {
      return weighted + (case_.followOnMOIC * case_.probability / 100);
    }, 0);
  };

  const calculateProbabilityAdjustedReserves = (cases: PerformanceCase[]): number => {
    return cases.reduce((weighted, case_) => {
      return weighted + (case_.followOnReserves * case_.probability / 100);
    }, 0);
  };

  // Sample reserves ranking data based on exact Tactyc methodology from documentation
  const reserveRankings: ReserveRanking[] = [
    {
      rank: 1,
      company: "Company H",
      followOnMOIC: 6.35, // Highest expected return on follow-on investment
      planned: 900000,
      deployed: 0,
      totalReserves: 900000,
      efficiency: 100,
      stage: "Series B",
      sector: "Enterprise Software",
      performanceCases: [
        { caseName: "Downside", probability: 20, exitValuation: 50000000, exitMOIC: 2.1, initialMOIC: 4.2, followOnMOIC: 1.8, followOnReserves: 500000 },
        { caseName: "Base", probability: 60, exitValuation: 200000000, exitMOIC: 8.4, initialMOIC: 16.8, followOnMOIC: 7.2, followOnReserves: 900000 },
        { caseName: "Upside", probability: 20, exitValuation: 500000000, exitMOIC: 21.0, initialMOIC: 42.0, followOnMOIC: 18.0, followOnReserves: 1200000 }
      ],
      probabilityAdjustedReserves: 900000,
      returnTheFund: 1580000,
      exitFMV: 15600000
    },
    {
      rank: 2,
      company: "Company A",
      followOnMOIC: 5.42,
      planned: 750000,
      deployed: 0,
      totalReserves: 750000,
      efficiency: 100,
      stage: "Series A",
      sector: "Fintech",
      performanceCases: [
        { caseName: "Downside", probability: 25, exitValuation: 40000000, exitMOIC: 1.6, initialMOIC: 3.2, followOnMOIC: 1.2, followOnReserves: 400000 },
        { caseName: "Base", probability: 50, exitValuation: 150000000, exitMOIC: 6.0, initialMOIC: 12.0, followOnMOIC: 5.8, followOnReserves: 750000 },
        { caseName: "Upside", probability: 25, exitValuation: 300000000, exitMOIC: 12.0, initialMOIC: 24.0, followOnMOIC: 11.5, followOnReserves: 1000000 }
      ],
      probabilityAdjustedReserves: 750000,
      returnTheFund: 2450000,
      exitFMV: 12800000
    },
    {
      rank: 3,
      company: "Company B",
      followOnMOIC: 4.45,
      planned: 400000,
      deployed: 0,
      totalReserves: 400000,
      efficiency: 100,
      stage: "Seed",
      sector: "Healthcare",
      performanceCases: [
        { caseName: "Downside", probability: 30, exitValuation: 25000000, exitMOIC: 1.25, initialMOIC: 2.5, followOnMOIC: 1.0, followOnReserves: 300000 },
        { caseName: "Base", probability: 50, exitValuation: 80000000, exitMOIC: 4.0, initialMOIC: 8.0, followOnMOIC: 4.8, followOnReserves: 400000 },
        { caseName: "Upside", probability: 20, exitValuation: 180000000, exitMOIC: 9.0, initialMOIC: 18.0, followOnMOIC: 8.5, followOnReserves: 600000 }
      ],
      probabilityAdjustedReserves: 420000,
      returnTheFund: 2880000,
      exitFMV: 8400000
    },
    {
      rank: 4,
      company: "Company X", // The underperforming example from documentation
      followOnMOIC: 1.65, // Reduced from original 3.98x due to performance adjustment
      planned: 900000,
      deployed: 0,
      totalReserves: 900000,
      efficiency: 62, // Lower efficiency due to underperformance
      stage: "Series A",
      sector: "Consumer",
      performanceCases: [
        { caseName: "Downside", probability: 50, exitValuation: 20000000, exitMOIC: 0.8, initialMOIC: 1.6, followOnMOIC: 0.6, followOnReserves: 400000 },
        { caseName: "Base", probability: 30, exitValuation: 60000000, exitMOIC: 2.4, initialMOIC: 4.8, followOnMOIC: 2.2, followOnReserves: 700000 },
        { caseName: "Upside", probability: 20, exitValuation: 120000000, exitMOIC: 4.8, initialMOIC: 9.6, followOnMOIC: 4.5, followOnReserves: 900000 }
      ],
      probabilityAdjustedReserves: 560000,
      returnTheFund: 4200000,
      exitFMV: 4800000
    },
    {
      rank: 5,
      company: "Company F",
      followOnMOIC: 0.83,
      planned: 400000,
      deployed: 0,
      totalReserves: 400000,
      efficiency: 40,
      stage: "Series A",
      sector: "AI/ML",
      performanceCases: [
        { caseName: "Downside", probability: 70, exitValuation: 8000000, exitMOIC: 0.4, initialMOIC: 0.8, followOnMOIC: 0.2, followOnReserves: 200000 },
        { caseName: "Base", probability: 25, exitValuation: 25000000, exitMOIC: 1.25, initialMOIC: 2.5, followOnMOIC: 1.0, followOnReserves: 300000 },
        { caseName: "Upside", probability: 5, exitValuation: 80000000, exitMOIC: 4.0, initialMOIC: 8.0, followOnMOIC: 3.8, followOnReserves: 500000 }
      ],
      probabilityAdjustedReserves: 245000,
      returnTheFund: 8500000,
      exitFMV: 2100000
    }
  ];

  const totalPlanned = reserveRankings.reduce((sum, item) => sum + item.planned, 0);
  const totalDeployed = reserveRankings.reduce((sum, item) => sum + item.deployed, 0);
  const totalReserves = totalPlanned + totalDeployed;

  const formatMOIC = (value: number) => `${value.toFixed(2)}x`;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const getMOICColor = (moic: number) => {
    if (moic >= 2.5) return 'text-green-600';
    if (moic >= 1.5) return 'text-yellow-600';
    if (moic >= 1.0) return 'text-orange-600';
    return 'text-red-500';
  };

  const getMOICBadgeVariant = (moic: number) => {
    if (moic >= 2.5) return 'default';
    if (moic >= 1.5) return 'secondary';
    return 'destructive';
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 80) return 'bg-green-500';
    if (efficiency >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const filteredRankings = filterStage === 'all' 
    ? reserveRankings 
    : reserveRankings.filter(item => item.stage === filterStage);

  const stages = ['all', ...Array.from(new Set(reserveRankings.map(item => item.stage)))];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Award className="h-5 w-5 text-yellow-600" />
                <span>Optimal Reserves Ranking</span>
              </CardTitle>
              <CardDescription>
                Portfolio companies ranked by their expected return on the next $1 of investment
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {filteredRankings.length} Companies
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Planned</p>
              <p className="text-2xl font-bold">${(totalPlanned / 1000000).toFixed(1)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Deployed</p>
              <p className="text-2xl font-bold">${(totalDeployed / 1000000).toFixed(1)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Reserves</p>
              <p className="text-2xl font-bold">${(totalReserves / 1000000).toFixed(1)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Deployment Rate</p>
              <p className="text-2xl font-bold">{totalReserves > 0 ? ((totalDeployed / totalReserves) * 100).toFixed(1) : 0}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Methodology Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-2">Expected MOIC on Planned Reserves</h4>
              <p className="text-sm text-blue-800">
                Tactyc automatically calculates <strong>Exit MOIC on Planned Reserves</strong> - this is the expected return on the next $1 into each company. 
                The multiple is determined based on deal-level forecasts for exits, future financing rounds and performance cases.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ranking Table */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Company Rankings</CardTitle>
          <CardDescription>
            Companies ranked by follow-on multiple with planned and deployed reserves
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Rank</th>
                  <th className="text-left p-4 font-medium">Company</th>
                  <th className="text-left p-4 font-medium">Follow-on MOIC</th>
                  <th className="text-right p-4 font-medium">Planned</th>
                  <th className="text-right p-4 font-medium">Deployed</th>
                  <th className="text-left p-4 font-medium">Efficiency</th>
                  <th className="text-left p-4 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {filteredRankings.map((ranking) => (
                  <tr key={ranking.company} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white
                          ${ranking.rank <= 3 ? 'bg-yellow-500' : 
                            ranking.rank <= 6 ? 'bg-green-500' : 'bg-gray-500'}
                        `}>
                          {ranking.rank}
                        </div>
                        {ranking.rank <= 3 && (
                          <Award className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                    </td>
                    
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{ranking.company}</div>
                        <div className="text-sm text-muted-foreground">{ranking.sector}</div>
                      </div>
                    </td>
                    
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <span className={`text-lg font-bold ${getMOICColor(ranking.followOnMOIC)}`}>
                          {formatMOIC(ranking.followOnMOIC)}
                        </span>
                        <Badge variant={getMOICBadgeVariant(ranking.followOnMOIC)} className="text-xs">
                          {ranking.followOnMOIC >= 2.0 ? 'Strong' : 
                           ranking.followOnMOIC >= 1.0 ? 'Moderate' : 'Weak'}
                        </Badge>
                      </div>
                    </td>
                    
                    <td className="p-4 text-right">
                      <div className="font-medium">{formatCurrency(ranking.planned)}</div>
                    </td>
                    
                    <td className="p-4 text-right">
                      <div className="font-medium">{formatCurrency(ranking.deployed)}</div>
                    </td>
                    
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getEfficiencyColor(ranking.efficiency)}`}
                            style={{ width: `${ranking.efficiency}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{ranking.efficiency}%</span>
                      </div>
                    </td>
                    
                    <td className="p-4">
                      <Badge variant="outline">{ranking.stage}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Insights Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-sm text-green-800">Top Performer</div>
                <div className="font-bold text-green-900">{reserveRankings[0]?.company}</div>
                <div className="text-sm text-green-700">{formatMOIC(reserveRankings[0]?.followOnMOIC)} Follow-on MOIC</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div>
                <div className="text-sm text-yellow-800">Review Required</div>
                <div className="font-bold text-yellow-900">
                  {reserveRankings.filter(r => r.followOnMOIC < 1.0).length} Companies
                </div>
                <div className="text-sm text-yellow-700">Below 1.0x Follow-on MOIC</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <DollarSign className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-sm text-blue-800">Avg Follow-on MOIC</div>
                <div className="font-bold text-blue-900">
                  {formatMOIC(reserveRankings.reduce((sum, r) => sum + r.followOnMOIC, 0) / reserveRankings.length)}
                </div>
                <div className="text-sm text-blue-700">Portfolio Average</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
