import { useState } from "react";
import { useFundContext } from "@/contexts/FundContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Trash2, PlayCircle, Info } from "lucide-react";

interface Scenario {
  id: string;
  name: string;
  type: 'construction' | 'current' | 'custom';
  metrics: {
    totalInitialInvestments: number;
    investableCapital: number;
    initialCapital: number;
    followOnCapital: number;
    followOnReserve: number;
    projectedFundValue: number;
    grossMultiple: number;
    tvpi: number;
    grossIrr: number;
    netIrr: number;
    totalToLPs: number;
  };
}

const predefinedScenarios: Scenario[] = [
  {
    id: 'construction',
    name: 'Construction Forecast',
    type: 'construction',
    metrics: {
      totalInitialInvestments: 90.4,
      investableCapital: 205311250,
      initialCapital: 118042644,
      followOnCapital: 87268606,
      followOnReserve: 42.51,
      projectedFundValue: 1110377528,
      grossMultiple: 5.41,
      tvpi: 4.48,
      grossIrr: 26.59,
      netIrr: 22.04,
      totalToLPs: 878375982
    }
  },
  {
    id: 'current',
    name: 'Current Forecast',
    type: 'current',
    metrics: {
      totalInitialInvestments: 70.8,
      investableCapital: 192120799,
      initialCapital: 120710493,
      followOnCapital: 71410306,
      followOnReserve: 37.17,
      projectedFundValue: 887587179,
      grossMultiple: 4.62,
      tvpi: 3.64,
      grossIrr: 28.71,
      netIrr: 23.15,
      totalToLPs: 714049662
    }
  },
  {
    id: 'base-case',
    name: 'Base Case',
    type: 'custom',
    metrics: {
      totalInitialInvestments: 70.3,
      investableCapital: 191909108,
      initialCapital: 119939398,
      followOnCapital: 71969711,
      followOnReserve: 37.50,
      projectedFundValue: 867132953,
      grossMultiple: 4.52,
      tvpi: 3.56,
      grossIrr: 28.53,
      netIrr: 22.96,
      totalToLPs: 698179514
    }
  },
  {
    id: 'alpha-writeoff',
    name: 'Alpha write off',
    type: 'custom',
    metrics: {
      totalInitialInvestments: 71.2,
      investableCapital: 192158999,
      initialCapital: 121198350,
      followOnCapital: 70960648,
      followOnReserve: 36.93,
      projectedFundValue: 863860842,
      grossMultiple: 4.50,
      tvpi: 3.55,
      grossIrr: 27.60,
      netIrr: 22.19,
      totalToLPs: 695418265
    }
  },
  {
    id: 'smaller-fund',
    name: 'Smaller fund $150m',
    type: 'custom',
    metrics: {
      totalInitialInvestments: 49.3,
      investableCapital: 140337901,
      initialCapital: 91372597,
      followOnCapital: 48965303,
      followOnReserve: 34.89,
      projectedFundValue: 657975564,
      grossMultiple: 4.69,
      tvpi: 3.61,
      grossIrr: 28.46,
      netIrr: 22.90,
      totalToLPs: 530850448
    }
  },
  {
    id: 'ipo',
    name: 'IPO',
    type: 'custom',
    metrics: {
      totalInitialInvestments: 72.5,
      investableCapital: 191164172,
      initialCapital: 122890726,
      followOnCapital: 68273446,
      followOnReserve: 35.71,
      projectedFundValue: 948227005,
      grossMultiple: 4.90,
      tvpi: 3.89,
      grossIrr: 30.87,
      netIrr: 24.86,
      totalToLPs: 752523302
    }
  },
  {
    id: 'pre-seed-1-5mm',
    name: 'Pre seed $1.5mm',
    type: 'custom',
    metrics: {
      totalInitialInvestments: 70.6,
      investableCapital: 184720576,
      initialCapital: 127789263,
      followOnCapital: 56931313,
      followOnReserve: 30.82,
      projectedFundValue: 861455679,
      grossMultiple: 4.60,
      tvpi: 3.56,
      grossIrr: 27.82,
      netIrr: 22.21,
      totalToLPs: 689632956
    }
  }
];

export default function ScenarioBuilder() {
  const { currentFund, isLoading } = useFundContext();
  const [scenarios, setScenarios] = useState<Scenario[]>(predefinedScenarios);
  const [selectedScenario, setSelectedScenario] = useState<string>('construction');
  const [newScenarioName, setNewScenarioName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (isLoading || !currentFund) {
    return (
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="h-20 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const handleCreateScenario = () => {
    if (!newScenarioName.trim()) return;
    
    const baseScenario = scenarios.find(s => s.id === selectedScenario) || scenarios[0];
    if (!baseScenario) return;

    const newScenario: Scenario = {
      id: `custom-${Date.now()}`,
      name: newScenarioName,
      type: 'custom',
      metrics: { ...baseScenario.metrics }
    };
    
    setScenarios([...scenarios, newScenario]);
    setNewScenarioName('');
    setShowCreateForm(false);
  };

  const handleDuplicateScenario = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      const duplicated: Scenario = {
        ...scenario,
        id: `copy-${Date.now()}`,
        name: `${scenario.name} Copy`,
        type: 'custom'
      };
      setScenarios([...scenarios, duplicated]);
    }
  };

  const handleDeleteScenario = (scenarioId: string) => {
    if (scenarios.find(s => s.id === scenarioId)?.type !== 'custom') return;
    setScenarios(scenarios.filter(s => s.id !== scenarioId));
  };

  const formatCurrency = (value: number) => {
    return `$${(value / 1000000).toFixed(0)}M`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const formatMultiple = (value: number) => {
    return `${value.toFixed(2)}x`;
  };

  const getScenarioTypeColor = (type: string) => {
    switch (type) {
      case 'construction': return 'bg-blue-100 text-blue-800';
      case 'current': return 'bg-green-100 text-green-800';
      case 'custom': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentFund.name} / Scenario Builder</h1>
            <p className="text-gray-600 mt-2">
              Scenarios are configurations of your fund's parameters to compare performance of different strategies. 
              <a href="#" className="text-blue-600 hover:underline ml-1">See running fund scenarios to learn more.</a>
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Scenario
            </Button>
            <Button size="sm">
              <PlayCircle className="h-4 w-4 mr-2" />
              Run Analysis
            </Button>
          </div>
        </div>
      </div>

      {/* Create New Scenario Form */}
      {showCreateForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Create New Scenario</CardTitle>
            <CardDescription>
              Create a new scenario based on an existing configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scenario-name">Scenario Name</Label>
                <Input
                  id="scenario-name"
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  placeholder="Enter scenario name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base-scenario">Base Scenario</Label>
                <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select base scenario" />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.map((scenario) => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <Button onClick={handleCreateScenario}>
                Create Scenario
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Scenarios Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Scenarios</CardTitle>
          <CardDescription>
            Compare performance across different fund configurations and strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Scenario</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">
                    <div className="flex flex-col">
                      <span>Construction</span>
                      <span>Forecast</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">
                    <div className="flex flex-col">
                      <span>Current</span>
                      <span>Forecast</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Base Case</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Alpha write off</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">
                    <div className="flex flex-col">
                      <span>Smaller fund</span>
                      <span>$150m</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">IPO</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Pre seed $1.5mm</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Capital & Investments Section */}
                <tr className="bg-gray-50">
                  <td colSpan={9} className="py-3 px-4 font-semibold text-gray-800">
                    Capital & Investments
                  </td>
                </tr>
                
                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    <div className="flex flex-col">
                      <span>Total Initial Investments Show By Entry</span>
                      <span>Round</span>
                    </div>
                  </td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {scenario.metrics.totalInitialInvestments.toFixed(1)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">Investable Capital</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatCurrency(scenario.metrics.investableCapital)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">Initial Capital</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatCurrency(scenario.metrics.initialCapital)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">Follow-on Capital</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatCurrency(scenario.metrics.followOnCapital)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">Follow-on Reserve</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatPercentage(scenario.metrics.followOnReserve)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                {/* Performance Section */}
                <tr className="bg-gray-50">
                  <td colSpan={9} className="py-3 px-4 font-semibold text-gray-800">
                    Performance
                  </td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">Projected Fund Value</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatCurrency(scenario.metrics.projectedFundValue)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">Gross Multiple</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatMultiple(scenario.metrics.grossMultiple)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">TVPI</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatMultiple(scenario.metrics.tvpi)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">Gross IRR</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatPercentage(scenario.metrics.grossIrr)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">Net IRR</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatPercentage(scenario.metrics.netIrr)}
                    </td>
                  ))}
                  <td className="py-3 px-4"></td>
                </tr>

                {/* Proceeds Section */}
                <tr className="bg-gray-50">
                  <td colSpan={9} className="py-3 px-4 font-semibold text-gray-800">
                    Proceeds
                  </td>
                </tr>

                <tr>
                  <td className="py-3 px-4 text-sm text-gray-600">Total to LPs</td>
                  {scenarios.map((scenario) => (
                    <td key={scenario.id} className="py-3 px-4 text-center text-sm">
                      {formatCurrency(scenario.metrics.totalToLPs)}
                    </td>
                  ))}
                  <td className="py-3 px-4">
                    <div className="flex space-x-1">
                      <Button size="sm" variant="outline" className="p-1">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="p-1">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer Note */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Note:</p>
                <p>Scenario Builder does not evaluate impact of any fund of fund investments. Only direct investments are incorporated in the scenario calculation process.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
