import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  ArrowLeft,
  Edit, 
  Plus, 
  MoreHorizontal,
  TrendingUp,
  Target,
  Calendar,
  Building2,
  Globe,
  Users,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Round {
  id: string;
  name: string;
  date: string;
  type: 'Actual' | 'Projected';
  investment: number;
  reserved: number;
  roundSize: number;
  preMoney: number;
  postMoney: number;
  moic: number;
  irr?: number;
  fmv: number;
  ownership: number;
  returnTheFund: number;
}

interface OptimalReserveAnalysis {
  roundPercent: number;
  investmentAmount: number;
  resultingOwnership: number;
  returnTheFund: number;
  exitOwnership: number;
  exitFMV: number;
  exitMOIC: number;
  totalReserves: number;
  dealReserveRatio: number;
  marginalReturn: number;
  capitalEfficiency: number;
  fundReturnThreshold: number;
}

interface SectorProfile {
  name: string;
  graduationRates: {
    seedToA: number;
    aToB: number;
    bToC: number;
    cToD: number;
  };
  roundSizes: {
    seed: number;
    seriesA: number;
    seriesB: number;
    seriesC: number;
    seriesD: number;
  };
  valuationStepUps: {
    seedToA: number;
    aToB: number;
    bToC: number;
    cToD: number;
  };
}

interface ProRataSettings {
  resolveProRata: boolean;
  customReserve?: number;
  targetOwnership?: number;
}

interface ReserveRanking {
  companyName: string;
  dealLevelTVPI: number;
  riskAdjustedProceeds: number;
  ownershipImprovement: number;
  marginalReturnPer1K: number;
  reserveRatio: number;
  fundLevelTarget: number;
  isOverAllocated: boolean;
  isUnderAllocated: boolean;
}

const SAMPLE_ROUNDS: Round[] = [
  {
    id: '1',
    name: 'Capital Calls',
    date: 'Oct 2024',
    type: 'Actual',
    investment: 1000000,
    reserved: 0,
    roundSize: 25000000,
    preMoney: 75000000,
    postMoney: 100000000,
    moic: 1.00,
    fmv: 1000000,
    ownership: 1.00,
    returnTheFund: 20000000
  },
  {
    id: '2',
    name: 'Capital Calls',
    date: 'Oct 2025',
    type: 'Projected',
    investment: 1000000,
    reserved: 1000000,
    roundSize: 25000000,
    preMoney: 100000000,
    postMoney: 125000000,
    moic: 1.00,
    fmv: 2000000,
    ownership: 1.60,
    returnTheFund: 12500000
  },
  {
    id: '3',
    name: 'Capital Calls',
    date: 'Oct 2026',
    type: 'Projected',
    investment: 1000000,
    reserved: 1000000,
    roundSize: 25000000,
    preMoney: 125000000,
    postMoney: 150000000,
    moic: 1.00,
    fmv: 3000000,
    ownership: 2.00,
    returnTheFund: 10000000
  },
  {
    id: '4',
    name: 'Capital Calls',
    date: 'Oct 2027',
    type: 'Projected',
    investment: 1000000,
    reserved: 1000000,
    roundSize: 25000000,
    preMoney: 150000000,
    postMoney: 175000000,
    moic: 1.00,
    fmv: 4000000,
    ownership: 2.29,
    returnTheFund: 8750000
  },
  {
    id: '5',
    name: 'Capital Calls',
    date: 'Oct 2028',
    type: 'Projected',
    investment: 1000000,
    reserved: 1000000,
    roundSize: 25000000,
    preMoney: 175000000,
    postMoney: 200000000,
    moic: 1.00,
    fmv: 5000000,
    ownership: 2.50,
    returnTheFund: 8000000
  }
];

// B2B SaaS Sector Profile (Carmasal Fund)
const SECTOR_PROFILE: SectorProfile = {
  name: 'B2B SaaS',
  graduationRates: {
    seedToA: 0.65,
    aToB: 0.75,
    bToC: 0.70,
    cToD: 0.60
  },
  roundSizes: {
    seed: 3000000,
    seriesA: 10000000,
    seriesB: 25000000,
    seriesC: 50000000,
    seriesD: 100000000
  },
  valuationStepUps: {
    seedToA: 3.5,
    aToB: 2.8,
    bToC: 2.5,
    cToD: 2.2
  }
};

// Auto-generated financing path with graduation rates
const generateFinancingPath = (initialValuation: number, currentRound: string) => {
  const path = [];
  let currentVal = initialValuation;
  
  if (currentRound === 'Capital Calls') {
    // Series A projection (65% graduation rate)
    currentVal *= SECTOR_PROFILE.valuationStepUps.seedToA;
    path.push({
      round: 'Series A',
      graduationRate: SECTOR_PROFILE.graduationRates.seedToA,
      preMoney: currentVal,
      roundSize: SECTOR_PROFILE.roundSizes.seriesA,
      postMoney: currentVal + SECTOR_PROFILE.roundSizes.seriesA
    });
    
    // Series B projection (75% graduation rate from A)
    currentVal = (currentVal + SECTOR_PROFILE.roundSizes.seriesA) * SECTOR_PROFILE.valuationStepUps.aToB;
    path.push({
      round: 'Series B',
      graduationRate: SECTOR_PROFILE.graduationRates.aToB,
      preMoney: currentVal,
      roundSize: SECTOR_PROFILE.roundSizes.seriesB,
      postMoney: currentVal + SECTOR_PROFILE.roundSizes.seriesB
    });
    
    // Series C projection (70% graduation rate from B)
    currentVal = (currentVal + SECTOR_PROFILE.roundSizes.seriesB) * SECTOR_PROFILE.valuationStepUps.bToC;
    path.push({
      round: 'Series C',
      graduationRate: SECTOR_PROFILE.graduationRates.bToC,
      preMoney: currentVal,
      roundSize: SECTOR_PROFILE.roundSizes.seriesC,
      postMoney: currentVal + SECTOR_PROFILE.roundSizes.seriesC
    });
  }
  
  return path;
};

// Calculate optimal reserves with efficiency curve analysis
const calculateOptimalReserves = (
  currentOwnership: number,
  currentInvestment: number,
  roundSize: number,
  preMoney: number,
  exitMultiple: number = 3.0
): OptimalReserveAnalysis[] => {
  const analysis = [];
  const fundSize = 100000000; // $100M fund
  
  for (let percent = 0; percent <= 25; percent += 2.5) {
    const investment = (percent / 100) * roundSize;
    const postMoney = preMoney + roundSize;
    const newShares = investment / (postMoney / (roundSize / investment));
    const resultingOwnership = currentOwnership + (investment / postMoney) * 100;
    
    // Exit calculations
    const exitValuation = postMoney * exitMultiple;
    const exitProceeds = (resultingOwnership / 100) * exitValuation;
    const totalInvested = currentInvestment + investment;
    const exitMOIC = exitProceeds / totalInvested;
    
    // Fund return threshold calculation
    const fundReturnThreshold = fundSize / (resultingOwnership / 100);
    
    // Capital efficiency calculation (diminishing returns)
    const marginalReturn = investment > 0 ? (exitProceeds - (currentOwnership / 100) * exitValuation) / investment : 0;
    const capitalEfficiency = investment > 0 ? marginalReturn / (investment / 1000000) : 0;
    
    // Deal-level reserve ratio
    const dealReserveRatio = investment > 0 ? (investment / (currentInvestment + investment)) * 100 : 0;
    
    analysis.push({
      roundPercent: percent,
      investmentAmount: investment,
      resultingOwnership,
      returnTheFund: fundReturnThreshold / 1000000, // in millions
      exitOwnership: resultingOwnership,
      exitFMV: exitProceeds / 1000000, // in millions
      exitMOIC,
      totalReserves: investment,
      dealReserveRatio,
      marginalReturn,
      capitalEfficiency,
      fundReturnThreshold: fundReturnThreshold / 1000000
    });
  }
  
  return analysis;
};

// Performance-weighted reserve ranking for portfolio
const RESERVE_RANKING_DATA: ReserveRanking[] = [
  {
    companyName: 'Carmasal Fund',
    dealLevelTVPI: 3.25,
    riskAdjustedProceeds: 15.2,
    ownershipImprovement: 1.8,
    marginalReturnPer1K: 2.4,
    reserveRatio: 37.5,
    fundLevelTarget: 40.0,
    isOverAllocated: false,
    isUnderAllocated: true
  },
  {
    companyName: 'AlphaTech',
    dealLevelTVPI: 2.85,
    riskAdjustedProceeds: 12.8,
    ownershipImprovement: 1.2,
    marginalReturnPer1K: 1.9,
    reserveRatio: 45.2,
    fundLevelTarget: 40.0,
    isOverAllocated: true,
    isUnderAllocated: false
  },
  {
    companyName: 'Cybros',
    dealLevelTVPI: 4.15,
    riskAdjustedProceeds: 18.6,
    ownershipImprovement: 2.3,
    marginalReturnPer1K: 3.1,
    reserveRatio: 35.8,
    fundLevelTarget: 40.0,
    isOverAllocated: false,
    isUnderAllocated: true
  }
];

// Generate optimal reserves based on Series C financing path
const OPTIMAL_RESERVE_DATA = calculateOptimalReserves(
  2.5, // current ownership %
  5000000, // current total investment
  50000000, // Series C round size
  350000000, // Series C pre-money valuation
  3.0 // exit multiple
);

const VALUATION_DATA = [
  { date: 'Oct 2024', value: 100 },
  { date: 'Oct 2025', value: 125 },
  { date: 'Oct 2026', value: 150 },
  { date: 'Oct 2027', value: 175 },
  { date: 'Oct 2028', value: 200 },
  { date: 'Exit', value: 300 }
];

const RETURN_THE_FUND_DATA = [
  { date: 'Oct 2024', value: 20000 },
  { date: 'Oct 2025', value: 12500 },
  { date: 'Oct 2026', value: 10000 },
  { date: 'Oct 2027', value: 8750 },
  { date: 'Oct 2028', value: 8000 }
];

export default function PortfolioCompanyDetail() {
  const [activeTab, setActiveTab] = useState('performance-cases');

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number, decimals = 2) => {
    return `${value.toFixed(decimals)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Investments
        </Button>
        <div className="text-sm text-gray-500">
          Tactyc Ventures II L.P. / Investments / Carmasal Fund
        </div>
      </div>

      {/* Company Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Carmasal Fund</h1>
            <p className="text-gray-600">carmasalfund.io</p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm text-gray-600">Status</div>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 mt-1">Active</Badge>
          </div>
          <div>
            <div className="text-sm text-gray-600">Stage</div>
            <div className="font-medium">Capital Calls</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Valuation</div>
            <div className="font-medium">$100,000,000</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Invested</div>
            <div className="font-medium">$1,000,000</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Planned Reserves</div>
            <div className="font-medium">$4,000,000</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">MOIC</div>
            <div className="font-medium">1.00x</div>
          </div>
        </div>

        {/* Return the Fund Chart */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-4">Return the Fund</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={RETURN_THE_FUND_DATA}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${value}mm`, 'Return the Fund']} />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="investment-info">Investment Information</TabsTrigger>
          <TabsTrigger value="performance-cases">Performance Cases</TabsTrigger>
          <TabsTrigger value="optimal-reserves">Optimal Reserves</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Investment Information Tab */}
        <TabsContent value="investment-info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Investment Information
              </CardTitle>
              <p className="text-sm text-gray-600">
                Basic information related to this investment. See adding an investment to learn more.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Company Name</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">Carmasal Fund</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Web</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-blue-600">carmasalfund.io</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Sector</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">B2B SaaS</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Key Management</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">Sarah Smith</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Geography</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">US</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Deal Tags</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">FoF</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Deal Partners</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">John Wick</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Board Members</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">-</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Co-Investors</label>
                  <div className="mt-1 p-2 bg-gray-50 rounded text-gray-900">
                    Northgate Capital, Centana Growth, First Close Partners
                  </div>
                </div>
              </div>

              {/* Custom Fields Section */}
              <div className="mt-8">
                <h4 className="font-medium text-gray-900 mb-4">Custom Fields</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    'Internal Status', 'Lead Status', 'Strategic', 'Deal Source',
                    'Google Drive Link', 'Formation Date', 'Source of Deal', 'BiV Director',
                    'OIC', 'Years of Operation', 'Fund raising notes', 'Valuation Notes', 'DD notes'
                  ].map((field) => (
                    <div key={field}>
                      <label className="text-sm font-medium text-gray-700">{field}</label>
                      <div className="mt-1 p-2 bg-gray-50 rounded text-gray-500">-</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Cases Tab */}
        <TabsContent value="performance-cases" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Cases
              </CardTitle>
              <p className="text-sm text-gray-600">
                These are the rounds and exit this investment is expected to have. See working with performance cases, 
                managing rounds and reserves and best practices guidelines to learn more.
              </p>
            </CardHeader>
            <CardContent>
              {/* Case Tabs */}
              <div className="flex items-center gap-1 mb-6">
                <Button variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                  Default
                  <span className="ml-2 text-xs">100%</span>
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-600">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Case
                </Button>
                <div className="ml-auto">
                  <Button variant="outline" size="sm">
                    All Events
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Rounds Timeline */}
              <div className="space-y-4">
                {SAMPLE_ROUNDS.map((round, index) => (
                  <div key={round.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium text-gray-900">{round.name}</h4>
                        <span className="text-sm text-gray-500">{round.date}</span>
                        {round.type === 'Projected' && (
                          <Badge variant="outline" className="text-xs">Projected</Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Investment: </span>
                          <span className="font-medium text-blue-600">{formatCurrency(round.investment)}</span>
                          {round.reserved > 0 && (
                            <>
                              <span className="text-gray-600"> Reserved: </span>
                              <span className="font-medium text-green-600">{formatCurrency(round.reserved)}</span>
                            </>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-600">Round: </span>
                          <span className="font-medium">{formatCurrency(round.roundSize)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Pre-Money: </span>
                          <span className="font-medium">{formatCurrency(round.preMoney)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Post-Money: </span>
                          <span className="font-medium">{formatCurrency(round.postMoney)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
                        <div>
                          <span className="text-gray-600">MOIC: </span>
                          <span className="font-medium">{round.moic.toFixed(2)}x</span>
                        </div>
                        <div>
                          <span className="text-gray-600">IRR: </span>
                          <span className="font-medium">{round.irr ? `${round.irr.toFixed(2)}%` : '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">FMV: </span>
                          <span className="font-medium">{formatCurrency(round.fmv)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Ownership: </span>
                          <span className="font-medium">{formatPercent(round.ownership)}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="text-gray-600">Return the Fund: </span>
                        <span className="font-medium">{formatCurrency(round.returnTheFund * 1000)}</span>
                      </div>

                      {round.type === 'Projected' && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="outline">
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline">
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Exit Event */}
                <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg bg-green-50">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    E
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-gray-900">Exit</h4>
                      <span className="text-sm text-gray-500">Jan 2030</span>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-gray-600">MOIC: </span>
                        <span className="font-medium text-green-600">3.00x</span>
                        <span className="text-gray-600 ml-4">IRR: </span>
                        <span className="font-medium text-green-600">14.46%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Exit Proceeds: </span>
                        <span className="font-medium text-green-600">$15,000,000</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Ownership: </span>
                        <span className="font-medium">2.50%</span>
                        <span className="text-gray-600 ml-4">Return the Fund: </span>
                        <span className="font-medium">$8,000mm</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Aggregate Valuation</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={VALUATION_DATA}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`$${value}M`, 'Valuation']} />
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Return the Fund</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={RETURN_THE_FUND_DATA}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`$${value}mm`, 'Return the Fund']} />
                        <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* Optimal Reserves Tab */}
        <TabsContent value="optimal-reserves" className="space-y-6">
          {/* Step 1: Auto-Generated Financing Path */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Step 1: Auto-Generated Financing Path
              </CardTitle>
              <p className="text-sm text-gray-600">
                Based on {SECTOR_PROFILE.name} sector profile with graduation rates and valuation step-ups
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Graduation Rates</h4>
                  <div className="text-sm space-y-1">
                    <div>Seed → Series A: <span className="font-medium">{formatPercent(SECTOR_PROFILE.graduationRates.seedToA * 100)}</span></div>
                    <div>A → Series B: <span className="font-medium">{formatPercent(SECTOR_PROFILE.graduationRates.aToB * 100)}</span></div>
                    <div>B → Series C: <span className="font-medium">{formatPercent(SECTOR_PROFILE.graduationRates.bToC * 100)}</span></div>
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Round Sizes</h4>
                  <div className="text-sm space-y-1">
                    <div>Series A: <span className="font-medium">{formatCurrency(SECTOR_PROFILE.roundSizes.seriesA)}</span></div>
                    <div>Series B: <span className="font-medium">{formatCurrency(SECTOR_PROFILE.roundSizes.seriesB)}</span></div>
                    <div>Series C: <span className="font-medium">{formatCurrency(SECTOR_PROFILE.roundSizes.seriesC)}</span></div>
                  </div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-purple-900 mb-2">Valuation Step-Ups</h4>
                  <div className="text-sm space-y-1">
                    <div>Seed → A: <span className="font-medium">{SECTOR_PROFILE.valuationStepUps.seedToA}x</span></div>
                    <div>A → B: <span className="font-medium">{SECTOR_PROFILE.valuationStepUps.aToB}x</span></div>
                    <div>B → C: <span className="font-medium">{SECTOR_PROFILE.valuationStepUps.bToC}x</span></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Pro Rata Resolution Logic */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Step 2: Pro Rata Resolution Logic
              </CardTitle>
              <p className="text-sm text-gray-600">
                Toggle between "Resolve Pro Rata" (constant ownership) or "Custom Reserve" (manual amount)
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <h4 className="font-medium">Resolve Pro Rata (Recommended)</h4>
                  </div>
                  <div className="text-sm text-gray-600 space-y-2">
                    <div>• Maintains current ownership percentage: <span className="font-medium text-blue-600">2.50%</span></div>
                    <div>• Auto-calculates required capital for each round</div>
                    <div>• Optimizes for ownership preservation</div>
                    <div>• Series C Investment Required: <span className="font-medium text-green-600">$12.5M</span></div>
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                    <h4 className="font-medium text-gray-700">Custom Reserve</h4>
                  </div>
                  <div className="text-sm text-gray-600 space-y-2">
                    <div>• Manual dollar amount input</div>
                    <div>• Resulting ownership varies by round size</div>
                    <div>• Allows strategic over/under-participation</div>
                    <div>• Custom Amount: <input className="w-20 px-2 py-1 border rounded text-xs" placeholder="$5M" /></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Optimal Reserve Analysis with Efficiency Curve */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Step 3: Optimal Reserve Analysis - Series C Round
              </CardTitle>
              <p className="text-sm text-gray-600">
                Efficiency curve showing impact of increasing reserve levels with diminishing marginal returns
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Round %</TableHead>
                      <TableHead>Investment</TableHead>
                      <TableHead>Resulting Ownership</TableHead>
                      <TableHead>Fund Return Threshold</TableHead>
                      <TableHead>Exit MOIC</TableHead>
                      <TableHead>Marginal Return</TableHead>
                      <TableHead>Capital Efficiency</TableHead>
                      <TableHead>Deal Reserve Ratio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {OPTIMAL_RESERVE_DATA.map((row, index) => {
                      const isOptimal = row.capitalEfficiency > 0 && 
                                       row.capitalEfficiency === Math.max(...OPTIMAL_RESERVE_DATA.map(r => r.capitalEfficiency));
                      
                      return (
                        <TableRow key={index} className={cn(
                          "hover:bg-gray-50",
                          isOptimal && "bg-yellow-50 border-l-4 border-yellow-400"
                        )}>
                          <TableCell className="font-medium">{formatPercent(row.roundPercent)}</TableCell>
                          <TableCell>{formatCurrency(row.investmentAmount)}</TableCell>
                          <TableCell>{formatPercent(row.resultingOwnership)}</TableCell>
                          <TableCell>{formatCurrency(row.fundReturnThreshold * 1000000)}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              row.exitMOIC >= 2 ? "text-green-600" : 
                              row.exitMOIC >= 1.5 ? "text-blue-600" : "text-orange-600"
                            )}>
                              {row.exitMOIC.toFixed(2)}x
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              row.marginalReturn >= 2 ? "text-green-600" : 
                              row.marginalReturn >= 1 ? "text-blue-600" : "text-red-600"
                            )}>
                              {row.marginalReturn.toFixed(2)}x
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              row.capitalEfficiency >= 2 ? "text-green-600" : 
                              row.capitalEfficiency >= 1 ? "text-blue-600" : "text-red-600"
                            )}>
                              {row.capitalEfficiency.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>{formatPercent(row.dealReserveRatio)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">Efficiency Curve Insights</h4>
                <div className="text-sm text-yellow-800 space-y-1">
                  <div>• <strong>Optimal point:</strong> Highlighted row shows maximum capital efficiency</div>
                  <div>• <strong>Diminishing returns:</strong> Notice how marginal return decreases with higher investment</div>
                  <div>• <strong>Over-reserving risk:</strong> Beyond optimal point, returns per dollar decline</div>
                  <div>• <strong>Fund threshold:</strong> Higher ownership = lower exit valuation needed to return fund</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Deal vs Fund Reserve Posture */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Step 4: Deal vs Fund Reserve Posture Comparison
              </CardTitle>
              <p className="text-sm text-gray-600">
                Comparing deal-level reserve allocation against fund-level targets with rebalancing insights
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">37.5%</div>
                  <div className="text-sm text-blue-800">Current Deal Reserve Ratio</div>
                  <div className="text-xs text-blue-600 mt-1">Reserve ÷ (Initial + Reserve)</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">40.0%</div>
                  <div className="text-sm text-green-800">Fund-Level Target</div>
                  <div className="text-xs text-green-600 mt-1">Portfolio Average Goal</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">-2.5%</div>
                  <div className="text-sm text-orange-800">Variance</div>
                  <div className="text-xs text-orange-600 mt-1">Under-allocated vs Target</div>
                </div>
              </div>

              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h4 className="font-medium text-orange-900 mb-2">Rebalancing Alert</h4>
                <div className="text-sm text-orange-800 space-y-1">
                  <div>• <strong>Under-allocated:</strong> This deal has 2.5% less reserves than fund target</div>
                  <div>• <strong>Opportunity cost:</strong> Capital may be better deployed here vs over-allocated deals</div>
                  <div>• <strong>Recommendation:</strong> Consider increasing reserves to reach 40% target ratio</div>
                  <div>• <strong>Required additional capital:</strong> $625K to reach fund-level target</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 5: Performance-Weighted Reserve Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Step 5: Performance-Weighted Reserve Ranking
              </CardTitle>
              <p className="text-sm text-gray-600">
                Portfolio-wide ranking by "Follow-on Multiple" - projected return on next reserve dollar
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Rank</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Deal-Level TVPI</TableHead>
                      <TableHead>Follow-on Multiple</TableHead>
                      <TableHead>Risk-Adj Proceeds ($M)</TableHead>
                      <TableHead>Reserve Ratio</TableHead>
                      <TableHead>vs Fund Target</TableHead>
                      <TableHead>Allocation Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RESERVE_RANKING_DATA
                      .sort((a, b) => b.marginalReturnPer1K - a.marginalReturnPer1K)
                      .map((company, index) => (
                        <TableRow key={company.companyName} className={cn(
                          "hover:bg-gray-50",
                          company.companyName === 'Carmasal Fund' && "bg-blue-50 border-l-4 border-blue-400"
                        )}>
                          <TableCell className="font-medium">#{index + 1}</TableCell>
                          <TableCell className="font-medium text-blue-600">{company.companyName}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              company.dealLevelTVPI >= 3 ? "text-green-600" : "text-blue-600"
                            )}>
                              {company.dealLevelTVPI.toFixed(2)}x
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "font-medium",
                              company.marginalReturnPer1K >= 3 ? "text-green-600" : 
                              company.marginalReturnPer1K >= 2 ? "text-blue-600" : "text-orange-600"
                            )}>
                              {company.marginalReturnPer1K.toFixed(1)}x
                            </span>
                          </TableCell>
                          <TableCell>{company.riskAdjustedProceeds.toFixed(1)}</TableCell>
                          <TableCell>{formatPercent(company.reserveRatio)}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "text-sm",
                              Math.abs(company.reserveRatio - company.fundLevelTarget) <= 2 ? "text-green-600" :
                              company.reserveRatio < company.fundLevelTarget ? "text-orange-600" : "text-red-600"
                            )}>
                              {company.reserveRatio > company.fundLevelTarget ? '+' : ''}
                              {(company.reserveRatio - company.fundLevelTarget).toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {company.isOverAllocated && (
                              <Badge className="bg-red-100 text-red-800 border-red-200">Over-allocated</Badge>
                            )}
                            {company.isUnderAllocated && (
                              <Badge className="bg-orange-100 text-orange-800 border-orange-200">Under-allocated</Badge>
                            )}
                            {!company.isOverAllocated && !company.isUnderAllocated && (
                              <Badge className="bg-green-100 text-green-800 border-green-200">Optimal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Strategic Capital Deployment Insights</h4>
                <div className="text-sm text-green-800 space-y-1">
                  <div>• <strong>Top Priority:</strong> Cybros (#1) offers highest follow-on multiple at 3.1x</div>
                  <div>• <strong>Current Deal:</strong> Carmasal Fund (#2) ranks second with 2.4x follow-on multiple</div>
                  <div>• <strong>Capital Trap Warning:</strong> AlphaTech (#3) is over-allocated with lowest returns</div>
                  <div>• <strong>Rebalancing Opportunity:</strong> Consider reducing AlphaTech reserves and increasing Cybros allocation</div>
                  <div>• <strong>Next Dollar Decision:</strong> Based on ranking, next $1M should go to Cybros for maximum portfolio impact</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Investment Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-gray-500">Advanced analytics and insights will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}