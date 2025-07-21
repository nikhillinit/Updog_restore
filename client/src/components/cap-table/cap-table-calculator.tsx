import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Calculator, Download, Edit, Trash2, Users, TrendingUp, DollarSign, Percent } from 'lucide-react';
import SAFENoteEditor from './safe-note-editor';

interface Shareholder {
  id: string;
  name: string;
  type: 'founder' | 'employee' | 'investor' | 'safe' | 'note' | 'option-pool';
  shares: number;
  percentage: number;
  isConverted?: boolean;
}

interface SAFENote {
  id: string;
  type: 'safe' | 'note';
  principal: number;
  valuationCap?: number;
  discount?: number;
  conversionPrice?: number;
  shares?: number;
  holderName: string;
}

interface CapTableScenario {
  id: string;
  name: string;
  investmentId: string;
  currentCapTable: Shareholder[];
  safesNotes: SAFENote[];
  nextRound: {
    preMoneyValuation: number;
    roundSize: number;
    pricePerShare: number;
    newInvestorShares: number;
    optionPoolIncrease: number;
  };
  proFormaCapTable: Shareholder[];
  createdAt: string;
  lastModified: string;
}

const SAMPLE_CAP_TABLE: Shareholder[] = [
  { id: '1', name: 'Common shareholder 1', type: 'founder', shares: 8000000, percentage: 42.4875 },
  { id: '2', name: 'Unallocated', type: 'option-pool', shares: 3910625, percentage: 20.7691 },
  { id: '3', name: 'Common shareholder 2', type: 'founder', shares: 3000000, percentage: 15.9328 },
  { id: '4', name: 'Common shareholder 3', type: 'founder', shares: 1000000, percentage: 5.3109 },
  { id: '5', name: 'Tom Smith', type: 'employee', shares: 645289, percentage: 3.4271 },
  { id: '6', name: 'John Doe', type: 'employee', shares: 430193, percentage: 2.2847 },
  { id: '7', name: 'Jane Doe', type: 'employee', shares: 322644, percentage: 1.7135 },
  { id: '8', name: 'Common shareholder 4', type: 'founder', shares: 14000, percentage: 0.0744 },
  { id: '9', name: 'Common shareholder 5', type: 'founder', shares: 0, percentage: 0 },
];

const SAMPLE_SAFES_NOTES: SAFENote[] = [
  {
    id: 'safe-1',
    type: 'safe',
    principal: 500000,
    valuationCap: 8000000,
    discount: 0.20,
    holderName: 'Angel Investor 1'
  },
  {
    id: 'safe-2',
    type: 'safe',
    principal: 250000,
    valuationCap: 10000000,
    discount: 0.15,
    holderName: 'Angel Investor 2'
  },
  {
    id: 'note-1',
    type: 'note',
    principal: 750000,
    valuationCap: 12000000,
    discount: 0.25,
    holderName: 'Convertible Note Holder'
  }
];

export default function CapTableCalculator() {
  const [currentCapTable, setCurrentCapTable] = useState<Shareholder[]>(SAMPLE_CAP_TABLE);
  const [safesNotes, setSafesNotes] = useState<SAFENote[]>(SAMPLE_SAFES_NOTES);
  const [proFormaCapTable, setProFormaCapTable] = useState<Shareholder[]>([]);
  const [showAddShareholder, setShowAddShareholder] = useState(false);
  const [showAddSAFE, setShowAddSAFE] = useState(false);
  const [consolidate, setConsolidate] = useState(true);
  
  // Next Round Parameters
  const [preMoneyValuation, setPreMoneyValuation] = useState(15000000);
  const [roundSize, setRoundSize] = useState(5000000);
  const [optionPoolIncrease, setOptionPoolIncrease] = useState(500000);

  // Calculate cap table metrics
  const calculateMetrics = () => {
    const totalShares = currentCapTable.reduce((sum, sh) => sum + sh.shares, 0);
    const totalOptions = currentCapTable.find(sh => sh.type === 'option-pool')?.shares || 0;
    const fullyDilutedShares = totalShares;
    
    // Calculate price per share for next round
    const pricePerShare = (preMoneyValuation + optionPoolIncrease) / (fullyDilutedShares + optionPoolIncrease);
    const newInvestorShares = roundSize / pricePerShare;
    const postMoneyValuation = preMoneyValuation + roundSize;

    return {
      totalShares,
      totalOptions,
      fullyDilutedShares,
      pricePerShare,
      newInvestorShares,
      postMoneyValuation
    };
  };

  // Convert SAFEs and Notes
  const convertSafesNotes = (pricePerShare: number) => {
    return safesNotes.map(instrument => {
      // Calculate cap-based price
      const fullyDilutedShares = currentCapTable.reduce((sum, sh) => sum + sh.shares, 0);
      const capBasedPrice = instrument.valuationCap ? 
        instrument.valuationCap / fullyDilutedShares : Infinity;
      
      // Calculate discount-based price
      const discountBasedPrice = instrument.discount ? 
        pricePerShare * (1 - instrument.discount) : Infinity;
      
      // Take the lower of the two (better for investor)
      const conversionPrice = Math.min(capBasedPrice, discountBasedPrice);
      const shares = instrument.principal / conversionPrice;

      return {
        ...instrument,
        conversionPrice,
        shares
      };
    });
  };

  // Generate pro-forma cap table
  const generateProForma = () => {
    const metrics = calculateMetrics();
    const convertedInstruments = convertSafesNotes(metrics.pricePerShare);
    
    // Start with current cap table
    let proForma = [...currentCapTable];
    
    // Add new investor
    proForma.push({
      id: 'new-investor',
      name: 'New Investor',
      type: 'investor',
      shares: metrics.newInvestorShares,
      percentage: 0
    });

    // Add converted SAFEs/Notes
    convertedInstruments.forEach(instrument => {
      proForma.push({
        id: instrument.id,
        name: instrument.holderName,
        type: instrument.type === 'safe' ? 'safe' : 'note',
        shares: instrument.shares || 0,
        percentage: 0,
        isConverted: true
      });
    });

    // Add option pool increase if any
    if (optionPoolIncrease > 0) {
      const optionPoolIndex = proForma.findIndex(sh => sh.type === 'option-pool');
      if (optionPoolIndex >= 0) {
        proForma[optionPoolIndex].shares += optionPoolIncrease;
      }
    }

    // Calculate new total shares
    const newTotalShares = proForma.reduce((sum, sh) => sum + sh.shares, 0);

    // Recalculate all percentages
    proForma = proForma.map(shareholder => ({
      ...shareholder,
      percentage: (shareholder.shares / newTotalShares) * 100
    }));

    // Sort by percentage (descending)
    proForma.sort((a, b) => b.percentage - a.percentage);

    setProFormaCapTable(proForma);
    setSafesNotes(convertedInstruments);
  };

  useEffect(() => {
    generateProForma();
  }, [preMoneyValuation, roundSize, optionPoolIncrease, currentCapTable, safesNotes]);

  const metrics = calculateMetrics();
  const totalSAFEsNotes = safesNotes.reduce((sum, inst) => sum + inst.principal, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatShares = (shares: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(shares));
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(4)}%`;
  };

  const getShareholderTypeColor = (type: string) => {
    switch (type) {
      case 'founder': return 'bg-blue-100 text-blue-800';
      case 'employee': return 'bg-green-100 text-green-800';
      case 'investor': return 'bg-purple-100 text-purple-800';
      case 'safe': return 'bg-orange-100 text-orange-800';
      case 'note': return 'bg-red-100 text-red-800';
      case 'option-pool': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cap Table Calculator</h1>
          <p className="text-gray-600">Model SAFE/Note conversions and next round dilution</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Save Scenario
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Fully Diluted Shares</p>
                <p className="text-lg font-bold">{formatShares(metrics.fullyDilutedShares)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Price per Share</p>
                <p className="text-lg font-bold">{formatCurrency(metrics.pricePerShare)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Post-Money Valuation</p>
                <p className="text-lg font-bold">{formatCurrency(metrics.postMoneyValuation)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Percent className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">SAFEs/Notes Total</p>
                <p className="text-lg font-bold">{formatCurrency(totalSAFEsNotes)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Next Round Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calculator className="h-5 w-5" />
              <span>Next Round Parameters</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pre-money">Pre-Money Valuation</Label>
              <Input
                id="pre-money"
                type="number"
                value={preMoneyValuation}
                onChange={(e) => setPreMoneyValuation(Number(e.target.value))}
                className="border-yellow-300 bg-yellow-50"
              />
            </div>
            
            <div>
              <Label htmlFor="round-size">Round Size</Label>
              <Input
                id="round-size"
                type="number"
                value={roundSize}
                onChange={(e) => setRoundSize(Number(e.target.value))}
                className="border-yellow-300 bg-yellow-50"
              />
            </div>
            
            <div>
              <Label htmlFor="option-pool">Option Pool Increase</Label>
              <Input
                id="option-pool"
                type="number"
                value={optionPoolIncrease}
                onChange={(e) => setOptionPoolIncrease(Number(e.target.value))}
                className="border-yellow-300 bg-yellow-50"
              />
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">New Investor Shares:</span>
                <span className="font-medium">{formatShares(metrics.newInvestorShares)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Price per Share:</span>
                <span className="font-medium">{formatCurrency(metrics.pricePerShare)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Post-Money:</span>
                <span className="font-medium">{formatCurrency(metrics.postMoneyValuation)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SAFEs and Notes */}
        <div className="lg:col-span-3">
          <SAFENoteEditor
            safesNotes={safesNotes}
            onSafesNotesChange={setSafesNotes}
            pricePerShare={metrics.pricePerShare}
          />
        </div>
      </div>

      {/* Cap Table Tabs */}
      <Tabs defaultValue="pro-forma" className="w-full">
        <TabsList>
          <TabsTrigger value="current">Current Cap Table</TabsTrigger>
          <TabsTrigger value="pro-forma">Pro Forma Cap Table</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Cap Table</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shareholder Name</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentCapTable.map((shareholder) => (
                    <TableRow key={shareholder.id}>
                      <TableCell className="font-medium">{shareholder.name}</TableCell>
                      <TableCell className="text-right">{formatShares(shareholder.shares)}</TableCell>
                      <TableCell className="text-right">{formatPercentage(shareholder.percentage)}</TableCell>
                      <TableCell>
                        <Badge className={getShareholderTypeColor(shareholder.type)}>
                          {shareholder.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost">
                          + Ownership Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pro-forma" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pro Forma Cap Table</CardTitle>
                  <p className="text-sm text-gray-600">Pro Forma Cap Table after conversions.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConsolidate(!consolidate)}
                  >
                    Consolidate {consolidate ? '✓' : ''}
                  </Button>
                  <Button size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shareholder Name</TableHead>
                    <TableHead className="text-right">Fully Diluted Total</TableHead>
                    <TableHead className="text-right">Fully Diluted %</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proFormaCapTable.map((shareholder) => (
                    <TableRow key={shareholder.id}>
                      <TableCell className="font-medium">{shareholder.name}</TableCell>
                      <TableCell className="text-right">{formatShares(shareholder.shares)}</TableCell>
                      <TableCell className="text-right">{formatPercentage(shareholder.percentage)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost">
                          + Ownership Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Summary Rows */}
                  <TableRow className="border-t-2 border-gray-300">
                    <TableCell className="font-bold">Total Shares Excluding Options</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatShares(proFormaCapTable.filter(sh => sh.type !== 'option-pool').reduce((sum, sh) => sum + sh.shares, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatPercentage(proFormaCapTable.filter(sh => sh.type !== 'option-pool').reduce((sum, sh) => sum + sh.percentage, 0))}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  
                  <TableRow>
                    <TableCell>Unallocated Options</TableCell>
                    <TableCell className="text-right">
                      {formatShares(proFormaCapTable.find(sh => sh.type === 'option-pool')?.shares || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercentage(proFormaCapTable.find(sh => sh.type === 'option-pool')?.percentage || 0)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  
                  <TableRow className="border-t border-gray-300">
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatShares(proFormaCapTable.reduce((sum, sh) => sum + sh.shares, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">100.0000%</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}