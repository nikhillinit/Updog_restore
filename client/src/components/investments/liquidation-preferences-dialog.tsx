import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Info, DollarSign, TrendingDown, AlertTriangle } from 'lucide-react';

interface LiquidationPreferencesDialogProps {
  isOpen: boolean;
  onOpenChange: (_open: boolean) => void;
  investment?: {
    id: string;
    company: string;
    amount: number;
  };
  performanceCase?: {
    id: string;
    name: string;
  };
}

export default function LiquidationPreferencesDialog({
  isOpen,
  onOpenChange,
  investment,
  performanceCase,
}: LiquidationPreferencesDialogProps) {
  const [enableLiqPrefs, setEnableLiqPrefs] = useState(false);
  const [totalLiqPrefOwned, setTotalLiqPrefOwned] = useState('4000000');
  const [liqPrefType, setLiqPrefType] = useState('Non-Participating');
  const [hasLiqPrefCap, setHasLiqPrefCap] = useState(false);
  const [liqPrefCapAmount, setLiqPrefCapAmount] = useState('6000000');
  const [totalLiqPrefsInFront, setTotalLiqPrefsInFront] = useState('0');
  const [totalOtherLiqPrefsPariPassu, setTotalOtherLiqPrefsPariPassu] = useState('0');
  const [totalLiqPrefsSenior, setTotalLiqPrefsSenior] = useState('0');

  const handleSave = () => {
    // TODO: persist liquidation preferences via API
    onOpenChange(false);
  };

  const handleImportFromCase = () => {
    // TODO: open a case selection dialog for importing liq prefs
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingDown className="h-5 w-5" />
            <span>Liquidation Preferences</span>
          </DialogTitle>
          <DialogDescription>
            Configure liquidation preference waterfall for{' '}
            {investment?.company || 'this investment'} -{' '}
            {performanceCase?.name || 'Performance Case'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enable Liquidation Preferences */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <div className="font-medium">Enable Liquidation Preferences</div>
                <div className="text-sm text-muted-foreground">
                  Turn on to incorporate liq pref impact in exit scenarios
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch checked={enableLiqPrefs} onCheckedChange={setEnableLiqPrefs} />
              <Badge variant={enableLiqPrefs ? 'default' : 'secondary'}>
                {enableLiqPrefs ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {enableLiqPrefs && (
            <>
              {/* Basic Liquidation Preference Settings */}
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center space-x-2">
                    <DollarSign className="h-4 w-4" />
                    <span>Liquidation Preference Details</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure the basic liquidation preference parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Total Liq Pref Owned */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center space-x-2">
                      <span>Total Liq Pref Owned ($)</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <div className="relative">
                      <Input
                        value={totalLiqPrefOwned}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setTotalLiqPrefOwned(e.target.value)
                        }
                        className="pl-8 bg-yellow-50 border-yellow-200 font-mono"
                        placeholder="4000000"
                      />
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total amount of liquidation preference owned by your fund. For a 2x Liq Pref
                      on $2M investment, enter $4M.
                    </p>
                  </div>

                  {/* Liq Pref Type */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center space-x-2">
                      <span>Liq Pref Type</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Select value={liqPrefType} onValueChange={setLiqPrefType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Non-Participating">Non-Participating</SelectItem>
                        <SelectItem value="Participating">Participating</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Specify whether your liquidation preference is participating or
                      non-participating.
                    </p>
                  </div>

                  {/* Liq Pref Cap (for participating only) */}
                  {liqPrefType === 'Participating' && (
                    <>
                      <div className="flex items-center justify-between p-3 border border-blue-200 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Liq Pref Cap</span>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <Switch checked={hasLiqPrefCap} onCheckedChange={setHasLiqPrefCap} />
                      </div>

                      {hasLiqPrefCap && (
                        <div className="space-y-2">
                          <Label className="text-sm">Liq Pref Cap Amount ($)</Label>
                          <div className="relative">
                            <Input
                              value={liqPrefCapAmount}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setLiqPrefCapAmount(e.target.value)
                              }
                              className="pl-8 bg-yellow-50 border-yellow-200 font-mono"
                              placeholder="6000000"
                            />
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            For a 3x cap on $2M investment, enter $6M as the cap amount.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Separator />

              {/* Waterfall Structure */}
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Waterfall Structure</CardTitle>
                  <CardDescription className="text-xs">
                    Define the liquidation preference waterfall hierarchy
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Total Liq Prefs in Front */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center space-x-2">
                      <span>Total Liq Prefs in Front ($)</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <div className="relative">
                      <Input
                        value={totalLiqPrefsInFront}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setTotalLiqPrefsInFront(e.target.value)
                        }
                        className="pl-8 font-mono"
                        placeholder="0"
                      />
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total amount of liquidation preferences senior to your position.
                    </p>
                  </div>

                  {/* Total Other Liq Prefs Pari Passu */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center space-x-2">
                      <span>Total Other Liq Prefs Pari Passu ($)</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <div className="relative">
                      <Input
                        value={totalOtherLiqPrefsPariPassu}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setTotalOtherLiqPrefsPariPassu(e.target.value)
                        }
                        className="pl-8 font-mono"
                        placeholder="0"
                      />
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Amount of liquidation preferences pari passu to yours (not including your
                      own).
                    </p>
                  </div>

                  {/* Total Liq Prefs Senior */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center space-x-2">
                      <span>Total Liq Prefs Junior ($)</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <div className="relative">
                      <Input
                        value={totalLiqPrefsSenior}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setTotalLiqPrefsSenior(e.target.value)
                        }
                        className="pl-8 font-mono"
                        placeholder="0"
                      />
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total amount of liquidation preferences below or junior to yours in the exit
                      waterfall.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Waterfall Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium mb-3">Liquidation Waterfall Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">1. Senior Liq Prefs:</span>
                    <span className="font-mono">
                      ${parseInt(totalLiqPrefsInFront).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">2. Your Liq Pref:</span>
                    <span className="font-mono">
                      ${parseInt(totalLiqPrefOwned).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">3. Pari Passu Liq Prefs:</span>
                    <span className="font-mono">
                      ${parseInt(totalOtherLiqPrefsPariPassu).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">4. Junior Liq Prefs:</span>
                    <span className="font-mono">
                      ${parseInt(totalLiqPrefsSenior).toLocaleString()}
                    </span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-medium">
                    <span>Total Liq Prefs:</span>
                    <span className="font-mono">
                      $
                      {(
                        parseInt(totalLiqPrefsInFront) +
                        parseInt(totalLiqPrefOwned) +
                        parseInt(totalOtherLiqPrefsPariPassu) +
                        parseInt(totalLiqPrefsSenior)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={handleImportFromCase}>
              Import from Another Case
            </Button>
            <div className="flex space-x-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="povc-bg-primary hover:bg-blue-700">
                Save Liq Prefs
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
