import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFundSelector, useFundAction } from '@/stores/useFundSelector';

export default function FundBasicsStep() {
  // State
  const fundName = useFundSelector(s => s.fundName);
  const fundType = useFundSelector(s => s.fundType);
  const isEvergreen = useFundSelector(s => s.isEvergreen);
  const fundLife = useFundSelector(s => s.fundLife);
  const investmentPeriod = useFundSelector(s => s.investmentPeriod);
  const fundSize = useFundSelector(s => s.fundSize);
  const managementFeeRate = useFundSelector(s => s.managementFeeRate);
  const preferredReturn = useFundSelector(s => s.preferredReturn);
  const gpCatchUp = useFundSelector(s => s.gpCatchUp);
  const carriedInterest = useFundSelector(s => s.carriedInterest);

  // Actions
  const updateFundBasics = useFundAction(s => s.updateFundBasics);

  const handleInputChange = (field: string, value: any) => {
    updateFundBasics({ [field]: value });
  };

  const handleEvergreenToggle = (checked: boolean) => {
    updateFundBasics({ 
      isEvergreen: checked,
      // Clear closed-end specific fields when switching to evergreen
      fundLife: checked ? undefined : fundLife,
      investmentPeriod: checked ? undefined : investmentPeriod
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Fund Basics</h2>
        <p className="text-gray-600 mt-2">Define your fund structure and key parameters</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fund Structure</CardTitle>
          <CardDescription>
            Core fund parameters and structure type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fund-name">Fund Name</Label>
              <Input
                id="fund-name"
                value={fundName || ''}
                onChange={(e) => handleInputChange('fundName', e.target.value)}
                placeholder="e.g., Growth Fund III"
                data-testid="fund-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fund-type">Fund Type</Label>
              <Select
                value={fundType || 'venture'}
                onValueChange={(value) => handleInputChange('fundType', value)}
              >
                <SelectTrigger id="fund-type" data-testid="fund-type">
                  <SelectValue placeholder="Select fund type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="venture">Venture Capital</SelectItem>
                  <SelectItem value="growth">Growth Equity</SelectItem>
                  <SelectItem value="buyout">Buyout</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2 py-4 border-t">
            <Switch
              id="evergreen"
              checked={isEvergreen || false}
              onCheckedChange={handleEvergreenToggle}
              data-testid="evergreen-toggle"
            />
            <Label htmlFor="evergreen" className="cursor-pointer">
              Evergreen Fund Structure
            </Label>
          </div>

          {!isEvergreen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fund-life">Fund Life (years)</Label>
                <Input
                  id="fund-life"
                  type="number"
                  min="1"
                  max="20"
                  value={fundLife || ''}
                  onChange={(e) => handleInputChange('fundLife', parseFloat(e.target.value) || undefined)}
                  placeholder="e.g., 10"
                  data-testid="fund-life"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="investment-period">Investment Period (years)</Label>
                <Input
                  id="investment-period"
                  type="number"
                  min="1"
                  max="10"
                  value={investmentPeriod || ''}
                  onChange={(e) => handleInputChange('investmentPeriod', parseFloat(e.target.value) || undefined)}
                  placeholder="e.g., 3"
                  data-testid="investment-period"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fund-size">Target Fund Size ($M)</Label>
            <Input
              id="fund-size"
              type="number"
              min="0"
              step="0.1"
              value={fundSize || ''}
              onChange={(e) => handleInputChange('fundSize', parseFloat(e.target.value) || undefined)}
              placeholder="e.g., 100"
              data-testid="fund-size"
            />
            <p className="text-sm text-gray-500">
              This will be automatically calculated from LP commitments if not specified
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Economics</CardTitle>
          <CardDescription>
            Management fees and carry structure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mgmt-fee">Management Fee (%)</Label>
              <Input
                id="mgmt-fee"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={managementFeeRate || ''}
                onChange={(e) => handleInputChange('managementFeeRate', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 2.0"
                data-testid="mgmt-fee"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="preferred-return">Preferred Return (%)</Label>
              <Input
                id="preferred-return"
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={preferredReturn || ''}
                onChange={(e) => handleInputChange('preferredReturn', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 8.0"
                data-testid="preferred-return"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gp-catchup">GP Catch-up (%)</Label>
              <Input
                id="gp-catchup"
                type="number"
                min="0"
                max="100"
                step="1"
                value={gpCatchUp || ''}
                onChange={(e) => handleInputChange('gpCatchUp', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 100"
                data-testid="gp-catchup"
              />
              <p className="text-sm text-gray-500">
                Percentage of distributions to GP until caught up
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="carried-interest">Carried Interest (%)</Label>
              <Input
                id="carried-interest"
                type="number"
                min="0"
                max="50"
                step="1"
                value={carriedInterest || ''}
                onChange={(e) => handleInputChange('carriedInterest', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 20"
                data-testid="carried-interest"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}