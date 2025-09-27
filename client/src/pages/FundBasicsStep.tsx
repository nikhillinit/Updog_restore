import React from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowRight } from "lucide-react";
import { useFundSelector, useFundAction } from '@/stores/useFundSelector';

export default function FundBasicsStep() {
  const [, navigate] = useLocation();
  
  // State
  const fundName = useFundSelector(s => s.fundName);
  const isEvergreen = useFundSelector(s => s.isEvergreen);
  const fundLife = useFundSelector(s => s.fundLife);
  const investmentPeriod = useFundSelector(s => s.investmentPeriod);
  const fundSize = useFundSelector(s => s.fundSize);
  const managementFeeRate = useFundSelector(s => s.managementFeeRate);
  const carriedInterest = useFundSelector(s => s.carriedInterest);

  // Actions
  const updateFundBasics = useFundAction(s => s.updateFundBasics);

  // Auto-populate with defaults for easy testing
  React.useEffect(() => {
    if (!fundName) {
      updateFundBasics({
        fundName: 'Test Fund I',
        fundSize: 50,
        managementFeeRate: 2.0,
        carriedInterest: 20,
        fundLife: 10,
        investmentPeriod: 3
      });
    }
  }, [fundName, updateFundBasics]);

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

      <div className="flex justify-end mt-6">
        <Button 
          onClick={() => {
            console.log('[FundBasics] Next button clicked, navigating to step 2');
            console.log('[FundBasics] Current URL before navigate:', window.location.href);
            navigate('/fund-setup?step=2');
            // Check URL after a brief delay
            setTimeout(() => {
              console.log('[FundBasics] URL after navigate:', window.location.href);
            }, 100);
          }}
          className="flex items-center gap-2"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}