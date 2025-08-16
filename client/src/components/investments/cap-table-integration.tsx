/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calculator, ExternalLink, Plus, TrendingUp, DollarSign, Percent } from 'lucide-react';
import CapTableCalculator from '@/components/cap-table/cap-table-calculator';

interface Investment {
  id: number;
  name: string;
  amount: number;
  valuationAtInvestment: number;
  ownershipPercentage: number;
  sector: string;
  stage: string;
}

interface CapTableIntegrationProps {
  investment: Investment;
}

export default function CapTableIntegration({ investment }: CapTableIntegrationProps) {
  const [showFullCalculator, setShowFullCalculator] = useState(false);
  const [scenarios, setScenarios] = useState([
    {
      id: '1',
      name: 'Series A Modeling',
      status: 'active',
      preMoneyValuation: 15000000,
      roundSize: 5000000,
      dilution: 23.5,
      lastModified: new Date().toISOString()
    },
    {
      id: '2',
      name: 'Bridge Round',
      status: 'draft',
      preMoneyValuation: 12000000,
      roundSize: 2000000,
      dilution: 18.2,
      lastModified: new Date().toISOString()
    }
  ]);

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

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Current Valuation</p>
                <p className="text-lg font-bold">{formatCurrency(investment.valuationAtInvestment)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Percent className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Our Ownership</p>
                <p className="text-lg font-bold">{investment.ownershipPercentage}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Investment Amount</p>
                <p className="text-lg font-bold">{formatCurrency(investment.amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Scenarios</p>
                <p className="text-lg font-bold">{scenarios.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Existing Cap Table Scenarios */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium">Cap Table Scenarios</h3>
            <p className="text-sm text-gray-600">Saved scenarios for {investment.name}</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => window.open('/cap-tables', '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage All
            </Button>
            <Dialog open={showFullCalculator} onOpenChange={setShowFullCalculator}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Scenario
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Cap Table Calculator - {investment.name}</DialogTitle>
                </DialogHeader>
                <CapTableCalculator />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {scenarios.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarios.map((scenario) => (
              <Card key={scenario.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{scenario.name}</CardTitle>
                      <p className="text-sm text-gray-600">{investment.name}</p>
                    </div>
                    <Badge className={getStatusColor(scenario.status)}>
                      {scenario.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Pre-Money</p>
                      <p className="font-medium">{formatCurrency(scenario.preMoneyValuation)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Round Size</p>
                      <p className="font-medium">{formatCurrency(scenario.roundSize)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Dilution</p>
                      <p className="font-medium">{scenario.dilution.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Modified</p>
                      <p className="font-medium">{new Date(scenario.lastModified).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Button variant="outline" size="sm" className="flex-1 mr-2">
                      Open Calculator
                    </Button>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Calculator className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Cap Table Scenarios</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Create your first cap table scenario to model SAFE/Note conversions for {investment.name}.
              </p>
              <Button onClick={() => setShowFullCalculator(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Scenario
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div className="border rounded-lg p-6 bg-gray-50">
        <h4 className="font-medium mb-4">Quick Actions</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button variant="outline" className="justify-start">
            <Calculator className="h-4 w-4 mr-2" />
            Model Next Round
          </Button>
          <Button variant="outline" className="justify-start">
            <Plus className="h-4 w-4 mr-2" />
            Add SAFE/Note
          </Button>
          <Button variant="outline" className="justify-start">
            <TrendingUp className="h-4 w-4 mr-2" />
            Analyze Dilution
          </Button>
        </div>
      </div>
    </div>
  );
}
