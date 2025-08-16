/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFundContext } from "@/contexts/FundContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import OptimalReservesRanking from "@/components/reserves/optimal-reserves-ranking";
import GraduationRateStrategy from "@/components/planning/graduation-rate-strategy";
import ExitAnalysis from "@/components/planning/exit-analysis";
import PortfolioConstruction from "@/components/planning/portfolio-construction";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Filter, 
  Edit3, 
  Copy, 
  RotateCcw,
  Plus,
  Info,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import FundLiquidationWarnings from "@/components/investment/fund-liquidation-warnings";
import ExitProceedsRecycling from "@/components/recycling/exit-proceeds-recycling";

interface InvestmentCase {
  id: string;
  name: string;
  probability: number;
  isDefault?: boolean;
}

interface InvestmentRound {
  id: string;
  company: string;
  round: string;
  date: string;
  investment: number;
  roundSize: number;
  preMoney: number;
  postMoney: number;
  moic: number;
  irr: number;
  fmv: number;
  ownership: number;
  returnFund: number;
  graduationRate?: number;
  reserveAmount?: number;
  isProjected?: boolean;
  fmvOverride?: boolean;
}

export default function Planning() {
  const { currentFund } = useFundContext();
  const queryClient = useQueryClient();
  const [selectedCase, setSelectedCase] = useState("default");
  const [showFMVDialog, setShowFMVDialog] = useState(false);
  const [selectedRound, setSelectedRound] = useState<InvestmentRound | null>(null);
  const [filterRounds, setFilterRounds] = useState("next-4");
  const [showCaseDialog, setShowCaseDialog] = useState(false);

  // Mock data for demonstration
  const investmentCases: InvestmentCase[] = [
    { id: "default", name: "Default", probability: 100, isDefault: true },
    { id: "downside", name: "Downside", probability: 20 },
    { id: "base", name: "Base", probability: 60 },
    { id: "upside", name: "Upside", probability: 20 }
  ];

  const futureRounds: InvestmentRound[] = [
    {
      id: "1",
      company: "TechCorp Inc",
      round: "Series A",
      date: "2024-06-01",
      investment: 1000000,
      roundSize: 5000000,
      preMoney: 8000000,
      postMoney: 13000000,
      moic: 2.0,
      irr: 0,
      fmv: 200000,
      ownership: 1.11,
      returnFund: 9000000,
      graduationRate: 50,
      reserveAmount: 1500000,
      isProjected: true
    },
    {
      id: "2", 
      company: "FinanceAI",
      round: "Series B",
      date: "2024-08-15",
      investment: 2000000,
      roundSize: 15000000,
      preMoney: 25000000,
      postMoney: 40000000,
      moic: 1.5,
      irr: 0,
      fmv: 300000,
      ownership: 2.5,
      returnFund: 12000000,
      graduationRate: 70,
      reserveAmount: 2000000,
      isProjected: true
    }
  ];

  const handleFMVOverride = (round: InvestmentRound, newFMV: number) => {
    console.log(`Setting FMV override for ${round.company} to $${newFMV}`);
    setShowFMVDialog(false);
  };

  const handleSyncCases = () => {
    console.log("Syncing cases from base case");
    // Implementation would sync rounds across cases
  };

  const handleCloneCase = (fromCase: string) => {
    console.log(`Cloning case from ${fromCase}`);
    // Implementation would create new case from existing
  };

  return (
    <div className="flex-1 space-y-6 p-8 overflow-auto">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planning View</h1>
          <p className="text-muted-foreground">
            Manage future rounds, reserves, and investment cases with probability weighting
          </p>
        </div>
        <div className="flex space-x-3">
          <Button 
            onClick={() => setShowCaseDialog(true)}
            variant="outline"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Case
          </Button>
          <Button 
            onClick={handleSyncCases}
            className="povc-bg-primary hover:bg-blue-700"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Sync Cases
          </Button>
        </div>
      </div>

      {/* Case Selection and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Investment Cases</CardTitle>
              <CardDescription>
                Select and manage different probability-weighted investment scenarios
              </CardDescription>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="case-select">Case:</Label>
                <Select value={selectedCase} onValueChange={setSelectedCase}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select case" />
                  </SelectTrigger>
                  <SelectContent>
                    {investmentCases.map((investmentCase) => (
                      <SelectItem key={investmentCase.id} value={investmentCase.id}>
                        {investmentCase.name} ({investmentCase.probability}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="filter-rounds">Show:</Label>
                <Select value={filterRounds} onValueChange={setFilterRounds}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter rounds" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="next-3">Next 3 Rounds</SelectItem>
                    <SelectItem value="next-4">Next 4 Rounds</SelectItem>
                    <SelectItem value="next-6">Next 6 Rounds</SelectItem>
                    <SelectItem value="all">All Future</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {investmentCases.map((investmentCase) => (
              <Card 
                key={investmentCase.id} 
                className={`cursor-pointer transition-colors ${
                  selectedCase === investmentCase.id 
                    ? 'ring-2 ring-blue-600 bg-blue-50' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedCase(investmentCase.id)}
              >
                <CardContent className="p-4 text-center">
                  <div className="space-y-2">
                    <h3 className="font-medium">{investmentCase.name}</h3>
                    <div className="text-sm text-muted-foreground">
                      {investmentCase.probability}% probability
                    </div>
                    {investmentCase.isDefault && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Future Rounds Planning Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Future Rounds Planning</span>
          </CardTitle>
          <CardDescription>
            Probability-weighted reserves and expected investment levels for {selectedCase} case
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Info Banner */}
            <div className="flex items-start space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Reserve Calculation</p>
                <p className="text-blue-700">
                  Reserved amounts are probability-weighted based on graduation rate. 
                  E.g., 50% graduation rate on $1.5M reserve = $750K actual reserve.
                </p>
              </div>
            </div>

            {/* Rounds Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Round</th>
                    <th className="text-left p-3 font-medium">Expected Date</th>
                    <th className="text-left p-3 font-medium">Investment</th>
                    <th className="text-left p-3 font-medium">Reserve Amount</th>
                    <th className="text-left p-3 font-medium">Graduation Rate</th>
                    <th className="text-left p-3 font-medium">Actual Reserve</th>
                    <th className="text-left p-3 font-medium">FMV</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {futureRounds.map((round) => {
                    const actualReserve = (round.reserveAmount || 0) * ((round.graduationRate || 0) / 100);
                    return (
                      <tr key={round.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{round.company}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{round.round}</Badge>
                        </td>
                        <td className="p-3">
                          <Input 
                            type="date" 
                            defaultValue={round.date}
                            className="w-auto"
                          />
                        </td>
                        <td className="p-3">
                          <Input 
                            defaultValue={`$${(round.investment / 1000000).toFixed(1)}M`}
                            className="w-20"
                          />
                        </td>
                        <td className="p-3">
                          <Input 
                            defaultValue={`$${((round.reserveAmount || 0) / 1000000).toFixed(1)}M`}
                            className="w-20"
                          />
                        </td>
                        <td className="p-3">
                          <Input 
                            defaultValue={`${round.graduationRate}%`}
                            className="w-16"
                          />
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-green-600">
                            ${(actualReserve / 1000000).toFixed(1)}M
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm ${round.fmvOverride ? 'text-blue-600 font-medium' : ''}`}>
                              ${(round.fmv / 1000).toFixed(0)}K
                            </span>
                            {round.fmvOverride && (
                              <Badge variant="secondary" className="text-xs">Manual</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex space-x-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedRound(round);
                                setShowFMVDialog(true);
                              }}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline">
                Reset Changes
              </Button>
              <Button className="povc-bg-primary hover:bg-blue-700">
                Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Case Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Case Management</CardTitle>
          <CardDescription>
            Sync rounds between cases and manage different investment scenarios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Button 
              variant="outline" 
              className="h-20 flex-col space-y-2"
              onClick={() => handleCloneCase("base")}
            >
              <Copy className="h-5 w-5" />
              <span>Clone from Base</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-20 flex-col space-y-2"
              onClick={handleSyncCases}
            >
              <RotateCcw className="h-5 w-5" />
              <span>Sync All Cases</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-20 flex-col space-y-2"
              onClick={() => setShowCaseDialog(true)}
            >
              <Plus className="h-5 w-5" />
              <span>New Case</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FMV Override Dialog */}
      <Dialog open={showFMVDialog} onOpenChange={setShowFMVDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>FMV Override</DialogTitle>
            <DialogDescription>
              Override the Fair Market Value calculation for this investment round
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-2">FMV Override</h4>
              <p className="text-sm text-muted-foreground mb-3">
                By default, Tactyc determines the FMV based on the Valuation and 
                Ownership as Aggregate Valuation x Ownership (%). You can override 
                the FMV here to disconnect the FMV from the underlying Aggregate 
                Valuation and Ownership.
              </p>
              
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-sm mb-1">When to override?</h5>
                  <p className="text-sm text-muted-foreground">
                    You may want to override the FMV if your fund's valuation policy 
                    differs from Tactyc's. These include affecting FMV for any 
                    outstanding liquidation preferences, or how your fund wants to 
                    report valuations on SAFEs and Convertible Notes.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="enable-override" />
              <Label htmlFor="enable-override">Enable Manual FMV Override?</Label>
            </div>

            <div>
              <Label htmlFor="new-fmv">New Fair Market Value</Label>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-sm">$</span>
                <Input 
                  id="new-fmv"
                  defaultValue={selectedRound?.fmv.toString() || "200000"}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline" onClick={() => setShowFMVDialog(false)}>
                Cancel
              </Button>
              <Button 
                className="povc-bg-primary hover:bg-blue-700"
                onClick={() => {
                  if (selectedRound) {
                    handleFMVOverride(selectedRound, 200000);
                  }
                }}
              >
                OK
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Planning Analysis Tabs */}
      <Tabs defaultValue="cases" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="cases">Investment Cases</TabsTrigger>
          <TabsTrigger value="construction">Portfolio Construction</TabsTrigger>
          <TabsTrigger value="reserves">Optimal Reserves</TabsTrigger>
          <TabsTrigger value="graduation">Follow-On Strategy</TabsTrigger>
          <TabsTrigger value="exits">Exit Analysis</TabsTrigger>
          <TabsTrigger value="liquidation">Fund Liquidation</TabsTrigger>
          <TabsTrigger value="recycling">Exit Recycling</TabsTrigger>
        </TabsList>

        <TabsContent value="cases">
          <Card>
            <CardHeader>
              <CardTitle>Investment Cases Management</CardTitle>
              <CardDescription>
                Current investment cases view displayed above - switch tabs for advanced planning analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                The investment cases table and management interface is shown above. Use the other tabs to access:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                <li><strong>Portfolio Construction:</strong> Interactive fund modeling with parameter sliders</li>
                <li><strong>Optimal Reserves:</strong> Rank portfolio companies by follow-on MOIC potential</li>
                <li><strong>Follow-On Strategy:</strong> Graduation rate analysis and Monte Carlo simulations</li>
                <li><strong>Exit Analysis:</strong> Calculate fund returns based on exit rates and valuations</li>
                <li><strong>Fund Liquidation:</strong> Review investments that extend beyond fund term with early liquidation warnings</li>
                <li><strong>Exit Recycling:</strong> Manage recycling of exit proceeds into new investments based on timing conditions</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="construction">
          <PortfolioConstruction />
        </TabsContent>

        <TabsContent value="reserves">
          <OptimalReservesRanking />
        </TabsContent>

        <TabsContent value="graduation">
          <GraduationRateStrategy />
        </TabsContent>

        <TabsContent value="exits">
          <ExitAnalysis />
        </TabsContent>

        <TabsContent value="liquidation">
          <FundLiquidationWarnings 
            fundEndDate="March 2030"
            investments={[]}
          />
        </TabsContent>

        <TabsContent value="recycling">
          <ExitProceedsRecycling />
        </TabsContent>
      </Tabs>
    </div>
  );
}
