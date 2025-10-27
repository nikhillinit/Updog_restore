/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Waterfall } from "@shared/types";
import { applyWaterfallChange } from "@/lib/waterfall";

interface WaterfallStepProps {
  data: Waterfall;
  onChange: (_data: Waterfall) => void;
}


export default function WaterfallStep({ data, onChange }: WaterfallStepProps) {
  // Type-safe field updates using waterfall helper
  const handleChange = (field: string, value: any) => {
    const updated = applyWaterfallChange(data, field, value);
    onChange(updated);
  };


  const handleCarryVestingChange = (field: 'cliffYears' | 'vestingYears', value: number) => {
    const updated = applyWaterfallChange(data, 'carryVesting', {
      ...data.carryVesting,
      [field]: value
    });
    onChange(updated);
  };

  const formatPercentage = (decimal: number) => {
    return (decimal * 100).toFixed(1);
  };

  const parsePercentage = (percentageString: string) => {
    return parseFloat(percentageString) / 100 || 0;
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 space-y-1 text-center">
        <h2 className="text-2xl font-bold text-charcoal">Waterfall Structure</h2>
        <p className="text-gray-600">Define the distribution waterfall and carry terms</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waterfall Type */}
        <Card>
          <CardHeader>
            <CardTitle>Waterfall Type</CardTitle>
            <CardDescription>
              American (deal-by-deal) waterfall structure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <div className="space-y-2">
                <p className="text-base font-medium">
                  American Waterfall
                </p>
                <p className="text-sm text-gray-600">
                  Deal-by-deal carry distribution. GPs receive carry on each individual exit
                  after returning invested capital for that specific investment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Carry Vesting */}
      <Card>
        <CardHeader>
          <CardTitle>Carry Vesting</CardTitle>
          <CardDescription>
            Define the vesting schedule for GP carry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Cliff Period</Label>
              <Select 
                value={data.carryVesting.cliffYears.toString()} 
                onValueChange={(value: any) => handleCarryVestingChange('cliffYears', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cliff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No cliff</SelectItem>
                  <SelectItem value="1">1 year</SelectItem>
                  <SelectItem value="2">2 years</SelectItem>
                  <SelectItem value="3">3 years</SelectItem>
                  <SelectItem value="4">4 years</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Period before any carry vests
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Vesting Period</Label>
              <Select 
                value={data.carryVesting.vestingYears.toString()} 
                onValueChange={(value: any) => handleCarryVestingChange('vestingYears', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vesting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 year</SelectItem>
                  <SelectItem value="2">2 years</SelectItem>
                  <SelectItem value="3">3 years</SelectItem>
                  <SelectItem value="4">4 years</SelectItem>
                  <SelectItem value="5">5 years</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Total period over which carry vests
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-charcoal mb-2">Vesting Summary</h4>
            <p className="text-sm text-gray-600">
              {data.carryVesting.cliffYears === 0 
                ? "Carry vests immediately over " 
                : `After a ${data.carryVesting.cliffYears}-year cliff, carry vests over `}
              {data.carryVesting.vestingYears} year{data.carryVesting.vestingYears > 1 ? 's' : ''}.
              {data.carryVesting.cliffYears > 0 && 
                ` No carry is earned in the first ${data.carryVesting.cliffYears} year${data.carryVesting.cliffYears > 1 ? 's' : ''}.`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
