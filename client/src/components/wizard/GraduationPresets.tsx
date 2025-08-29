/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Shield, Zap } from 'lucide-react';

interface GraduationPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  badgeColor: 'default' | 'secondary' | 'destructive' | 'outline';
  rates: number[];
  totalGraduation: number;
  remainAtEnd: number;
  riskProfile: string;
}

const PRESETS: GraduationPreset[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Lower graduation rates with more remain for stability',
    icon: <Shield className="w-5 h-5" />,
    badge: 'Low Risk',
    badgeColor: 'secondary',
    rates: [15, 20, 25, 30, 0], // 90% grad, 10% remain
    totalGraduation: 90,
    remainAtEnd: 10,
    riskProfile: 'Ideal for stable, long-term focused funds'
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Moderate graduation with balanced risk-return',
    icon: <TrendingUp className="w-5 h-5" />,
    badge: 'Balanced',
    badgeColor: 'default',
    rates: [20, 25, 25, 25, 0], // 95% grad, 5% remain
    totalGraduation: 95,
    remainAtEnd: 5,
    riskProfile: 'Good for most investment strategies'
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Higher graduation rates for maximum deployment',
    icon: <Zap className="w-5 h-5" />,
    badge: 'High Growth',
    badgeColor: 'destructive',
    rates: [25, 25, 25, 23, 0], // 98% grad, 2% remain
    totalGraduation: 98,
    remainAtEnd: 2,
    riskProfile: 'For high-conviction, growth-oriented strategies'
  }
];

interface GraduationPresetsProps {
  onSelectPreset: (_rates: number[]) => void;
  disabled?: boolean;
}

export function GraduationPresets({ onSelectPreset, disabled = false }: GraduationPresetsProps) {
  const handlePresetSelect = (preset: GraduationPreset) => {
    if (disabled) return;
    onSelectPreset(preset.rates);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Choose a Graduation Strategy</h3>
        <p className="text-sm text-muted-foreground">
          Select a preset or customize your own graduation rates
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRESETS.map((preset) => (
          <Card 
            key={preset.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:ring-2 hover:ring-primary/20'
            }`}
            onClick={() => handlePresetSelect(preset)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {preset.icon}
                  <CardTitle className="text-base">{preset.name}</CardTitle>
                </div>
                <Badge variant={preset.badgeColor} className="text-xs">
                  {preset.badge}
                </Badge>
              </div>
              <CardDescription className="text-sm">
                {preset.description}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-0 space-y-3">
              {/* Graduation Rate Breakdown */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Stage Graduation Rates
                </div>
                <div className="flex justify-between text-sm">
                  {preset.rates.slice(0, 4).map((rate, index) => (
                    <div key={index} className="text-center">
                      <div className="font-medium">{rate}%</div>
                      <div className="text-xs text-muted-foreground">S{index + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Summary Stats */}
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Graduation:</span>
                  <span className="font-medium">{preset.totalGraduation}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Final Remain:</span>
                  <span className="font-medium">{preset.remainAtEnd}%</span>
                </div>
              </div>
              
              {/* Risk Profile */}
              <div className="text-xs text-muted-foreground border-t pt-2">
                {preset.riskProfile}
              </div>
              
              {/* Select Button */}
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2"
                disabled={disabled}
              >
                Use This Preset
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Custom Option */}
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <div className="text-sm text-muted-foreground mb-2">
            Need something different?
          </div>
          <Button variant="ghost" size="sm" disabled={disabled}>
            Customize Your Own Rates
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default GraduationPresets;

