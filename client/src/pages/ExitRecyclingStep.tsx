/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExitRecycling } from "@shared/types";

interface ExitRecyclingStepProps {
  data: ExitRecycling;
  onChange: (_data: ExitRecycling) => void;
}

export default function ExitRecyclingStep({ data, onChange }: ExitRecyclingStepProps) {
  const handleChange = (field: keyof ExitRecycling, value: any) => {
    onChange({
      ...data,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Exit Recycling</h2>
        <p className="text-gray-600 mt-2">Configure how exit proceeds will be recycled back into new investments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exit Recycling Settings</CardTitle>
          <CardDescription>
            Allow exit proceeds to be re-invested into new opportunities within the fund's investment period.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Enable Exit Recycling</Label>
              <p className="text-sm text-gray-600">
                Allow the fund to reinvest exit proceeds into new investments
              </p>
            </div>
            <Switch
              data-testid="step-4-recycling-enabled"
              checked={data.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
          </div>

          {data.enabled && (
            <div className="space-y-6 pt-4 border-t">
              {/* Recycle Percentage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-base font-medium">Recycle Percentage (%)</Label>
                  <div className="relative">
                    <Input
                      data-testid="step-4-recycle-percentage"
                      type="number"
                      min="0"
                      max="100"
                      value={data.recyclePercentage}
                      onChange={(e) => handleChange('recyclePercentage', parseFloat(e.target.value) || 0)}
                      className="pr-8"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Percentage of exit proceeds to recycle into new investments
                  </p>
                  {data.recyclePercentage === 0 && (
                    <p className="text-sm text-red-500">
                      Recycle percentage must be greater than 0% when recycling is enabled
                    </p>
                  )}
                </div>

                {/* Max Recycle Amount */}
                <div className="space-y-2">
                  <Label className="text-base font-medium">Maximum Recycle Amount (Optional)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input
                      type="number"
                      min="0"
                      value={data.maxRecycleAmount || ''}
                      onChange={(e) => handleChange('maxRecycleAmount', parseFloat(e.target.value) || undefined)}
                      className="pl-8"
                      placeholder="No limit"
                    />
                  </div>
                  <p className="text-sm text-gray-600">
                    Cap the total amount that can be recycled (leave empty for no limit)
                  </p>
                </div>
              </div>

              {/* Recycle Window */}
              <div className="space-y-2">
                <Label className="text-base font-medium">Recycling Window</Label>
                <Select 
                  value={data.recycleWindowMonths.toString()} 
                  onValueChange={(value) => handleChange('recycleWindowMonths', parseInt(value))}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Select window" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="18">18 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                    <SelectItem value="36">36 months</SelectItem>
                    <SelectItem value="48">48 months</SelectItem>
                    <SelectItem value="60">60 months</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600">
                  Time window during which exit proceeds can be recycled
                </p>
              </div>

              {/* Restrictions */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-charcoal">Investment Restrictions</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-base font-medium">Restrict to Same Sector</Label>
                      <p className="text-sm text-gray-600">
                        Only recycle into companies in the same sector as the exited investment
                      </p>
                    </div>
                    <Switch
                      checked={data.restrictToSameSector}
                      onCheckedChange={(checked) => handleChange('restrictToSameSector', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-base font-medium">Restrict to Same Stage</Label>
                      <p className="text-sm text-gray-600">
                        Only recycle into companies in the same investment stage as the exited investment
                      </p>
                    </div>
                    <Switch
                      checked={data.restrictToSameStage}
                      onCheckedChange={(checked) => handleChange('restrictToSameStage', checked)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {!data.enabled && (
            <div className="py-8 text-center text-gray-500">
              <p>Exit recycling is disabled. Exit proceeds will be distributed to LPs as normal.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
