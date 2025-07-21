import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Waterfall } from "@shared/types";

interface WaterfallStepProps {
  data: Waterfall;
  onChange: (data: Waterfall) => void;
}

export default function WaterfallStep({ data, onChange }: WaterfallStepProps) {
  const handleChange = (field: keyof Waterfall, value: any) => {
    onChange({
      ...data,
      [field]: value
    });
  };

  const handleCarryVestingChange = (field: 'cliffYears' | 'vestingYears', value: number) => {
    onChange({
      ...data,
      carryVesting: {
        ...data.carryVesting,
        [field]: value
      }
    });
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
              Choose between European (deal-by-deal) or American (fund-level) waterfall
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup 
              value={data.type} 
              onValueChange={(value: 'EUROPEAN' | 'AMERICAN') => handleChange('type', value)}
            >
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 border rounded-lg">
                  <RadioGroupItem value="EUROPEAN" id="european" className="mt-1" />
                  <div className="space-y-2">
                    <Label htmlFor="european" className="text-base font-medium cursor-pointer">
                      European Waterfall
                    </Label>
                    <p className="text-sm text-gray-600">
                      Deal-by-deal carry distribution. GPs receive carry on each individual exit 
                      after returning invested capital plus hurdle for that specific investment.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-4 border rounded-lg">
                  <RadioGroupItem value="AMERICAN" id="american" className="mt-1" />
                  <div className="space-y-2">
                    <Label htmlFor="american" className="text-base font-medium cursor-pointer">
                      American Waterfall
                    </Label>
                    <p className="text-sm text-gray-600">
                      Fund-level carry distribution. GPs receive carry only after the entire fund 
                      has returned capital plus hurdle to LPs.
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Financial Terms - Only show for European waterfall */}
        {data.type === 'EUROPEAN' && (
          <Card>
            <CardHeader>
              <CardTitle>Financial Terms</CardTitle>
              <CardDescription>
                Set the hurdle rate and catch-up provisions for European waterfall
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-base font-medium">Hurdle Rate (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formatPercentage(data.hurdle)}
                    onChange={(e) => handleChange('hurdle', parsePercentage(e.target.value))}
                    className="pr-8"
                    placeholder="8.0"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="text-sm text-gray-600">
                  Minimum annual return LPs must receive before GPs earn carry
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-medium">Catch-Up Rate (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formatPercentage(data.catchUp)}
                    onChange={(e) => handleChange('catchUp', parsePercentage(e.target.value))}
                    className="pr-8"
                    placeholder="8.0"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="text-sm text-gray-600">
                  Rate at which GPs catch up to their full carry percentage after hurdle is met
                </p>
                {data.catchUp < data.hurdle && (
                  <p className="text-sm text-red-500">
                    Catch-up rate should be greater than or equal to hurdle rate
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
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
                onValueChange={(value) => handleCarryVestingChange('cliffYears', parseInt(value))}
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
                onValueChange={(value) => handleCarryVestingChange('vestingYears', parseInt(value))}
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