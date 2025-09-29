import React from 'react';
import { useLocation } from 'wouter';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowRight } from "lucide-react";
import { useFundSelector, useFundAction } from '@/stores/useFundSelector';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';

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
    <ModernStepContainer
      title="Fund Basics"
      description="Name, currency, and fund lifecycle"
    >
      <div className="space-y-8">
        {/* Fund Structure Section */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="fund-name" className="text-sm font-medium text-charcoal-700">Fund Name *</Label>
            <Input
              id="fund-name"
              value={fundName || ''}
              onChange={(e: any) => handleInputChange('fundName', e.target.value)}
              placeholder="Enter your fund name"
              data-testid="fund-name"
              className="h-12 text-base"
            />
          </div>

          <div className="flex items-center space-x-3 py-6 border-t border-gray-100">
            <Switch
              id="evergreen"
              checked={isEvergreen || false}
              onCheckedChange={handleEvergreenToggle}
              data-testid="evergreen-toggle"
            />
            <Label htmlFor="evergreen" className="cursor-pointer text-sm font-medium text-charcoal-700">
              Evergreen Fund Structure
            </Label>
          </div>

          {!isEvergreen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="fund-life" className="text-sm font-medium text-charcoal-700">Fund Life (years)</Label>
                <Input
                  id="fund-life"
                  type="number"
                  min="1"
                  max="20"
                  value={fundLife || ''}
                  onChange={(e: any) => handleInputChange('fundLife', parseFloat(e.target.value) || undefined)}
                  placeholder="e.g., 10"
                  data-testid="fund-life"
                  className="h-12"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="investment-period" className="text-sm font-medium text-charcoal-700">Investment Period (years)</Label>
                <Input
                  id="investment-period"
                  type="number"
                  min="1"
                  max="10"
                  value={investmentPeriod || ''}
                  onChange={(e: any) => handleInputChange('investmentPeriod', parseFloat(e.target.value) || undefined)}
                  placeholder="e.g., 3"
                  data-testid="investment-period"
                  className="h-12"
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="fund-size" className="text-sm font-medium text-charcoal-700">Target Fund Size ($M)</Label>
            <Input
              id="fund-size"
              type="number"
              min="0"
              step="0.1"
              value={fundSize || ''}
              onChange={(e: any) => handleInputChange('fundSize', parseFloat(e.target.value) || undefined)}
              placeholder="e.g., 100"
              data-testid="fund-size"
              className="h-12"
            />
            <p className="text-sm text-gray-500">
              This will be automatically calculated from LP commitments if not specified
            </p>
          </div>
        </div>

        {/* Economics Section */}
        <div className="space-y-6 pt-8 border-t border-gray-100">
          <h3 className="text-lg font-medium text-charcoal-800">Economics</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="mgmt-fee" className="text-sm font-medium text-charcoal-700">Management Fee (%)</Label>
              <Input
                id="mgmt-fee"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={managementFeeRate || ''}
                onChange={(e: any) => handleInputChange('managementFeeRate', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 2.0"
                data-testid="mgmt-fee"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="carried-interest" className="text-sm font-medium text-charcoal-700">Carried Interest (%)</Label>
              <Input
                id="carried-interest"
                type="number"
                min="0"
                max="50"
                step="1"
                value={carriedInterest || ''}
                onChange={(e: any) => handleInputChange('carriedInterest', parseFloat(e.target.value) || undefined)}
                placeholder="e.g., 20"
                data-testid="carried-interest"
                className="h-12"
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-end pt-8 border-t border-gray-100 mt-8">
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
            className="flex items-center gap-2 bg-charcoal-800 hover:bg-charcoal-900 text-white px-8 py-3 h-auto"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}