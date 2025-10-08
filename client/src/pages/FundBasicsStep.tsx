import React from 'react';
import { useLocation } from 'wouter';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowRight } from 'lucide-react';
import { useFundSelector, useFundAction } from '@/stores/useFundSelector';
import { useFundContext } from '@/contexts/FundContext';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';

export default function FundBasicsStep() {
  const [, navigate] = useLocation();

  // State
  const isEvergreen = useFundSelector((s) => s.isEvergreen);
  const fundLife = useFundSelector((s) => s.fundLife);
  const investmentPeriod = useFundSelector((s) => s.investmentPeriod);
  const managementFeeRate = useFundSelector((s) => s.managementFeeRate);
  const carriedInterest = useFundSelector((s) => s.carriedInterest);

  // Actions
  const updateFundBasics = useFundAction((s) => s.updateFundBasics);
  const { currentFund, setCurrentFund } = useFundContext();

  // Initialize with sensible defaults (10 year term, 5 year investment period)
  React.useEffect(() => {
    if (fundLife === undefined && investmentPeriod === undefined) {
      updateFundBasics({
        fundLife: 10,
        investmentPeriod: 5,
        managementFeeRate: 2.0,
        carriedInterest: 20,
      });
    }
  }, [fundLife, investmentPeriod, updateFundBasics]);

  const handleInputChange = (field: string, value: number | undefined) => {
    const updateData: Record<string, number | undefined> = { [field]: value };

    // Update the fund store
    updateFundBasics(updateData);

    // Sync critical fields to FundContext
    if (currentFund && (field === 'managementFeeRate' || field === 'carriedInterest')) {
      const updatedFund = { ...currentFund };

      switch (field) {
        case 'managementFeeRate':
          updatedFund.managementFee = value ? value / 100 : 0; // Convert from percentage to decimal
          break;
        case 'carriedInterest':
          updatedFund.carryPercentage = value ? value / 100 : 0; // Convert from percentage to decimal
          break;
      }

      setCurrentFund(updatedFund);
    }
  };

  const handleEvergreenToggle = (checked: boolean) => {
    updateFundBasics({
      isEvergreen: checked,
      // Clear closed-end specific fields when switching to evergreen
      fundLife: checked ? undefined : fundLife,
      investmentPeriod: checked ? undefined : investmentPeriod,
    });
  };

  return (
    <ModernStepContainer title="Fund Basics" description="Fund lifecycle and economics structure">
      <div className="space-y-8">
        {/* Fund Structure Section */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3">
            <Switch
              id="evergreen"
              checked={isEvergreen || false}
              onCheckedChange={handleEvergreenToggle}
              data-testid="evergreen-toggle"
            />
            <Label
              htmlFor="evergreen"
              className="cursor-pointer text-sm font-poppins font-medium text-[#292929]"
            >
              Evergreen Fund Structure
            </Label>
          </div>

          {!isEvergreen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label
                  htmlFor="fund-life"
                  className="text-sm font-poppins font-medium text-[#292929]"
                >
                  Fund Life (years)
                </Label>
                <Input
                  id="fund-life"
                  type="number"
                  min="1"
                  max="20"
                  value={fundLife || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleInputChange('fundLife', parseFloat(e.target.value) || undefined)
                  }
                  placeholder="e.g., 10"
                  data-testid="fund-life"
                  className="h-12 font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
                />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="investment-period"
                  className="text-sm font-poppins font-medium text-[#292929]"
                >
                  Investment Period (years)
                </Label>
                <Input
                  id="investment-period"
                  type="number"
                  min="1"
                  max="10"
                  value={investmentPeriod || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleInputChange('investmentPeriod', parseFloat(e.target.value) || undefined)
                  }
                  placeholder="e.g., 3"
                  data-testid="investment-period"
                  className="h-12 font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Economics Section */}
        <div className="space-y-6 pt-8 border-t border-[#E0D8D1]">
          <h3 className="text-lg font-inter font-bold text-[#292929]">Economics</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="mgmt-fee" className="text-sm font-poppins font-medium text-[#292929]">
                Management Fee (%)
              </Label>
              <Input
                id="mgmt-fee"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={managementFeeRate || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange('managementFeeRate', parseFloat(e.target.value) || undefined)
                }
                placeholder="e.g., 2.0"
                data-testid="mgmt-fee"
                className="h-12 font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="carried-interest"
                className="text-sm font-poppins font-medium text-[#292929]"
              >
                Carried Interest (%)
              </Label>
              <Input
                id="carried-interest"
                type="number"
                min="0"
                max="50"
                step="1"
                value={carriedInterest || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange('carriedInterest', parseFloat(e.target.value) || undefined)
                }
                placeholder="e.g., 20"
                data-testid="carried-interest"
                className="h-12 font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-end pt-8 border-t border-[#E0D8D1] mt-8">
          <Button
            data-testid="next-step"
            onClick={() => navigate('/fund-setup?step=2')}
            className="flex items-center gap-2 bg-[#292929] hover:bg-[#292929]/90 text-white px-8 py-3 h-auto font-poppins font-medium transition-all duration-200"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}
