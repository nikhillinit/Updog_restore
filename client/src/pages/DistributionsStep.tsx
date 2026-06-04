import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import { useFundTuple, useFundAction } from '@/stores/useFundSelector';
import { useFundContext } from '@/contexts/FundContext';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';
import type { FeeProfile, FeeTier, FundExpense, FeeBasis } from '@/stores/fundStore';

interface WaterfallTier {
  id: string;
  name: string;
  preferredReturn?: number;
  catchUp?: number;
  gpSplit: number;
  lpSplit: number;
  condition?: 'irr' | 'moic' | 'none';
  conditionValue?: number;
}

export default function DistributionsStep() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState('waterfall');

  // Get fund size from context
  const { currentFund } = useFundContext();
  const fundSize = currentFund?.size || 50000000;

  // State
  const [
    waterfallTiers,
    recyclingEnabled,
    recyclingType,
    recyclingCap,
    recyclingPeriod,
    exitRecyclingRate,
    mgmtFeeRecyclingRate,
    allowFutureRecycling,
    feeProfiles,
    fundExpenses,
  ] = useFundTuple((s) => [
    s.waterfallTiers || [],
    s.recyclingEnabled || false,
    s.recyclingType || 'exits',
    s.recyclingCap,
    s.recyclingPeriod,
    s.exitRecyclingRate || 100,
    s.mgmtFeeRecyclingRate || 0,
    s.allowFutureRecycling || false,
    s.feeProfiles || [],
    s.fundExpenses || [],
  ]);

  // Actions
  const updateDistributions = useFundAction((s) => s.updateDistributions);
  const addWaterfallTier = useFundAction((s) => s.addWaterfallTier);
  const updateWaterfallTier = useFundAction((s) => s.updateWaterfallTier);
  const removeWaterfallTier = useFundAction((s) => s.removeWaterfallTier);

  // Fee Profile actions
  const addFeeProfile = useFundAction((s) => s.addFeeProfile);
  const updateFeeProfile = useFundAction((s) => s.updateFeeProfile);
  const removeFeeProfile = useFundAction((s) => s.removeFeeProfile);
  const addFeeTier = useFundAction((s) => s.addFeeTier);
  const updateFeeTier = useFundAction((s) => s.updateFeeTier);
  const removeFeeTier = useFundAction((s) => s.removeFeeTier);

  // Fund Expense actions
  const addFundExpense = useFundAction((s) => s.addFundExpense);
  const updateFundExpense = useFundAction((s) => s.updateFundExpense);
  const removeFundExpense = useFundAction((s) => s.removeFundExpense);

  const handleAddTier = () => {
    const newTier: WaterfallTier = {
      id: `tier-${Date.now()}`,
      name: `Tier ${waterfallTiers.length + 1}`,
      gpSplit: 20,
      lpSplit: 80,
      condition: 'none',
    };
    addWaterfallTier(newTier);
  };

  const handleRecyclingToggle = (enabled: boolean) => {
    updateDistributions({
      recyclingEnabled: enabled,
      // Reset recycling values when disabled
      exitRecyclingRate: enabled ? exitRecyclingRate : 0,
      mgmtFeeRecyclingRate: enabled ? mgmtFeeRecyclingRate : 0,
    });
  };

  // Fee and Expense helper functions
  const handleAddFeeProfile = () => {
    const newProfile: FeeProfile = {
      id: `profile-${Date.now()}`,
      name: `Fee Profile ${feeProfiles.length + 1}`,
      feeTiers: [],
    };
    addFeeProfile(newProfile);
  };

  const handleAddFeeTier = (profileId: string) => {
    const newTier: FeeTier = {
      id: `tier-${Date.now()}`,
      name: 'Management Fee',
      percentage: 2.0,
      feeBasis: 'committed_capital',
      startMonth: 1,
      endMonth: 120,
    };
    addFeeTier(profileId, newTier);
  };

  const handleAddExpense = () => {
    const newExpense: FundExpense = {
      id: `expense-${Date.now()}`,
      category: 'Operating Expense',
      monthlyAmount: 10000,
      startMonth: 1,
      endMonth: 120,
    };
    addFundExpense(newExpense);
  };

  // Fee basis options with descriptions
  const feeBasisOptions: { value: FeeBasis; label: string; description: string }[] = [
    {
      value: 'committed_capital',
      label: 'Committed Capital',
      description: 'Fee charged on total committed capital by LPs',
    },
    {
      value: 'called_capital_period',
      label: 'Called Capital Each Period',
      description: 'Fee charged on called capital in that period',
    },
    {
      value: 'gross_cumulative_called',
      label: 'Gross Cumulative Called Capital',
      description: 'Fee charged on cumulative called capital to date',
    },
    {
      value: 'net_cumulative_called',
      label: 'Net Cumulative Called Capital',
      description: 'Fee charged on cumulative called capital less capital returned to LPs',
    },
    {
      value: 'cumulative_invested',
      label: 'Cumulative Invested Capital',
      description: 'Fee charged on cumulative invested capital (initial + follow-on) to date',
    },
    {
      value: 'fair_market_value',
      label: 'Fair Market Value',
      description: 'Fee charged on fair market value of active investments each period',
    },
    {
      value: 'unrealized_investments',
      label: 'Unrealized Investments',
      description: 'Fee charged on total cost basis of unrealized active investments',
    },
  ];

  return (
    <ModernStepContainer
      title="Distributions, Waterfall, Fees & Recycling"
      description="Configure waterfall structure, fees, expenses, and proceeds recycling"
    >
      <div className="space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto pb-1">
            <TabsList className="inline-grid min-w-max grid-cols-3">
              <TabsTrigger value="waterfall">Waterfall Structure</TabsTrigger>
              <TabsTrigger value="fees">Fees & Expenses</TabsTrigger>
              <TabsTrigger value="recycling">Recycling Provisions</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="waterfall" className="space-y-6">
            <div className="space-y-6">
              <div className="pb-4 border-b border-beige-200">
                <h3 className="text-lg font-inter font-bold text-pov-charcoal mb-2">
                  Distribution Waterfall
                </h3>
                <p className="text-pov-charcoal/70 font-poppins">
                  Define how distributions flow between LPs and GP
                </p>
              </div>

              <Alert>
                <AlertCircle aria-hidden="true" className="h-4 w-4" />
                <AlertDescription>
                  American waterfall calculates carry on each individual deal. Consider clawback
                  provisions to protect LPs.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <h4 className="font-inter font-bold text-pov-charcoal">Waterfall Tiers</h4>
                <div className="space-y-4">
                  {waterfallTiers.map((tier: WaterfallTier) => (
                    <div key={tier.id} className="border border-beige-200 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{tier.name}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeWaterfallTier(tier.id)}
                          className="text-error hover:text-error-dark"
                          disabled={waterfallTiers.length === 1}
                          aria-label={`Remove ${tier.name} waterfall tier`}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            Tier Name
                          </Label>
                          <Input
                            value={tier.name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateWaterfallTier(tier.id, { name: e.target.value })
                            }
                            placeholder="e.g., Preferred Return"
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            Condition
                          </Label>
                          <Select
                            value={tier.condition || 'none'}
                            onValueChange={(value: string) =>
                              updateWaterfallTier(tier.id, {
                                ...spreadIfDefined(
                                  'condition',
                                  value as WaterfallTier['condition']
                                ),
                              })
                            }
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Condition</SelectItem>
                              <SelectItem value="irr">IRR Hurdle</SelectItem>
                              <SelectItem value="moic">MOIC Hurdle</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {tier.condition && tier.condition !== 'none' && (
                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            {tier.condition === 'irr' ? 'IRR Hurdle (%)' : 'MOIC Hurdle'}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step={tier.condition === 'irr' ? '0.1' : '0.01'}
                            value={tier.conditionValue || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateWaterfallTier(tier.id, {
                                ...(parseFloat(e.target.value)
                                  ? { conditionValue: parseFloat(e.target.value) }
                                  : {}),
                              })
                            }
                            placeholder={tier.condition === 'irr' ? 'e.g., 8.0' : 'e.g., 1.5'}
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            LP Split (%)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={tier.lpSplit}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const lpSplit = parseFloat(e.target.value) || 0;
                              updateWaterfallTier(tier.id, {
                                lpSplit,
                                gpSplit: 100 - lpSplit,
                              });
                            }}
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            GP Split (%)
                          </Label>
                          <div
                            className="p-3 bg-pov-gray rounded-xl h-12 flex items-center"
                            role="status"
                            aria-label={`GP Split is calculated as ${tier.gpSplit}% from LP Split`}
                          >
                            <span className="text-pov-charcoal font-poppins">{tier.gpSplit}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    onClick={handleAddTier}
                    variant="outline"
                    className="w-full h-12 border-beige-200 hover:bg-beige/20 hover:border-pov-charcoal font-poppins font-medium"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Waterfall Tier
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fees" className="space-y-6">
            {/* Management Fees Section */}
            <div className="space-y-6">
              <div className="pb-4 border-b border-beige-200">
                <h3 className="text-lg font-inter font-bold text-pov-charcoal mb-2">
                  Management Fees
                </h3>
                <p className="text-pov-charcoal/70 font-poppins">
                  Configure fee structures with different basis methods and step-downs
                </p>
              </div>

              <div className="space-y-6">
                {feeProfiles.map((profile: FeeProfile) => (
                  <div
                    key={profile.id}
                    className="border border-beige-200 rounded-xl p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-3 flex-1">
                        <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                          Fee Profile Name
                        </Label>
                        <Input
                          value={profile.name}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateFeeProfile(profile.id, { name: e.target.value })
                          }
                          placeholder="e.g., Default Fee Profile"
                          className="max-w-md h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddFeeTier(profile.id)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Fee Tier
                        </Button>
                        {feeProfiles.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFeeProfile(profile.id)}
                            className="text-error hover:text-error-dark"
                            aria-label={`Remove ${profile.name} fee profile`}
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Fee Tiers */}
                    <div className="space-y-4">
                      {profile.feeTiers.map((tier: FeeTier, index: number) => (
                        <div key={tier.id} className="border-l-4 border-beige-200 pl-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">Fee Tier {index + 1}</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFeeTier(profile.id, tier.id)}
                              className="text-error hover:text-error-dark"
                              disabled={profile.feeTiers.length === 1}
                              aria-label={`Remove ${tier.name} fee tier`}
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                Fee Name
                              </Label>
                              <Input
                                value={tier.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateFeeTier(profile.id, tier.id, { name: e.target.value })
                                }
                                placeholder="e.g., Management Fee"
                                className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                              />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                Fee Percentage (%)
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                max="10"
                                step="0.1"
                                value={tier.percentage}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateFeeTier(profile.id, tier.id, {
                                    percentage: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="2.0"
                                className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                              />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                Fee Basis
                              </Label>
                              <Select
                                value={tier.feeBasis}
                                onValueChange={(value: string) =>
                                  updateFeeTier(profile.id, tier.id, {
                                    feeBasis: value as FeeBasis,
                                  })
                                }
                              >
                                <SelectTrigger className="h-12">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {feeBasisOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-pov-charcoal/60 font-poppins">
                                {
                                  feeBasisOptions.find((opt) => opt.value === tier.feeBasis)
                                    ?.description
                                }
                              </p>
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                Start Month
                              </Label>
                              <Input
                                type="number"
                                min="1"
                                value={tier.startMonth}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateFeeTier(profile.id, tier.id, {
                                    startMonth: parseInt(e.target.value) || 1,
                                  })
                                }
                                className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                              />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                End Month (Optional)
                              </Label>
                              <Input
                                type="number"
                                min="1"
                                value={tier.endMonth || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateFeeTier(profile.id, tier.id, {
                                    ...(parseInt(e.target.value)
                                      ? { endMonth: parseInt(e.target.value) }
                                      : {}),
                                  })
                                }
                                placeholder="120"
                                className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                              />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                                Management Fee Recycling (%)
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={tier.recyclingPercentage || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateFeeTier(profile.id, tier.id, {
                                    ...(parseFloat(e.target.value)
                                      ? { recyclingPercentage: parseFloat(e.target.value) }
                                      : {}),
                                  })
                                }
                                placeholder="0"
                                className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                              />
                              <p className="text-xs text-pov-charcoal/60 font-poppins">
                                % of fees that can be recycled from this tier
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <Button
                  onClick={handleAddFeeProfile}
                  variant="outline"
                  className="w-full h-12 border-beige-200 hover:bg-beige/20 hover:border-pov-charcoal font-poppins font-medium"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fee Profile
                </Button>
              </div>

              {/* Fund Expenses Section */}
              <div className="space-y-6 border-t border-beige-200 pt-8">
                <div className="pb-4 border-b border-beige-200">
                  <h3 className="text-lg font-inter font-bold text-pov-charcoal mb-2">
                    Fund Expenses
                  </h3>
                  <p className="text-pov-charcoal/70 font-poppins">
                    Define line-item fund expenses with monthly amounts and terms
                  </p>
                </div>

                <div className="space-y-4">
                  {fundExpenses.map((expense: FundExpense) => (
                    <div
                      key={expense.id}
                      className="border border-beige-200 rounded-xl p-4 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Expense: {expense.category}</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFundExpense(expense.id)}
                          className="text-error hover:text-error-dark"
                          aria-label={`Remove ${expense.category} expense`}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            Expense Category
                          </Label>
                          <Input
                            value={expense.category}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateFundExpense(expense.id, { category: e.target.value })
                            }
                            placeholder="e.g., Legal Fees"
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            Monthly Amount ($)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={expense.monthlyAmount}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateFundExpense(expense.id, {
                                monthlyAmount: parseFloat(e.target.value) || 0,
                              })
                            }
                            placeholder="10000"
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            Start Month
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={expense.startMonth}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateFundExpense(expense.id, {
                                startMonth: parseInt(e.target.value) || 1,
                              })
                            }
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-pov-charcoal">
                            End Month (Optional)
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={expense.endMonth || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateFundExpense(expense.id, {
                                ...(parseInt(e.target.value)
                                  ? { endMonth: parseInt(e.target.value) }
                                  : {}),
                              })
                            }
                            placeholder="120"
                            className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    onClick={handleAddExpense}
                    variant="outline"
                    className="w-full h-12 border-beige-200 hover:bg-beige/20 hover:border-pov-charcoal font-poppins font-medium"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expense
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recycling" className="space-y-6">
            <div className="space-y-6">
              <div className="pb-4 border-b border-beige-200">
                <h3 className="text-lg font-inter font-bold text-pov-charcoal mb-2">
                  Recycling Provisions
                </h3>
                <p className="text-pov-charcoal/70 font-poppins">
                  Configure exit proceeds recycling for new investments
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 border border-beige-200 rounded-xl">
                  <div className="space-y-1">
                    <Label
                      htmlFor="recycling-enabled"
                      className="cursor-pointer font-poppins font-medium text-pov-charcoal"
                    >
                      Enable Exit Recycling
                    </Label>
                    <p className="text-sm text-pov-charcoal/60 font-poppins">
                      Allow exit proceeds to be recycled for new investments
                    </p>
                  </div>
                  <Switch
                    id="recycling-enabled"
                    checked={recyclingEnabled}
                    onCheckedChange={handleRecyclingToggle}
                    data-testid="recycling-toggle"
                  />
                </div>

                {recyclingEnabled && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label
                        htmlFor="recycling-type"
                        className="text-sm font-poppins font-medium text-pov-charcoal"
                      >
                        Recycling Type
                      </Label>
                      <Select
                        value={recyclingType}
                        onValueChange={(value: string) =>
                          updateDistributions({ recyclingType: value as 'exits' | 'fees' | 'both' })
                        }
                      >
                        <SelectTrigger id="recycling-type" className="h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exits">Exit Proceeds Recycling</SelectItem>
                          <SelectItem value="fees">Management Fee Recycling</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-pov-charcoal/60 font-poppins">
                        {recyclingType === 'exits'
                          ? 'Fund can recycle exit proceeds up to a cap (% of committed capital)'
                          : 'Fund can recycle exit proceeds up to the level of management fees earned to date'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label
                        htmlFor="exit-recycling"
                        className="text-sm font-poppins font-medium text-pov-charcoal"
                      >
                        Exit Proceeds Recycling Rate (%)
                      </Label>
                      <Input
                        id="exit-recycling"
                        type="number"
                        min="0"
                        max="100"
                        value={exitRecyclingRate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateDistributions({
                            exitRecyclingRate: parseFloat(e.target.value) || 0,
                          })
                        }
                        data-testid="exit-recycling-rate"
                        placeholder="100"
                        className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                      />
                      <p className="text-sm text-pov-charcoal/60 font-poppins">
                        Percentage of exit proceeds that can be recycled each period (typically
                        100%)
                      </p>
                    </div>

                    {recyclingType === 'exits' && (
                      <div className="space-y-3">
                        <Label
                          htmlFor="recycling-cap-pct"
                          className="text-sm font-poppins font-medium text-pov-charcoal"
                        >
                          Recycling Cap (% of Committed Capital)
                        </Label>
                        <Input
                          id="recycling-cap-pct"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={recyclingCap ? (recyclingCap / fundSize) * 100 : ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const pct = parseFloat(e.target.value) || 0;
                            updateDistributions({
                              recyclingCap: (pct / 100) * fundSize,
                            });
                          }}
                          placeholder="50"
                          className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                        />
                        <p className="text-sm text-pov-charcoal/60 font-poppins">
                          Maximum amount that can be recycled as % of committed capital (e.g., 50%
                          cap = half the committed capital)
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <Label
                        htmlFor="recycling-period"
                        className="text-sm font-poppins font-medium text-pov-charcoal"
                      >
                        Recycling Term (years)
                      </Label>
                      <Input
                        id="recycling-period"
                        type="number"
                        min="0"
                        max="10"
                        value={recyclingPeriod || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateDistributions({
                            ...(parseFloat(e.target.value)
                              ? { recyclingPeriod: parseFloat(e.target.value) }
                              : {}),
                          })
                        }
                        placeholder="3"
                        className="h-12 border-beige-200 focus:border-pov-charcoal focus:ring-charcoal/40 font-poppins"
                      />
                      <p className="text-sm text-pov-charcoal/60 font-poppins">
                        Timeframe over which the fund can recycle exit proceeds
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 p-4 border border-beige-200 rounded-xl">
                      <Switch
                        id="allow-future-recycling"
                        checked={allowFutureRecycling || false}
                        onCheckedChange={(checked: boolean) =>
                          updateDistributions({ allowFutureRecycling: checked })
                        }
                        aria-label="Allow future exit proceeds recycling"
                      />
                      <div>
                        <Label
                          htmlFor="allow-future-recycling"
                          className="cursor-pointer text-sm font-poppins font-medium text-pov-charcoal"
                        >
                          Allow fund to recycle future exit proceeds ahead of time
                        </Label>
                        <p className="text-sm text-pov-charcoal/60 font-poppins mt-1">
                          If enabled, fund will aggressively invest in anticipation of future exits.
                          If disabled, fund waits for exits before recycling.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-beige-200 mt-8">
          <Button
            data-testid="previous-step"
            variant="outline"
            onClick={() => navigate('/fund-setup?step=4')}
            className="flex items-center gap-2 px-8 py-3 h-auto border-beige-200 hover:bg-beige/20 hover:border-pov-charcoal font-poppins font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            data-testid="next-step"
            onClick={() => navigate('/fund-setup?step=6')}
            className="flex items-center gap-2 bg-pov-charcoal hover:bg-charcoal-700 text-pov-white px-8 py-3 h-auto font-poppins font-medium"
          >
            Next: Cashflow & Liquidity
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}
