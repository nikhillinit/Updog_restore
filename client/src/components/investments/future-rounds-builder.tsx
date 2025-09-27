/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, Info } from "lucide-react";

interface FutureRoundsBuilderProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  onBuildRounds: (config: FutureRoundsConfig) => void;
}

interface FutureRoundsConfig {
  sectorProfile: string;
  startingRound: string;
  graduationRate: string;
  startingDate: string;
  nextRoundDate: string;
}

const sectorProfiles = [
  { id: 'default', name: 'Default' },
  { id: 'enterprise-saas', name: 'Enterprise SaaS' },
  { id: 'fintech', name: 'FinTech' },
  { id: 'marketplace', name: 'Marketplace' },
  { id: 'healthcare', name: 'Healthcare' },
  { id: 'ai-ml', name: 'AI/ML' },
  { id: 'biotech', name: 'Biotech' }
];

const fundingRounds = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
  'Series E+'
];

const graduationRateOptions = [
  { id: 'sector-based', name: 'Based on Sector' },
  { id: 'custom', name: 'Custom Rate' },
  { id: 'high', name: 'High (85%)' },
  { id: 'medium', name: 'Medium (65%)' },
  { id: 'low', name: 'Low (45%)' }
];

const startingDateOptions = [
  { id: 'sector-based', name: 'Based on Sector' },
  { id: 'custom', name: 'Custom Date' },
  { id: 'fund-start', name: 'Fund Start Date' },
  { id: 'investment-date', name: 'Investment Date' }
];

export default function FutureRoundsBuilder({ open, onOpenChange, onBuildRounds }: FutureRoundsBuilderProps) {
  const [config, setConfig] = useState<FutureRoundsConfig>({
    sectorProfile: 'default',
    startingRound: 'pre-seed',
    graduationRate: 'sector-based',
    startingDate: 'custom',
    nextRoundDate: '2024-06-15'
  });

  const handleBuild = () => {
    onBuildRounds(config);
    onOpenChange(false);
  };

  const handleConfigChange = (field: keyof FutureRoundsConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Build Future Rounds</DialogTitle>
          <DialogDescription>
            Configure future funding rounds based on sector profiles and graduation rates
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Sector Profile */}
          <div className="space-y-2">
            <Label htmlFor="sector-profile" className="text-sm font-medium">
              Sector Profile
            </Label>
            <Select 
              value={config.sectorProfile} 
              onValueChange={(value: any) => handleConfigChange('sectorProfile', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select sector profile" />
              </SelectTrigger>
              <SelectContent>
                {sectorProfiles.map((profile: any) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starting Round */}
          <div className="space-y-2">
            <Label htmlFor="starting-round" className="text-sm font-medium">
              Starting Round
            </Label>
            <Select 
              value={config.startingRound} 
              onValueChange={(value: any) => handleConfigChange('startingRound', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select starting round" />
              </SelectTrigger>
              <SelectContent>
                {fundingRounds.map((round: any) => (
                  <SelectItem key={round.toLowerCase().replace(/\s+/g, '-')} value={round.toLowerCase().replace(/\s+/g, '-')}>
                    {round}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Graduation Rate */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="graduation-rate" className="text-sm font-medium">
                Graduation Rate
              </Label>
              <Info className="h-4 w-4 text-gray-400" />
            </div>
            <Select 
              value={config.graduationRate} 
              onValueChange={(value: any) => handleConfigChange('graduationRate', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select graduation rate" />
              </SelectTrigger>
              <SelectContent>
                {graduationRateOptions.map((option: any) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starting Date */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="starting-date" className="text-sm font-medium">
                Starting Date
              </Label>
              <Info className="h-4 w-4 text-gray-400" />
            </div>
            <Select 
              value={config.startingDate} 
              onValueChange={(value: any) => handleConfigChange('startingDate', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select starting date option" />
              </SelectTrigger>
              <SelectContent>
                {startingDateOptions.map((option: any) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date of Next Round */}
          <div className="space-y-2">
            <Label htmlFor="next-round-date" className="text-sm font-medium">
              Date of Next Round
            </Label>
            <div className="relative">
              <Input
                id="next-round-date"
                type="date"
                value={config.nextRoundDate}
                onChange={(e: any) => handleConfigChange('nextRoundDate', e.target.value)}
                className="w-full"
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Information Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-2">Future Rounds Configuration</p>
                <ul className="space-y-1 text-xs">
                  <li>• Sector profiles determine default graduation rates and timing patterns</li>
                  <li>• Starting round sets the initial investment stage for future round generation</li>
                  <li>• Graduation rates control the probability of advancing to subsequent rounds</li>
                  <li>• Custom dates allow precise timing control for investment planning</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleBuild}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Build
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
