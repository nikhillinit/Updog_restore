import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, TrendingUp, DollarSign } from 'lucide-react';
import { calculateReserves } from '@/lib/reserves-v11';
import { adaptFundToReservesInput, adaptReservesConfig } from '@/adapters/reserves-adapter';
import { metrics, auditLog } from '@/metrics/reserves-metrics';
import { formatQuarter, getCurrentQuarter } from '@/lib/quarter-time';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import type { Fund } from '@shared/schema';
import type { ReservesConfig } from '@shared/schemas/reserves-schemas';

interface ReserveCalculationResult {
  ok: boolean;
  data?: {
    metadata: {
      total_available_cents: number;
      total_allocated_cents: number;
      companies_funded: number;
    };
    remaining_cents: number;
  };
  warnings?: string[];
  error?: string;
  metrics?: {
    duration_ms: number;
  };
}

interface ReserveStepProps {
  fund: Fund;
  onComplete: (_reserveConfig: ReservesConfig) => void;
  onBack?: () => void;
}

export default function ReserveStep({ fund, onComplete, onBack }: ReserveStepProps) {
  // Configuration state
  const [reservePercent, setReservePercent] = useState(15); // Default 15%
  const [enableRemainPass, setEnableRemainPass] = useState(false);
  const [capPolicy, setCapPolicy] = useState<'fixed' | 'stage' | 'custom'>('fixed');
  const [defaultCapPercent, setDefaultCapPercent] = useState(50); // Default 50% cap
  
  // Stage-based caps
  const [stageCaps, setStageCaps] = useState({
    'Seed': 75,
    'Series A': 60,
    'Series B': 50,
    'Series C': 40,
    'Growth': 30
  });
  
  // Results state
  const [calculationResult, setCalculationResult] = useState<ReserveCalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  
  // Preview calculation
  const runCalculation = async () => {
    setIsCalculating(true);
    setErrors([]);
    setWarnings([]);
    
    const timer = metrics.startTimer('reserves.ui.calculation');
    
    try {
      // Adapt fund data
      const input = adaptFundToReservesInput(fund);
      
      // Build config
      const config = adaptReservesConfig({
        reservePercentage: reservePercent / 100,
        enableRemainPass,
        capPercent: defaultCapPercent / 100,
        ...(capPolicy === 'stage' ? {
          stageCaps: Object.fromEntries(
            Object.entries(stageCaps).map(([k, v]) => [k, v / 100])
          )
        } : {}),
        auditLevel: 'detailed'
      });
      
      // Record metrics
      metrics.recordCompanyCount(input.companies.length);
      metrics.recordCapPolicy(capPolicy);
      
      // Run calculation
      const result = calculateReserves(
        input.companies,
        reservePercent / 100,
        enableRemainPass
      );
      
      setCalculationResult(result);
      
      if (result.warnings) {
        setWarnings(result.warnings);
      }
      
      if (!result.ok) {
        setErrors([result.error || 'Calculation failed']);
        metrics.recordError(result.error || 'Unknown error');
      } else {
        // Record audit log
        auditLog.record({
          operation: 'reserves.calculation',
          input,
          output: result.data,
          config,
          duration_ms: result.metrics?.duration_ms || 0,
          ...spreadIfDefined("warnings", result.warnings)
        });
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setErrors([errorMsg]);
      metrics.recordError(errorMsg);
    } finally {
      timer.end();
      setIsCalculating(false);
    }
  };
  
  // Run calculation on config change
  useEffect(() => {
    const hasCompanies = fund && 'companies' in fund && Array.isArray(fund.companies) && fund.companies.length > 0;
    if (hasCompanies) {
      runCalculation();
    }
    // Disable exhaustive-deps: runCalculation uses fund internally, adding it would cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservePercent, enableRemainPass, capPolicy, defaultCapPercent, stageCaps]);
  
  // Handle completion
  const handleComplete = () => {
    const config = {
      reservePercent,
      enableRemainPass,
      capPolicy,
      defaultCapPercent,
      stageCaps: capPolicy === 'stage' ? stageCaps : undefined,
      calculationResult
    };
    
    onComplete(config);
  };
  
  // Format currency
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Reserve Allocation Configuration
          </CardTitle>
          <CardDescription>
            Configure how follow-on reserves will be allocated across your portfolio companies
          </CardDescription>
        </CardHeader>
      </Card>
      
      {/* Reserve Percentage Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reserve Percentage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="reserve-percent">Reserve Allocation</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="reserve-percent-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={reservePercent}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReservePercent(Number(e.target.value))}
                  className="w-20"
                  aria-label="Reserve percentage"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              id="reserve-percent"
              min={0}
              max={50}
              step={1}
              value={[reservePercent]}
              onValueChange={([value]) => setReservePercent(value ?? reservePercent)}
              className="w-full"
              aria-label="Reserve percentage slider"
            />
            <p className="text-sm text-muted-foreground">
              Percentage of total invested capital to reserve for follow-on investments
            </p>
          </div>
          
          {/* Remain Pass Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="remain-pass" className="text-base">Enable Remain Pass</Label>
              <p className="text-sm text-muted-foreground">
                Perform an additional allocation pass for any remaining reserves
              </p>
            </div>
            <Switch
              id="remain-pass"
              checked={enableRemainPass}
              onCheckedChange={setEnableRemainPass}
              aria-label="Enable remain pass"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Cap Policy Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Investment Cap Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cap-policy">Cap Strategy</Label>
            <Select value={capPolicy} onValueChange={(value: 'fixed' | 'stage' | 'custom') => setCapPolicy(value)}>
              <SelectTrigger id="cap-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Percentage</SelectItem>
                <SelectItem value="stage">Stage-Based</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {capPolicy === 'fixed' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="default-cap">Maximum Reserve Cap</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="default-cap-input"
                    type="number"
                    min="0"
                    max="200"
                    step="5"
                    value={defaultCapPercent}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDefaultCapPercent(Number(e.target.value))}
                    className="w-20"
                    aria-label="Default cap percentage"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                id="default-cap"
                min={0}
                max={200}
                step={5}
                value={[defaultCapPercent]}
                onValueChange={([value]) => setDefaultCapPercent(value ?? defaultCapPercent)}
                className="w-full"
                aria-label="Default cap percentage slider"
              />
              <p className="text-sm text-muted-foreground">
                Maximum reserve as percentage of initial investment
              </p>
            </div>
          )}
          
          {capPolicy === 'stage' && (
            <div className="space-y-3">
              {Object.entries(stageCaps).map(([stage, cap]) => (
                <div key={stage} className="flex items-center justify-between">
                  <Label htmlFor={`cap-${stage}`} className="w-24">{stage}</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      id={`cap-${stage}`}
                      min={0}
                      max={200}
                      step={5}
                      value={[cap]}
                      onValueChange={([value]) => setStageCaps(prev => ({ ...prev, [stage]: value }))}
                      className="w-40"
                      aria-label={`${stage} cap percentage`}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="200"
                      value={cap}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStageCaps(prev => ({ ...prev, [stage]: Number(e.target.value) }))}
                      className="w-16"
                      aria-label={`${stage} cap input`}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Calculation Results Preview */}
      {calculationResult?.ok && calculationResult.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Allocation Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Reserve</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(calculationResult.data.metadata.total_available_cents)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Allocated</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(calculationResult.data.metadata.total_allocated_cents)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(calculationResult.data.remaining_cents)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Companies</p>
                <p className="text-lg font-semibold">
                  {calculationResult.data.metadata.companies_funded}
                </p>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Current Quarter: {formatQuarter(getCurrentQuarter())}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {warnings.map((warning: string, i: number) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error: string, i: number) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Navigation */}
      <div className="flex justify-between">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button 
          onClick={handleComplete}
          disabled={!calculationResult?.ok || isCalculating}
          className="ml-auto"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}