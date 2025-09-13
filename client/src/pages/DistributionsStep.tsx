import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFundSelector, useFundTuple, useFundAction } from '@/stores/useFundSelector';

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
    s.isEvergreen || false
  ]);

  // Actions
  const updateDistributions = useFundAction(s => s.updateDistributions);
  const addWaterfallTier = useFundAction(s => s.addWaterfallTier);
  const updateWaterfallTier = useFundAction(s => s.updateWaterfallTier);
  const removeWaterfallTier = useFundAction(s => s.removeWaterfallTier);

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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="waterfall">Waterfall Structure</TabsTrigger>
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
              <div className="space-y-2">
                <Label htmlFor="waterfall-type">Waterfall Type</Label>
                <Select
                  value={waterfallType}
                  onValueChange={(value) => updateDistributions({ waterfallType: value as 'american' | 'european' | 'hybrid' })}
                >
                  <SelectTrigger id="waterfall-type" data-testid="waterfall-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="american">American (Deal-by-Deal)</SelectItem>
                    <SelectItem value="european">European (Whole Fund)</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {waterfallType === 'american' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    American waterfall calculates carry on each individual deal. 
                    Consider clawback provisions to protect LPs.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4 pt-4">
                <h4 className="font-medium">Waterfall Tiers</h4>
                {waterfallTiers.map((tier, index) => (
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
                          onChange={(e) => updateWaterfallTier(tier.id, { name: e.target.value })}
                          placeholder="e.g., Preferred Return"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Condition</Label>
                        <Select
                          value={tier.condition || 'none'}
                          onValueChange={(value) => 
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
                          onChange={(e) => updateWaterfallTier(tier.id, { 
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
                          onChange={(e) => {
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

                    {index === 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Preferred Return (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="20"
                            step="0.1"
                            value={tier.preferredReturn || ''}
                            onChange={(e) => updateWaterfallTier(tier.id, { 
                              preferredReturn: parseFloat(e.target.value) || undefined 
                            })}
                            placeholder="e.g., 8.0"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>GP Catch-up (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={tier.catchUp || ''}
                            onChange={(e) => updateWaterfallTier(tier.id, { 
                              catchUp: parseFloat(e.target.value) || undefined 
                            })}
                            placeholder="e.g., 100"
                          />
                        </div>
                      </div>
                    )}
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

        <TabsContent value="recycling" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recycling Provisions</CardTitle>
              <CardDescription>
                Configure how exit proceeds and fees can be recycled
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="recycling-enabled"
                  checked={recyclingEnabled}
                  onCheckedChange={handleRecyclingToggle}
                  data-testid="recycling-toggle"
                />
                <Label htmlFor="recycling-enabled" className="cursor-pointer">
                  Enable Recycling Provisions
                </Label>
              </div>

              {recyclingEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="recycling-type">Recycling Type</Label>
                    <Select
                      value={recyclingType}
                      onValueChange={(value) => updateDistributions({ recyclingType: value as 'exits' | 'fees' | 'both' })}
                    >
                      <SelectTrigger id="recycling-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exits">Exit Proceeds Only</SelectItem>
                        <SelectItem value="fees">Management Fees Only</SelectItem>
                        <SelectItem value="both">Both Exits and Fees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(recyclingType === 'exits' || recyclingType === 'both') && (
                    <div className="space-y-2">
                      <Label htmlFor="exit-recycling">Exit Recycling Rate (%)</Label>
                      <Input
                        id="exit-recycling"
                        type="number"
                        min="0"
                        max="100"
                        value={exitRecyclingRate}
                        onChange={(e) => updateDistributions({ 
                          exitRecyclingRate: parseFloat(e.target.value) || 0 
                        })}
                        data-testid="exit-recycling-rate"
                      />
                      <p className="text-sm text-gray-500">
                        Percentage of exit proceeds that can be recycled for new investments
                      </p>
                    </div>
                  )}

                  {(recyclingType === 'fees' || recyclingType === 'both') && (
                    <div className="space-y-2">
                      <Label htmlFor="fee-recycling">Management Fee Recycling Rate (%)</Label>
                      <Input
                        id="fee-recycling"
                        type="number"
                        min="0"
                        max="100"
                        value={mgmtFeeRecyclingRate}
                        onChange={(e) => updateDistributions({ 
                          mgmtFeeRecyclingRate: parseFloat(e.target.value) || 0 
                        })}
                        data-testid="fee-recycling-rate"
                      />
                      <p className="text-sm text-gray-500">
                        Percentage of management fees that can be offset through recycling
                      </p>
                    </div>
                  )}

                  {recyclingExceeds100 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Total recycling rate ({totalRecyclingRate}%) exceeds 100%. 
                        Please adjust the rates.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="recycling-cap">Recycling Cap ($M)</Label>
                      <Input
                        id="recycling-cap"
                        type="number"
                        min="0"
                        step="0.1"
                        value={(recyclingCap || 0) / 1000000}
                        onChange={(e) => updateDistributions({ 
                          recyclingCap: parseFloat(e.target.value) * 1000000 || undefined 
                        })}
                        placeholder="Optional"
                      />
                      <p className="text-sm text-gray-500">
                        Maximum amount that can be recycled (optional)
                      </p>
                    </div>

                    {!isEvergreen && (
                      <div className="space-y-2">
                        <Label htmlFor="recycling-period">Recycling Period (years)</Label>
                        <Input
                          id="recycling-period"
                          type="number"
                          min="0"
                          max="10"
                          value={recyclingPeriod || ''}
                          onChange={(e) => updateDistributions({ 
                            recyclingPeriod: parseFloat(e.target.value) || undefined 
                          })}
                          placeholder="e.g., 3"
                        />
                        <p className="text-sm text-gray-500">
                          Period during which recycling is allowed
                        </p>
                      </div>
                    )}
                  </div>

                  {isEvergreen && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Evergreen fund structure allows continuous recycling without time limits.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}