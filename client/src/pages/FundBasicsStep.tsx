import React from 'react';
import { useLocation } from 'wouter';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowRight } from 'lucide-react';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import { useFundSelector, useFundAction } from '@/stores/useFundSelector';
import { useFundContext } from '@/contexts/FundContext';
import { fundStore } from '@/stores/fundStore';
import { fundStoreToCreateV1, fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { createFund, normalizeCreateFundResponse } from '@/services/funds';
import { saveFundDraft } from '@/services/fund-drafts';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';
import { NumericInput } from '@/components/ui/NumericInput';
import { WizardCard } from '@/components/wizard/WizardCard';

type BootstrapStage = 'idle' | 'creating' | 'saving';

export default function FundBasicsStep() {
  const [, navigate] = useLocation();

  // State
  const fundName = useFundSelector((s) => s.fundName);
  const fundSize = useFundSelector((s) => s.fundSize);
  const isEvergreen = useFundSelector((s) => s.isEvergreen);
  const fundLife = useFundSelector((s) => s.fundLife);
  const investmentPeriod = useFundSelector((s) => s.investmentPeriod);
  const managementFeeRate = useFundSelector((s) => s.managementFeeRate);
  const carriedInterest = useFundSelector((s) => s.carriedInterest);
  const establishmentDate = useFundSelector((s) => s.establishmentDate);
  const vintageYear = useFundSelector((s) => s.vintageYear);
  const draftFundId = useFundSelector((s) => s.draftFundId);
  const draftServerReady = useFundSelector((s) => s.draftServerReady);

  // Actions
  const updateFundBasics = useFundAction((s) => s.updateFundBasics);
  const setDraftFundId = useFundAction((s) => s.setDraftFundId);
  const setDraftServerReady = useFundAction((s) => s.setDraftServerReady);
  const { currentFund, setCurrentFund } = useFundContext();
  const [bootstrapStage, setBootstrapStage] = React.useState<BootstrapStage>('idle');
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);

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

  const handleInputChange = (field: string, value: string | number | undefined) => {
    const updateData: Record<string, string | number | undefined> = { [field]: value };

    // Update the fund store
    updateFundBasics(updateData);

    // Sync critical fields to FundContext
    if (currentFund) {
      const updatedFund = { ...currentFund };

      switch (field) {
        case 'fundName':
          updatedFund.name = (value as string) || 'Untitled Fund';
          break;
        case 'fundSize':
          updatedFund.size = value ? (value as number) * 1000000 : 0; // Convert from M to dollars
          break;
        case 'managementFeeRate':
          updatedFund.managementFee = value ? (value as number) / 100 : 0; // Convert from percentage to decimal
          break;
        case 'carriedInterest':
          updatedFund.carryPercentage = value ? (value as number) / 100 : 0; // Convert from percentage to decimal
          break;
      }

      setCurrentFund(updatedFund);
    }
  };

  const handleEvergreenToggle = (checked: boolean) => {
    const baseUpdate = { isEvergreen: checked };

    // Clear closed-end specific fields when switching to evergreen
    const update = checked
      ? baseUpdate // Evergreen: omit fundLife and investmentPeriod entirely
      : {
          ...baseUpdate,
          ...spreadIfDefined('fundLife', fundLife),
          ...spreadIfDefined('investmentPeriod', investmentPeriod),
        };

    updateFundBasics(update);
  };

  const canBootstrapDraft = Boolean(fundName?.trim()) && (fundSize ?? 0) > 0;
  const isBootstrapping = bootstrapStage !== 'idle';

  const handleNext = async () => {
    if (isBootstrapping) {
      return;
    }

    setBootstrapError(null);
    let activeDraftFundId = draftFundId;

    if (activeDraftFundId == null && canBootstrapDraft) {
      setBootstrapStage('creating');

      try {
        const payload = fundStoreToCreateV1(fundStore.getState());
        const raw = await createFund({ ...payload });
        const fund = normalizeCreateFundResponse(raw);
        const normalizedSize =
          typeof fund['size'] === 'number' ? fund['size'] : Number(fund['size'] ?? 0);
        const now = new Date().toISOString();

        activeDraftFundId = fund.id;
        setDraftFundId(fund.id);
        setDraftServerReady(false);
        setCurrentFund({
          id: fund.id,
          name:
            typeof fund['name'] === 'string' ? fund['name'] : fundName?.trim() || 'Untitled Fund',
          size:
            Number.isFinite(normalizedSize) && normalizedSize > 0
              ? normalizedSize
              : (fundSize ?? 0),
          managementFee: (managementFeeRate ?? 0) / 100,
          carryPercentage: (carriedInterest ?? 0) / 100,
          vintageYear: vintageYear ?? new Date().getFullYear(),
          ...(establishmentDate ? { establishmentDate } : {}),
          deployedCapital: 0,
          status: typeof fund['status'] === 'string' ? fund['status'] : 'draft',
          createdAt: typeof fund['createdAt'] === 'string' ? fund['createdAt'] : now,
          updatedAt: typeof fund['updatedAt'] === 'string' ? fund['updatedAt'] : now,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create fund draft identity';
        setBootstrapError(message);
        setBootstrapStage('idle');
        return;
      }
    }

    if (activeDraftFundId != null && canBootstrapDraft && !draftServerReady) {
      setBootstrapStage('saving');

      try {
        const draftPayload = fundStoreToDraftWriteV1(fundStore.getState());
        await saveFundDraft(activeDraftFundId, draftPayload);
        setDraftServerReady(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to save authoritative draft';
        setBootstrapError(message);
        setBootstrapStage('idle');
        return;
      }
    }

    setBootstrapStage('idle');
    navigate('/fund-setup?step=2');
  };

  return (
    <ModernStepContainer
      title="Fund Basics"
      description="Fund identity, capital, and economics structure"
    >
      <div className="space-y-8">
        {/* Fund Structure Section */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="fund-name" className="text-sm font-poppins font-medium text-[#292929]">
              Fund Name *
            </Label>
            <Input
              id="fund-name"
              value={fundName || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleInputChange('fundName', e.target.value)
              }
              placeholder="Enter your fund name"
              data-testid="fund-name"
              className="h-12 text-base font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
            />
          </div>

          <NumericInput
            label="Capital Committed ($M) *"
            value={fundSize}
            onChange={(value: number | undefined) => handleInputChange('fundSize', value)}
            mode="number"
            min={0}
            step={0.1}
            help="Total capital committed by LPs"
            required
          />

          <div className="flex items-center space-x-3 pt-6 border-t border-[#E0D8D1]">
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
        <WizardCard title="Economics" description="Management fee and carry structure">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput
              label="Management Fee"
              value={managementFeeRate}
              onChange={(value: number | undefined) =>
                handleInputChange('managementFeeRate', value)
              }
              mode="percentage"
              min={0}
              max={5}
              step={0.1}
              help="Annual management fee (typically 2%)"
            />

            <NumericInput
              label="Carried Interest"
              value={carriedInterest}
              onChange={(value: number | undefined) => handleInputChange('carriedInterest', value)}
              mode="percentage"
              min={0}
              max={50}
              step={1}
              help="GP performance fee (typically 20%)"
            />
          </div>
        </WizardCard>

        {/* Navigation */}
        <div className="space-y-3 pt-8 border-t border-[#E0D8D1] mt-8">
          {bootstrapError && (
            <p role="alert" className="text-sm font-poppins text-red-600">
              {bootstrapError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              data-testid="next-step"
              onClick={() => {
                void handleNext();
              }}
              disabled={isBootstrapping}
              className="flex items-center gap-2 bg-[#292929] hover:bg-[#292929]/90 text-white px-8 py-3 h-auto font-poppins font-medium transition-all duration-200"
            >
              {bootstrapStage === 'creating'
                ? 'Creating Draft...'
                : bootstrapStage === 'saving'
                  ? 'Saving Draft...'
                  : 'Next Step'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </ModernStepContainer>
  );
}
