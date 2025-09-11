/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
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
} from '@/components/ui/dialog';
import CapTableCalculator from '@/components/cap-table/cap-table-calculator';
import { Plus, Search, Calculator, Download, Building2, TrendingUp, DollarSign } from 'lucide-react';

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
}

const SAMPLE_CAP_TABLE_SCENARIOS: CapTableScenario[] = [
  {
    id: 'ct-1',
    name: 'Series A Modeling',
    investmentCompany: 'AirChair',
    investmentId: 'inv-1',
    status: 'active',
    lastModified: '2025-01-20T15:30:00Z',
    createdBy: 'Sarah Chen',
    preMoneyValuation: 15000000,
    roundSize: 5000000,
    totalSAFEs: 750000,
    totalNotes: 500000,
    dilution: 23.5
  },
  {
    id: 'ct-2',
    name: 'Seed Extension',
    investmentCompany: 'DataFlow Systems',
    investmentId: 'inv-2',
    status: 'draft',
    lastModified: '2025-01-19T10:15:00Z',
    createdBy: 'Mike Rodriguez',
    preMoneyValuation: 8000000,
    roundSize: 2500000,
    totalSAFEs: 300000,
    totalNotes: 200000,
    dilution: 28.2
  },
  {
    id: 'ct-3',
    name: 'Bridge Round Analysis',
    investmentCompany: 'TechFlow',
    investmentId: 'inv-3',
    status: 'archived',
    lastModified: '2025-01-18T14:45:00Z',
    createdBy: 'Jennifer Liu',
    preMoneyValuation: 12000000,
    roundSize: 1500000,
    totalSAFEs: 450000,
    totalNotes: 350000,
    dilution: 15.8
  }
];

export default function CapTables() {
  const { currentFund } = useFundContext();
  const [scenarios, _setScenarios] = useState<CapTableScenario[]>(SAMPLE_CAP_TABLE_SCENARIOS);
  const [_selectedScenario, setSelectedScenario] = useState<CapTableScenario | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredScenarios = scenarios.filter(scenario => {
    const matchesSearch = scenario.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         scenario.investmentCompany.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || scenario.status === filterStatus;
    return matchesSearch && matchesStatus;
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

  if (showCalculator) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setShowCalculator(false)}
              className="mb-4"
            >
              ← Back to Cap Tables
            </Button>
          </div>
          <CapTableCalculator />
        </div>
      </div>
    );
  }

  if (!currentFund) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Please select a fund to manage cap tables.</p>
          <Button className="mt-4" onClick={() => window.location.href = '/setup'}>
            Set Up Fund
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cap Tables</h1>
            <p className="text-gray-600">Model SAFE/Note conversions and analyze dilution scenarios</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setShowCalculator(true)}>
              <Calculator className="h-4 w-4 mr-2" />
              Cap Table Calculator
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Cap Table
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Scenarios</p>
                  <p className="text-lg font-bold">{scenarios.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Active Models</p>
                  <p className="text-lg font-bold">{scenarios.filter(s => s.status === 'active').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Avg Pre-Money</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(scenarios.reduce((sum, s) => sum + s.preMoneyValuation, 0) / scenarios.length)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-sm text-gray-600">Companies Modeled</p>
                  <p className="text-lg font-bold">{new Set(scenarios.map(s => s.investmentCompany)).size}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <Input
              placeholder="Search cap table scenarios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
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

        {/* Cap Table Scenarios Grid */}
        {filteredScenarios.length === 0 ? (
          <Card className="text-center py-16">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Calculator className="h-8 w-8 text-blue-600" />
              </div>
              <CardTitle>No Cap Table Scenarios</CardTitle>
              <p className="text-gray-600">
                Create your first cap table scenario to model SAFE/Note conversions.
              </p>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Cap Table
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredScenarios.map((scenario) => (
              <Card key={scenario.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{scenario.name}</CardTitle>
                      <p className="text-sm text-gray-600">{scenario.investmentCompany}</p>
                    </div>
                    <Badge className={getStatusColor(scenario.status)}>
                      {scenario.status}
                    </Badge>
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

                  <div className="pt-3 border-t">
                    <p className="text-xs text-gray-500">
                      Modified by {scenario.createdBy} • {new Date(scenario.lastModified).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedScenario(scenario);
                        setShowCalculator(true);
                      }}
                    >
                      Open Calculator
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Cap Table Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Cap Table Scenario</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Investment</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a portfolio company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="airchair">AirChair</SelectItem>
                    <SelectItem value="dataflow">DataFlow Systems</SelectItem>
                    <SelectItem value="techflow">TechFlow</SelectItem>
                    <SelectItem value="fintech-co">FinTech Co</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Scenario Name</label>
                <Input placeholder="e.g., Series A Modeling" />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  setShowCreateDialog(false);
                  setShowCalculator(true);
                }}>
                  Create & Open Calculator
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
