import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertCircle, ArrowLeft, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFundTuple, useFundAction } from '@/stores/useFundSelector';
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
  const [activeTab, setActiveTab] = useState("waterfall");

  // State
  const [
    waterfallType,
    waterfallTiers,
    recyclingEnabled,
    recyclingType,
    recyclingCap,
    recyclingPeriod,
    exitRecyclingRate,
    mgmtFeeRecyclingRate,
    allowFutureRecycling,
    fundSize,
    feeProfiles,
    fundExpenses,
    isEvergreen
  ] = useFundTuple(s => [
    s.waterfallType || 'american',
    s.waterfallTiers || [],
    s.recyclingEnabled || false,
    s.recyclingType || 'exits',
    s.recyclingCap,
    s.recyclingPeriod,
    s.exitRecyclingRate || 100,
    s.mgmtFeeRecyclingRate || 0,
    s.allowFutureRecycling || false,
    s.fundSize || 50000000,
    s.feeProfiles || [],
    s.fundExpenses || [],
    s.isEvergreen || false
  ]);

  // Actions
  const updateDistributions = useFundAction(s => s.updateDistributions);
  const addWaterfallTier = useFundAction(s => s.addWaterfallTier);
  const updateWaterfallTier = useFundAction(s => s.updateWaterfallTier);
  const removeWaterfallTier = useFundAction(s => s.removeWaterfallTier);
  
  // Fee Profile actions
  const addFeeProfile = useFundAction(s => s.addFeeProfile);
  const updateFeeProfile = useFundAction(s => s.updateFeeProfile);
  const removeFeeProfile = useFundAction(s => s.removeFeeProfile);
  const addFeeTier = useFundAction(s => s.addFeeTier);
  const updateFeeTier = useFundAction(s => s.updateFeeTier);
  const removeFeeTier = useFundAction(s => s.removeFeeTier);
  
  // Fund Expense actions
  const addFundExpense = useFundAction(s => s.addFundExpense);
  const updateFundExpense = useFundAction(s => s.updateFundExpense);
  const removeFundExpense = useFundAction(s => s.removeFundExpense);

  const handleAddTier = () => {
    const newTier: WaterfallTier = {
      id: `tier-${Date.now()}`,
      name: `Tier ${waterfallTiers.length + 1}`,
      gpSplit: 20,
      lpSplit: 80,
      condition: 'none'
    };
    addWaterfallTier(newTier);
  };

  const handleRecyclingToggle = (enabled: boolean) => {
    updateDistributions({ 
      recyclingEnabled: enabled,
      // Reset recycling values when disabled
      exitRecyclingRate: enabled ? exitRecyclingRate : 0,
      mgmtFeeRecyclingRate: enabled ? mgmtFeeRecyclingRate : 0
    });
  };

  // Fee and Expense helper functions
  const handleAddFeeProfile = () => {
    const newProfile: FeeProfile = {
      id: `profile-${Date.now()}`,
      name: `Fee Profile ${feeProfiles.length + 1}`,
      feeTiers: []
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
      endMonth: 120
    };
    addFeeTier(profileId, newTier);
  };

  const handleAddExpense = () => {
    const newExpense: FundExpense = {
      id: `expense-${Date.now()}`,
      category: 'Operating Expense',
      monthlyAmount: 10000,
      startMonth: 1,
      endMonth: 120
    };
    addFundExpense(newExpense);
  };

  // Fee basis options with descriptions
  const feeBasisOptions: { value: FeeBasis; label: string; description: string }[] = [
    {
      value: 'committed_capital',
      label: 'Committed Capital',
      description: 'Fee charged on total committed capital by LPs'
    },
    {
      value: 'called_capital_period',
      label: 'Called Capital Each Period',
      description: 'Fee charged on called capital in that period'
    },
    {
      value: 'gross_cumulative_called',
      label: 'Gross Cumulative Called Capital',
      description: 'Fee charged on cumulative called capital to date'
    },
    {
      value: 'net_cumulative_called',
      label: 'Net Cumulative Called Capital',
      description: 'Fee charged on cumulative called capital less capital returned to LPs'
    },
    {
      value: 'cumulative_invested',
      label: 'Cumulative Invested Capital',
      description: 'Fee charged on cumulative invested capital (initial + follow-on) to date'
    },
    {
      value: 'fair_market_value',
      label: 'Fair Market Value',
      description: 'Fee charged on fair market value of active investments each period'
    },
    {
      value: 'unrealized_investments',
      label: 'Unrealized Investments',
      description: 'Fee charged on total cost basis of unrealized active investments'
    }
  ];

  // Validation
  const totalRecyclingRate = exitRecyclingRate + mgmtFeeRecyclingRate;
  const recyclingExceeds100 = totalRecyclingRate > 100;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Distributions & Carry</h2>
        <p className="text-gray-600 mt-2">Configure waterfall structure and recycling provisions</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="waterfall">Waterfall Structure</TabsTrigger>
          <TabsTrigger value="fees">Fees & Expenses</TabsTrigger>
          <TabsTrigger value="recycling">Recycling Provisions</TabsTrigger>
        </TabsList>

        <TabsContent value="waterfall" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribution Waterfall</CardTitle>
              <CardDescription>
                Define how distributions flow between LPs and GP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  American waterfall calculates carry on each individual deal. 
                  Consider clawback provisions to protect LPs.
                </AlertDescription>
              </Alert>

              <div className="space-y-4 pt-4">
                <h4 className="font-medium">Waterfall Tiers</h4>
                {waterfallTiers.map((tier: any, index: any) => (
                  <div key={tier.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{tier.name}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWaterfallTier(tier.id)}
                        className="text-red-500 hover:text-red-700"
                        disabled={waterfallTiers.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tier Name</Label>
                        <Input
                          value={tier.name}
                          onChange={(e: any) => updateWaterfallTier(tier.id, { name: e.target.value })}
                          placeholder="e.g., Preferred Return"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Condition</Label>
                        <Select
                          value={tier.condition || 'none'}
                          onValueChange={(value: any) => 
                            updateWaterfallTier(tier.id, { condition: value as WaterfallTier['condition'] })
                          }
                        >
                          <SelectTrigger>
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
                      <div className="space-y-2">
                        <Label>
                          {tier.condition === 'irr' ? 'IRR Hurdle (%)' : 'MOIC Hurdle'}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step={tier.condition === 'irr' ? "0.1" : "0.01"}
                          value={tier.conditionValue || ''}
                          onChange={(e: any) => updateWaterfallTier(tier.id, { 
                            conditionValue: parseFloat(e.target.value) || undefined 
                          })}
                          placeholder={tier.condition === 'irr' ? "e.g., 8.0" : "e.g., 1.5"}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>LP Split (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={tier.lpSplit}
                          onChange={(e: any) => {
                            const lpSplit = parseFloat(e.target.value) || 0;
                            updateWaterfallTier(tier.id, { 
                              lpSplit,
                              gpSplit: 100 - lpSplit
                            });
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>GP Split (%)</Label>
                        <div className="p-2 bg-gray-50 rounded h-10 flex items-center">
                          <span className="text-gray-700">
                            {tier.gpSplit}%
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}

                <Button onClick={handleAddTier} variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Waterfall Tier
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="space-y-4">
          {/* Management Fees Section */}
          <Card>
            <CardHeader>
              <CardTitle>Management Fees</CardTitle>
              <CardDescription>
                Configure fee structures with different basis methods and step-downs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {feeProfiles.map((profile: any) => (
                <div key={profile.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Label>Fee Profile Name</Label>
                      <Input
                        value={profile.name}
                        onChange={(e: any) => updateFeeProfile(profile.id, { name: e.target.value })}
                        placeholder="e.g., Default Fee Profile"
                        className="max-w-md"
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
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Fee Tiers */}
                  <div className="space-y-4">
                    {profile.feeTiers.map((tier: any, index: any) => (
                      <div key={tier.id} className="border-l-4 border-blue-200 pl-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Fee Tier {index + 1}</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFeeTier(profile.id, tier.id)}
                            className="text-red-500 hover:text-red-700"
                            disabled={profile.feeTiers.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Fee Name</Label>
                            <Input
                              value={tier.name}
                              onChange={(e: any) => updateFeeTier(profile.id, tier.id, { name: e.target.value })}
                              placeholder="e.g., Management Fee"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Fee Percentage (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              value={tier.percentage}
                              onChange={(e: any) => updateFeeTier(profile.id, tier.id, { 
                                percentage: parseFloat(e.target.value) || 0 
                              })}
                              placeholder="2.0"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Fee Basis</Label>
                            <Select
                              value={tier.feeBasis}
                              onValueChange={(value: any) => updateFeeTier(profile.id, tier.id, { 
                                feeBasis: value as FeeBasis 
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {feeBasisOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              {feeBasisOptions.find(opt => opt.value === tier.feeBasis)?.description}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>Start Month</Label>
                            <Input
                              type="number"
                              min="1"
                              value={tier.startMonth}
                              onChange={(e: any) => updateFeeTier(profile.id, tier.id, { 
                                startMonth: parseInt(e.target.value) || 1 
                              })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>End Month (Optional)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={tier.endMonth || ''}
                              onChange={(e: any) => updateFeeTier(profile.id, tier.id, { 
                                endMonth: parseInt(e.target.value) || undefined 
                              })}
                              placeholder="120"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Management Fee Recycling (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={tier.recyclingPercentage || ''}
                              onChange={(e: any) => updateFeeTier(profile.id, tier.id, { 
                                recyclingPercentage: parseFloat(e.target.value) || undefined 
                              })}
                              placeholder="0"
                            />
                            <p className="text-xs text-gray-500">
                              % of fees that can be recycled from this tier
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <Button onClick={handleAddFeeProfile} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Fee Profile
              </Button>
            </CardContent>
          </Card>

          {/* Fund Expenses Section */}
          <Card>
            <CardHeader>
              <CardTitle>Fund Expenses</CardTitle>
              <CardDescription>
                Define line-item fund expenses with monthly amounts and terms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fundExpenses.map((expense: any) => (
                <div key={expense.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Expense: {expense.category}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFundExpense(expense.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Expense Category</Label>
                      <Input
                        value={expense.category}
                        onChange={(e: any) => updateFundExpense(expense.id, { category: e.target.value })}
                        placeholder="e.g., Legal Fees"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Monthly Amount ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={expense.monthlyAmount}
                        onChange={(e: any) => updateFundExpense(expense.id, { 
                          monthlyAmount: parseFloat(e.target.value) || 0 
                        })}
                        placeholder="10000"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Start Month</Label>
                      <Input
                        type="number"
                        min="1"
                        value={expense.startMonth}
                        onChange={(e: any) => updateFundExpense(expense.id, { 
                          startMonth: parseInt(e.target.value) || 1 
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>End Month (Optional)</Label>
                      <Input
                        type="number"
                        min="1"
                        value={expense.endMonth || ''}
                        onChange={(e: any) => updateFundExpense(expense.id, { 
                          endMonth: parseInt(e.target.value) || undefined 
                        })}
                        placeholder="120"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button onClick={handleAddExpense} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recycling" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recycling Provisions</CardTitle>
              <CardDescription>
                Configure exit proceeds recycling for new investments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="recycling-enabled" className="cursor-pointer font-medium">
                    Enable Exit Recycling
                  </Label>
                  <p className="text-sm text-gray-500">
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
                <>
                  <div className="space-y-2">
                    <Label htmlFor="recycling-type">Recycling Type</Label>
                    <Select
                      value={recyclingType}
                      onValueChange={(value: any) => updateDistributions({ recyclingType: value as 'exits' | 'fees' | 'both' })}
                    >
                      <SelectTrigger id="recycling-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exits">Exit Proceeds Recycling</SelectItem>
                        <SelectItem value="fees">Management Fee Recycling</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-500">
                      {recyclingType === 'exits' 
                        ? 'Fund can recycle exit proceeds up to a cap (% of committed capital)'
                        : 'Fund can recycle exit proceeds up to the level of management fees earned to date'
                      }
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exit-recycling">Exit Proceeds Recycling Rate (%)</Label>
                    <Input
                      id="exit-recycling"
                      type="number"
                      min="0"
                      max="100"
                      value={exitRecyclingRate}
                      onChange={(e: any) => updateDistributions({ 
                        exitRecyclingRate: parseFloat(e.target.value) || 0 
                      })}
                      data-testid="exit-recycling-rate"
                      placeholder="100"
                    />
                    <p className="text-sm text-gray-500">
                      Percentage of exit proceeds that can be recycled each period (typically 100%)
                    </p>
                  </div>

                  {recyclingType === 'exits' && (
                    <div className="space-y-2">
                      <Label htmlFor="recycling-cap-pct">Recycling Cap (% of Committed Capital)</Label>
                      <Input
                        id="recycling-cap-pct"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={recyclingCap ? (recyclingCap / fundSize) * 100 : ''}
                        onChange={(e: any) => {
                          const pct = parseFloat(e.target.value) || 0;
                          updateDistributions({ 
                            recyclingCap: (pct / 100) * fundSize
                          });
                        }}
                        placeholder="50"
                      />
                      <p className="text-sm text-gray-500">
                        Maximum amount that can be recycled as % of committed capital (e.g., 50% cap = half the committed capital)
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="recycling-period">Recycling Term (years)</Label>
                    <Input
                      id="recycling-period"
                      type="number"
                      min="0"
                      max="10"
                      value={recyclingPeriod || ''}
                      onChange={(e: any) => updateDistributions({ 
                        recyclingPeriod: parseFloat(e.target.value) || undefined 
                      })}
                      placeholder="3"
                    />
                    <p className="text-sm text-gray-500">
                      Timeframe over which the fund can recycle exit proceeds
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="allow-future-recycling"
                      checked={allowFutureRecycling || false}
                      onCheckedChange={(checked: any) => updateDistributions({ allowFutureRecycling: checked })}
                    />
                    <Label htmlFor="allow-future-recycling" className="cursor-pointer">
                      Allow fund to recycle future exit proceeds ahead of time
                    </Label>
                  </div>
                  <p className="text-sm text-gray-500">
                    If enabled, fund will aggressively invest in anticipation of future exits. If disabled, fund waits for exits before recycling.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-between mt-6">
        <Button 
          variant="outline"
          onClick={() => navigate('/fund-setup?step=3')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button 
          onClick={() => {
            // In a real app, this would save and navigate to dashboard
            alert('Fund setup complete! Redirecting to dashboard...');
            navigate('/dashboard');
          }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          <Check className="h-4 w-4" />
          Complete Setup
        </Button>
      </div>
    </div>
  );
}