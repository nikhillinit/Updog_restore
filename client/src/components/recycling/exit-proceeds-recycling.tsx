import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  ArrowRightLeft, 
  Info, 
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react";

interface ExitEvent {
  id: string;
  company: string;
  exitDate: string;
  exitProceeds: number;
  recycledAmount: number;
  availableToRecycle: number;
  status: 'recycled' | 'pending' | 'missed';
  recyclingWindow: number; // months
}

interface InvestmentEvent {
  id: string;
  company: string;
  investmentDate: string;
  amount: number;
  round: string;
  fundingSource: 'initial' | 'recycled' | 'follow-on';
}

interface RecyclingConditions {
  hasExitsInInvestmentWindow: boolean;
  hasExitsInRecyclingWindow: boolean;
  hasInvestmentsToFund: boolean;
  recyclingEnabled: boolean;
}

export default function ExitProceedsRecycling() {
  const [recyclingEnabled, setRecyclingEnabled] = useState(true);
  const [recyclingWindow, setRecyclingWindow] = useState(3); // months
  const [selectedTab, setSelectedTab] = useState('overview');

  // Sample data for demonstration
  const exitEvents: ExitEvent[] = [
    {
      id: "1",
      company: "TechCorp",
      exitDate: "Jan 2025",
      exitProceeds: 2500000,
      recycledAmount: 1200000,
      availableToRecycle: 1300000,
      status: 'recycled',
      recyclingWindow: 3
    },
    {
      id: "2",
      company: "DataFlow Inc",
      exitDate: "Mar 2025",
      exitProceeds: 4200000,
      recycledAmount: 800000,
      availableToRecycle: 3400000,
      status: 'pending',
      recyclingWindow: 3
    },
    {
      id: "3",
      company: "AI Solutions",
      exitDate: "May 2025",
      exitProceeds: 1800000,
      recycledAmount: 0,
      availableToRecycle: 1800000,
      status: 'missed',
      recyclingWindow: 3
    }
  ];

  const investmentEvents: InvestmentEvent[] = [
    {
      id: "1",
      company: "NewCo Alpha",
      investmentDate: "Jan 2025",
      amount: 1200000,
      round: "Seed",
      fundingSource: 'recycled'
    },
    {
      id: "2",
      company: "StartupBeta",
      investmentDate: "Mar 2025",
      amount: 800000,
      round: "Series A",
      fundingSource: 'recycled'
    },
    {
      id: "3",
      company: "VentureCo",
      investmentDate: "Jun 2025",
      amount: 1500000,
      round: "Seed",
      fundingSource: 'initial'
    }
  ];

  const recyclingConditions: RecyclingConditions = {
    hasExitsInInvestmentWindow: true,
    hasExitsInRecyclingWindow: true,
    hasInvestmentsToFund: true,
    recyclingEnabled: recyclingEnabled
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'recycled': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'missed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'recycled': return <CheckCircle className="w-3 h-3" />;
      case 'pending': return <Clock className="w-3 h-3" />;
      case 'missed': return <AlertTriangle className="w-3 h-3" />;
      default: return null;
    }
  };

  const totalExitProceeds = exitEvents.reduce((sum, exit) => sum + exit.exitProceeds, 0);
  const totalRecycled = exitEvents.reduce((sum, exit) => sum + exit.recycledAmount, 0);
  const totalAvailable = exitEvents.reduce((sum, exit) => sum + exit.availableToRecycle, 0);
  const recyclingEfficiency = totalExitProceeds > 0 ? (totalRecycled / totalExitProceeds) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold flex items-center">
                <ArrowRightLeft className="w-6 h-6 mr-2 text-blue-600" />
                Exit Proceeds Recycling
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Manage and track the recycling of exit proceeds into new investments
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={recyclingEnabled} 
                  onCheckedChange={setRecyclingEnabled}
                  id="recycling-enabled"
                />
                <Label htmlFor="recycling-enabled">Enable Recycling</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="recycling-window">Window (months):</Label>
                <Input
                  id="recycling-window"
                  type="number"
                  value={recyclingWindow}
                  onChange={(e) => setRecyclingWindow(parseInt(e.target.value) || 3)}
                  className="w-20 h-8 text-center"
                  min={1}
                  max={12}
                />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Recycling Conditions Alert */}
      <Alert className={`border-2 ${recyclingConditions.hasExitsInInvestmentWindow && recyclingConditions.hasExitsInRecyclingWindow && recyclingConditions.hasInvestmentsToFund ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="font-semibold mb-2">Recycling Conditions Status</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className={`flex items-center ${recyclingConditions.hasExitsInInvestmentWindow ? 'text-green-700' : 'text-red-700'}`}>
              {recyclingConditions.hasExitsInInvestmentWindow ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Exits within investment window
            </div>
            <div className={`flex items-center ${recyclingConditions.hasExitsInRecyclingWindow ? 'text-green-700' : 'text-red-700'}`}>
              {recyclingConditions.hasExitsInRecyclingWindow ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Exits within recycling window
            </div>
            <div className={`flex items-center ${recyclingConditions.hasInvestmentsToFund ? 'text-green-700' : 'text-red-700'}`}>
              {recyclingConditions.hasInvestmentsToFund ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Investments available to fund
            </div>
          </div>
        </AlertDescription>
      </Alert>

      {/* Recycling Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalExitProceeds)}
          </div>
          <div className="text-sm text-blue-700 mt-1">Total Exit Proceeds</div>
          <div className="text-xs text-gray-600 mt-2">
            Available for recycling
          </div>
        </div>
        
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(totalRecycled)}
          </div>
          <div className="text-sm text-green-700 mt-1">Successfully Recycled</div>
          <div className="text-xs text-gray-600 mt-2">
            Into new investments
          </div>
        </div>
        
        <div className="text-center p-4 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(totalAvailable)}
          </div>
          <div className="text-sm text-orange-700 mt-1">Available to Recycle</div>
          <div className="text-xs text-gray-600 mt-2">
            Pending opportunities
          </div>
        </div>
        
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">
            {recyclingEfficiency.toFixed(1)}%
          </div>
          <div className="text-sm text-purple-700 mt-1">Recycling Efficiency</div>
          <div className="text-xs text-gray-600 mt-2">
            Proceeds successfully recycled
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="exits">Exit Events</TabsTrigger>
          <TabsTrigger value="investments">Investment Events</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Recycling Methodology</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Recycling Conditions</h4>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <strong>Condition 1:</strong> Exits must occur within the investment window for initial and follow-on investments.
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <strong>Condition 2:</strong> Exits must occur within the defined recycling window ({recyclingWindow} months).
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <strong>Condition 3:</strong> Only the minimum amount needed for investments in the same period will be recycled.
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Recycling Rules</h4>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <strong>Same Month Rule:</strong> Proceeds are recycled if there's an investment in the same month as the exit.
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <strong>Minimum Recycling:</strong> Only recycle the amount needed to fund investments, not all proceeds.
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <strong>Manual Override:</strong> Update the "Exit Proceeds Recycled" row to manually adjust recycling amounts.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exits">
          <Card>
            <CardHeader>
              <CardTitle>Exit Events and Recycling Status</CardTitle>
              <p className="text-sm text-gray-600">
                Track exit proceeds and their recycling status
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Company</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Exit Date</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Exit Proceeds</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Recycled Amount</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Available</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exitEvents.map((exit) => (
                      <tr key={exit.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{exit.company}</td>
                        <td className="py-3 px-4">{exit.exitDate}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatCurrency(exit.exitProceeds)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Input
                            type="number"
                            value={exit.recycledAmount}
                            className="w-32 h-8 text-right bg-yellow-50 border-yellow-200"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-green-600">
                          {formatCurrency(exit.availableToRecycle)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={`${getStatusColor(exit.status)} capitalize`}>
                            {getStatusIcon(exit.status)}
                            <span className="ml-1">{exit.status}</span>
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button variant="outline" size="sm">
                            Update
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments">
          <Card>
            <CardHeader>
              <CardTitle>Investment Events and Funding Sources</CardTitle>
              <p className="text-sm text-gray-600">
                View how investments are funded from recycled proceeds
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Company</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Investment Date</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Round</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Amount</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-600">Funding Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentEvents.map((investment) => (
                      <tr key={investment.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{investment.company}</td>
                        <td className="py-3 px-4">{investment.investmentDate}</td>
                        <td className="py-3 px-4">{investment.round}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatCurrency(investment.amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge 
                            className={`capitalize ${
                              investment.fundingSource === 'recycled' 
                                ? 'bg-green-100 text-green-800' 
                                : investment.fundingSource === 'follow-on'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {investment.fundingSource === 'recycled' && <ArrowRightLeft className="w-3 h-3 mr-1" />}
                            {investment.fundingSource === 'follow-on' && <TrendingUp className="w-3 h-3 mr-1" />}
                            {investment.fundingSource === 'initial' && <DollarSign className="w-3 h-3 mr-1" />}
                            {investment.fundingSource.replace('-', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline">
          Export Recycling Report
        </Button>
        <div className="space-x-2">
          <Button variant="outline">
            Reset Recycling
          </Button>
          <Button>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}