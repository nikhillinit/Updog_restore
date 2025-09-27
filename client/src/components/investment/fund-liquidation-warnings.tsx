/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Calendar, TrendingDown, Info } from "lucide-react";

interface InvestmentRound {
  id: string;
  company: string;
  round: string;
  date: string;
  exitValue: number;
  moic: number;
  irr: number;
  afterFundDate: boolean;
}

interface FundLiquidationWarningsProps {
  fundEndDate?: string;
  investments: InvestmentRound[];
}

export default function FundLiquidationWarnings({ 
  fundEndDate, 
  investments 
}: FundLiquidationWarningsProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Sample data for demonstration
  const sampleInvestments: InvestmentRound[] = [
    {
      id: "1",
      company: "TechCorp",
      round: "Exit",
      date: "Apr 2031",
      exitValue: 3000000,
      moic: 3.79,
      irr: 16.45,
      afterFundDate: true
    },
    {
      id: "2", 
      company: "DataFlow Inc",
      round: "Series C",
      date: "Jun 2032",
      exitValue: 5500000,
      moic: 4.12,
      irr: 18.23,
      afterFundDate: true
    },
    {
      id: "3",
      company: "AI Solutions",
      round: "Exit",
      date: "Dec 2030",
      exitValue: 2800000,
      moic: 2.95,
      irr: 14.67,
      afterFundDate: false
    }
  ];

  const investmentData = investments.length > 0 ? investments : sampleInvestments;
  const afterFundDateInvestments = investmentData.filter(inv => inv.afterFundDate);
  const liquidatedInvestments = investmentData.filter(inv => !inv.afterFundDate);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Fund Term Warning */}
      {fundEndDate && afterFundDateInvestments.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <div className="font-semibold mb-2">Fund Term Impact Warning</div>
            <p className="text-sm mb-2">
              Your fund has a fixed term ending in <strong>{fundEndDate}</strong>. 
              {afterFundDateInvestments.length} investment(s) have expected exits after this date and will be liquidated early.
            </p>
            <p className="text-sm">
              This may reduce returns as investments won't reach their full exit potential. 
              Consider extending the fund term or removing the end date to allow investments to mature.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Fund Liquidation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Fund Liquidation Impact
          </CardTitle>
          <p className="text-sm text-gray-600">
            Overview of investments affected by fund term limitations
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {afterFundDateInvestments.length}
              </div>
              <div className="text-sm text-red-700 mt-1">Early Liquidations</div>
              <div className="text-xs text-gray-600 mt-2">
                Exits after fund date
              </div>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {liquidatedInvestments.length}
              </div>
              <div className="text-sm text-green-700 mt-1">Natural Exits</div>
              <div className="text-xs text-gray-600 mt-2">
                Exits within fund term
              </div>
            </div>
            
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {afterFundDateInvestments.reduce((sum: any, inv: any) => sum + inv.exitValue, 0) > 0 
                  ? formatCurrency(afterFundDateInvestments.reduce((sum: any, inv: any) => sum + inv.exitValue, 0))
                  : "$0"}
              </div>
              <div className="text-sm text-orange-700 mt-1">Affected Value</div>
              <div className="text-xs text-gray-600 mt-2">
                Value at early liquidation
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Investment List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Investment Details</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </Button>
          </div>
        </CardHeader>
        {showDetails && (
          <CardContent>
            <div className="space-y-4">
              {/* After Fund Date Investments */}
              {afterFundDateInvestments.length > 0 && (
                <div>
                  <h4 className="font-semibold text-red-700 mb-3 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Early Liquidations (After Fund Date)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-red-50">
                          <th className="text-left py-2 px-3">Company</th>
                          <th className="text-left py-2 px-3">Round</th>
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-right py-2 px-3">Exit Value</th>
                          <th className="text-right py-2 px-3">MOIC</th>
                          <th className="text-right py-2 px-3">IRR</th>
                          <th className="text-left py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {afterFundDateInvestments.map((investment: any) => (
                          <tr key={investment.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium">{investment.company}</td>
                            <td className="py-2 px-3">{investment.round}</td>
                            <td className="py-2 px-3 text-red-600">{investment.date}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(investment.exitValue)}</td>
                            <td className="py-2 px-3 text-right">{investment.moic.toFixed(2)}x</td>
                            <td className="py-2 px-3 text-right">{investment.irr.toFixed(1)}%</td>
                            <td className="py-2 px-3">
                              <Badge variant="destructive" className="text-xs">
                                After Fund Date
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Natural Exits */}
              {liquidatedInvestments.length > 0 && (
                <div>
                  <h4 className="font-semibold text-green-700 mb-3 flex items-center">
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Natural Exits (Within Fund Term)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-green-50">
                          <th className="text-left py-2 px-3">Company</th>
                          <th className="text-left py-2 px-3">Round</th>
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-right py-2 px-3">Exit Value</th>
                          <th className="text-right py-2 px-3">MOIC</th>
                          <th className="text-right py-2 px-3">IRR</th>
                          <th className="text-left py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liquidatedInvestments.map((investment: any) => (
                          <tr key={investment.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium">{investment.company}</td>
                            <td className="py-2 px-3">{investment.round}</td>
                            <td className="py-2 px-3">{investment.date}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(investment.exitValue)}</td>
                            <td className="py-2 px-3 text-right">{investment.moic.toFixed(2)}x</td>
                            <td className="py-2 px-3 text-right">{investment.irr.toFixed(1)}%</td>
                            <td className="py-2 px-3">
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                                On Schedule
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Info className="w-5 h-5 mr-2 text-blue-600" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-blue-50 rounded-lg">
              <strong>Extend Fund Term:</strong> Consider extending the fund term to allow investments to reach their full exit potential instead of early liquidation.
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <strong>Remove End Date:</strong> Remove the fund end date from Construction Wizard to let investments run to their expected exits.
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <strong>Optimize Exit Strategy:</strong> Focus on accelerating exits for investments that will be liquidated early to maximize returns.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
