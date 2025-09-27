/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Copy, Download, Calendar, User, Calculator } from 'lucide-react';

interface CapTableScenario {
  id: string;
  name: string;
  investmentCompany: string;
  investmentId: string;
  status: 'draft' | 'active' | 'archived';
  lastModified: string;
  createdBy: string;
  preMoneyValuation: number;
  roundSize: number;
  totalSAFEs: number;
  totalNotes: number;
  dilution: number;
  description?: string;
}

interface ScenarioManagerProps {
  scenarios: CapTableScenario[];
  onScenariosChange: (_scenarios: CapTableScenario[]) => void;
  investmentId?: string;
}

export default function ScenarioManager({ scenarios, onScenariosChange, investmentId }: ScenarioManagerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [_selectedScenario, _setSelectedScenario] = useState<CapTableScenario | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredScenarios = scenarios.filter(scenario => {
    const matchesSearch = scenario.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         scenario.investmentCompany.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || scenario.status === filterStatus;
    const matchesInvestment = !investmentId || scenario.investmentId === investmentId;
    return matchesSearch && matchesStatus && matchesInvestment;
  });

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
      case 'active': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateScenario = (data: Partial<CapTableScenario>) => {
    const newScenario: CapTableScenario = {
      id: `scenario-${Date.now()}`,
      name: data.name || 'New Scenario',
      investmentCompany: data.investmentCompany || 'Unknown',
      investmentId: data.investmentId || investmentId || '',
      status: 'draft',
      lastModified: new Date().toISOString(),
      createdBy: 'Current User',
      preMoneyValuation: data.preMoneyValuation || 0,
      roundSize: data.roundSize || 0,
      totalSAFEs: data.totalSAFEs || 0,
      totalNotes: data.totalNotes || 0,
      dilution: data.dilution || 0,
      ...(data.description !== undefined && { description: data.description })
    };

    onScenariosChange([...scenarios, newScenario]);
    setShowCreateDialog(false);
  };

  const handleDuplicateScenario = (scenario: CapTableScenario) => {
    const duplicated: CapTableScenario = {
      ...scenario,
      id: `scenario-${Date.now()}`,
      name: `${scenario.name} (Copy)`,
      status: 'draft',
      lastModified: new Date().toISOString(),
      createdBy: 'Current User'
    };

    onScenariosChange([...scenarios, duplicated]);
  };

  const handleDeleteScenario = (scenarioId: string) => {
    onScenariosChange(scenarios.filter(s => s.id !== scenarioId));
  };

  const handleStatusChange = (scenarioId: string, newStatus: CapTableScenario['status']) => {
    onScenariosChange(scenarios.map(s => 
      s.id === scenarioId 
        ? { ...s, status: newStatus, lastModified: new Date().toISOString() }
        : s
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Cap Table Scenarios</h2>
          <p className="text-gray-600">Manage and compare different cap table modeling scenarios</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Scenario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Cap Table Scenario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Scenario Name</label>
                <Input placeholder="e.g., Series A Modeling" />
              </div>
              <div>
                <label className="text-sm font-medium">Investment Company</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a portfolio company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airchair">AirChair</SelectItem>
                    <SelectItem value="dataflow">DataFlow Systems</SelectItem>
                    <SelectItem value="techflow">TechFlow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Pre-Money Valuation</label>
                  <Input type="number" placeholder="15000000" />
                </div>
                <div>
                  <label className="text-sm font-medium">Round Size</label>
                  <Input type="number" placeholder="5000000" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Description (Optional)</label>
                <Input placeholder="Brief description of the scenario" />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => handleCreateScenario({
                  name: 'New Scenario',
                  investmentCompany: 'Selected Company',
                  preMoneyValuation: 15000000,
                  roundSize: 5000000
                })}>
                  Create Scenario
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Search scenarios..."
          value={searchTerm}
          onChange={(e: any) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredScenarios.map((scenario: any) => (
          <Card key={scenario.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{scenario.name}</CardTitle>
                  <p className="text-sm text-gray-600">{scenario.investmentCompany}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getStatusColor(scenario.status)}>
                    {scenario.status}
                  </Badge>
                  <Select
                    value={scenario.status}
                    onValueChange={(value: any) => handleStatusChange(scenario.id, value as CapTableScenario['status'])}
                  >
                    <SelectTrigger className="w-24 h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Pre-Money</p>
                  <p className="font-medium">{formatCurrency(scenario.preMoneyValuation)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Round Size</p>
                  <p className="font-medium">{formatCurrency(scenario.roundSize)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">SAFEs/Notes</p>
                  <p className="font-medium">{formatCurrency(scenario.totalSAFEs + scenario.totalNotes)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Dilution</p>
                  <p className="font-medium">{scenario.dilution.toFixed(1)}%</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <User className="h-3 w-3" />
                <span>{scenario.createdBy}</span>
                <Calendar className="h-3 w-3 ml-2" />
                <span>{new Date(scenario.lastModified).toLocaleDateString()}</span>
              </div>

              {scenario.description && (
                <p className="text-sm text-gray-600 border-t pt-3">{scenario.description}</p>
              )}

              <div className="flex items-center justify-between pt-3 border-t">
                <div className="flex items-center space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => handleDuplicateScenario(scenario)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteScenario(scenario.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center space-x-1">
                  <Button size="sm" variant="outline">
                    <Calculator className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredScenarios.length === 0 && (
        <Card className="text-center py-16">
          <CardContent>
            <Calculator className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Scenarios Found</h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || filterStatus !== 'all' 
                ? 'No scenarios match your current filters.'
                : 'Create your first cap table scenario to get started.'
              }
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Scenario
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
