import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title, height = "h-64" }: { title: string; height?: string }) => (
  <div className={`${height} bg-gray-50 rounded-lg flex flex-col items-center justify-center`}>
    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
      <BarChart3 className="h-8 w-8 text-gray-400" />
    </div>
    <p className="text-gray-500 font-medium">{title}</p>
    <p className="text-gray-400 text-sm mt-1">Chart placeholder - data available via API</p>
  </div>
);
import { 
  TrendingUp,
  Calculator,
  Info,
  AlertTriangle,
  BarChart3,
  Building2,
  Percent
} from "lucide-react";

interface PartialSaleData {
  company: string;
  holdingPeriod: number;
  case: string;
  probability: number;
  minimumSaleValuation: number;
  currentValuation: number;
  impliedPremium: number;
  newProjectedMOIC: number;
  currentlyProjectedMOIC: number;
  dealIRR: number;
  fundIRR: number;
}

export default function PartialSalesPage() {
  const [percentSold, setPercentSold] = useState<number>(25);
  const [minimumHoldingPeriod, setMinimumHoldingPeriod] = useState<number>(12);

  // Sample data for demonstration purposes
  const partialSalesData: PartialSaleData[] = [
    {
      company: "AlphaTech",
      holdingPeriod: 29,
      case: "Upside",
      probability: 30.0,
      minimumSaleValuation: 93999603,
      currentValuation: 133700000,
      impliedPremium: -29.69,
      newProjectedMOIC: 6.17,
      currentlyProjectedMOIC: 8.23,
      dealIRR: 28.5,
      fundIRR: 24.2
    },
    {
      company: "AlphaTech",
      holdingPeriod: 29,
      case: "Base",
      probability: 60.0,
      minimumSaleValuation: 94293045,
      currentValuation: 133700000,
      impliedPremium: -29.47,
      newProjectedMOIC: 3.92,
      currentlyProjectedMOIC: 5.23,
      dealIRR: 22.8,
      fundIRR: 19.5
    },
    {
      company: "AlphaTech",
      holdingPeriod: 29,
      case: "Downside",
      probability: 10.0,
      minimumSaleValuation: 46579399,
      currentValuation: 133700000,
      impliedPremium: -65.16,
      newProjectedMOIC: 0.16,
      currentlyProjectedMOIC: 0.22,
      dealIRR: -8.2,
      fundIRR: -12.5
    },
    {
      company: "Amplio",
      holdingPeriod: 29,
      case: "Upside",
      probability: 25.0,
      minimumSaleValuation: 111514453,
      currentValuation: 48571429,
      impliedPremium: 129.59,
      newProjectedMOIC: 17.65,
      currentlyProjectedMOIC: 23.53,
      dealIRR: 45.2,
      fundIRR: 38.7
    },
    {
      company: "Amplio",
      holdingPeriod: 29,
      case: "Base",
      probability: 50.0,
      minimumSaleValuation: 91994320,
      currentValuation: 48571429,
      impliedPremium: 89.40,
      newProjectedMOIC: 9.35,
      currentlyProjectedMOIC: 11.82,
      dealIRR: 32.1,
      fundIRR: 28.9
    },
    {
      company: "DigitalWave",
      holdingPeriod: 18,
      case: "Base",
      probability: 50.0,
      minimumSaleValuation: 31056431,
      currentValuation: 33300000,
      impliedPremium: -6.74,
      newProjectedMOIC: 5.32,
      currentlyProjectedMOIC: 6.43,
      dealIRR: 26.7,
      fundIRR: 23.4
    },
    {
      company: "DigitalWave",
      holdingPeriod: 18,
      case: "Bull",
      probability: 10.0,
      minimumSaleValuation: 31056431,
      currentValuation: 33300000,
      impliedPremium: -6.74,
      newProjectedMOIC: 5.32,
      currentlyProjectedMOIC: 6.43,
      dealIRR: 26.7,
      fundIRR: 23.4
    },
    {
      company: "TechFlow",
      holdingPeriod: 24,
      case: "Base",
      probability: 60.0,
      minimumSaleValuation: 42750000,
      currentValuation: 45000000,
      impliedPremium: -5.0,
      newProjectedMOIC: 4.2,
      currentlyProjectedMOIC: 5.1,
      dealIRR: 24.8,
      fundIRR: 22.1
    },
    {
      company: "DataCore",
      holdingPeriod: 36,
      case: "Upside",
      probability: 20.0,
      minimumSaleValuation: 85600000,
      currentValuation: 67200000,
      impliedPremium: 27.38,
      newProjectedMOIC: 8.9,
      currentlyProjectedMOIC: 12.4,
      dealIRR: 35.6,
      fundIRR: 31.2
    }
  ];

  const filteredData = partialSalesData.filter(item => item.holdingPeriod >= minimumHoldingPeriod);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number) => {
    if (value > 0) return `+${value.toFixed(2)}%`;
    return `${value.toFixed(2)}%`;
  };

  const getPremiumColor = (premium: number) => {
    if (premium > 0) return 'text-red-600';
    return 'text-green-600';
  };

  const getPremiumBadge = (premium: number) => {
    if (premium > 0) return 'destructive';
    return 'secondary';
  };

  // Summary calculations
  const totalOpportunities = filteredData.length;
  const attractiveOpportunities = filteredData.filter(item => item.impliedPremium <= 0).length;
  const avgFundIRR = filteredData.reduce((sum, item) => sum + item.fundIRR, 0) / filteredData.length;
  const totalMOICLoss = filteredData.reduce((sum, item) =>
    sum + (item.currentlyProjectedMOIC - item.newProjectedMOIC), 0
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Partial Sales Optimization</h1>
          <p className="text-muted-foreground">
            Calculate minimum partial sale valuations for IRR accretive liquidity
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2 bg-red-50 text-red-700 border-red-200">
          Beta Feature
        </Badge>
      </div>

      {/* Methodology Overview */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-blue-900">
            <Info className="h-5 w-5" />
            <span>Realizing DPI Through Optimal Partial Sales</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-900 mb-2">The Challenge</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• What valuation should we sell at?</li>
                <li>• What % of the investment should we sell?</li>
                <li>• How to ensure the sale is accretive to fund IRR?</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-2">The Solution</h4>
              <p className="text-sm text-blue-800">
                Calculate the <strong>Minimum Partial Sale Valuation</strong> - the lowest price 
                the fund could sell for the resulting cash flows to still be accretive to the fund's IRR, 
                accounting for time value of money and opportunity cost.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Parameters</CardTitle>
          <CardDescription>
            If the fund were to partially liquidate its investments today, what is the minimum valuation needed for the sale to be accretive to the fund's IRR?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>What % of each position would the fund consider selling today?</Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={percentSold}
                  onChange={(e) => setPercentSold(Number(e.target.value))}
                  className="w-20"
                  min="1"
                  max="100"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Only show investments the fund has held for at least</Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={minimumHoldingPeriod}
                  onChange={(e) => setMinimumHoldingPeriod(Number(e.target.value))}
                  className="w-20"
                  min="1"
                  max="60"
                />
                <span className="text-sm text-muted-foreground">months</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span className="font-medium">Total Opportunities</span>
          </div>
          <div className="text-2xl font-bold">{totalOpportunities}</div>
          <div className="text-sm text-muted-foreground">
            Investments meeting criteria
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-medium">Attractive Sales</span>
          </div>
          <div className="text-2xl font-bold">{attractiveOpportunities}</div>
          <div className="text-sm text-muted-foreground">
            At or below current valuation
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Percent className="h-4 w-4 text-purple-600" />
            <span className="font-medium">Avg Fund IRR</span>
          </div>
          <div className="text-2xl font-bold">{avgFundIRR.toFixed(1)}%</div>
          <div className="text-sm text-muted-foreground">
            Weighted across cases
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="font-medium">MOIC Impact</span>
          </div>
          <div className="text-2xl font-bold">-{totalMOICLoss.toFixed(1)}x</div>
          <div className="text-sm text-muted-foreground">
            Total MOIC reduction
          </div>
        </Card>
      </div>

      {/* Main Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Minimum Partial Sale Valuation Analysis</CardTitle>
          <CardDescription>
            Showing {percentSold}% partial sale scenarios for investments held ≥{minimumHoldingPeriod} months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-center p-3 font-medium">Holding Period</th>
                  <th className="text-center p-3 font-medium">Case</th>
                  <th className="text-center p-3 font-medium">Probability</th>
                  <th className="text-center p-3 font-medium bg-blue-50">Minimum Sale Valuation for IRR Accretion</th>
                  <th className="text-center p-3 font-medium">Current Valuation</th>
                  <th className="text-center p-3 font-medium">Implied Premium to Current Valuation</th>
                  <th className="text-center p-3 font-medium">New Projected MOIC</th>
                  <th className="text-center p-3 font-medium">Currently Projected MOIC</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium">{item.company}</div>
                    </td>
                    <td className="text-center p-3">
                      <span className="text-sm">{item.holdingPeriod} months</span>
                    </td>
                    <td className="text-center p-3">
                      <Badge variant="outline">{item.case}</Badge>
                    </td>
                    <td className="text-center p-3">
                      <span className="text-sm">{item.probability.toFixed(1)}%</span>
                    </td>
                    <td className="text-center p-3 bg-blue-50">
                      <span className="font-bold text-blue-700">
                        {formatCurrency(item.minimumSaleValuation)}
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <span className="font-medium">
                        {formatCurrency(item.currentValuation)}
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <div className="flex items-center justify-center">
                        <Badge variant={getPremiumBadge(item.impliedPremium)}>
                          <span className={getPremiumColor(item.impliedPremium)}>
                            ({formatPercent(item.impliedPremium)})
                          </span>
                        </Badge>
                      </div>
                    </td>
                    <td className="text-center p-3">
                      <span className="font-bold">{item.newProjectedMOIC.toFixed(2)}x</span>
                    </td>
                    <td className="text-center p-3">
                      <span className="font-bold">{item.currentlyProjectedMOIC.toFixed(2)}x</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Insights and Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Premium Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Premium Analysis</CardTitle>
            <CardDescription>Distribution of required premiums for IRR accretive sales</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartPlaceholder title="Premium Analysis Bar Chart" />
          </CardContent>
        </Card>

        {/* MOIC Impact */}
        <Card>
          <CardHeader>
            <CardTitle>MOIC Impact Analysis</CardTitle>
            <CardDescription>How partial sales affect projected returns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredData.slice(0, 5).map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{item.company}</div>
                    <div className="text-sm text-muted-foreground">{item.case} Case</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      {item.currentlyProjectedMOIC.toFixed(2)}x → {item.newProjectedMOIC.toFixed(2)}x
                    </div>
                    <div className="text-sm text-red-600">
                      -{(item.currentlyProjectedMOIC - item.newProjectedMOIC).toFixed(2)}x loss
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-yellow-800">
            <Calculator className="h-5 w-5" />
            <span>Deal IRR vs Fund IRR Consideration</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-yellow-800 mb-3">
            <strong>Important:</strong> This analysis focuses on Fund IRR rather than Deal IRR to ensure 
            partial sales are truly accretive. A sale might be accretive at the deal level but still 
            dilutive at the fund level due to time value of money considerations.
          </p>
          <p className="text-sm text-yellow-800">
            If the fund made an investment later in its horizon, there could be deviation between 
            Deal IRR and Fund IRR as fund-level cash flows are discounted relative to deal-level flows.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

