/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Calculator, DollarSign, Percent, AlertCircle } from 'lucide-react';

interface SAFENote {
  id: string;
  type: 'safe' | 'note';
  principal: number;
  valuationCap?: number;
  discount?: number;
  interestRate?: number;
  maturityDate?: string;
  conversionPrice?: number;
  shares?: number;
  holderName: string;
  investmentDate: string;
  mostFavoredNation?: boolean;
  proRataRights?: boolean;
}

interface SAFENoteEditorProps {
  safesNotes: SAFENote[];
  onSafesNotesChange: (safesNotes: SAFENote[]) => void;
  pricePerShare?: number;
}

export default function SAFENoteEditor({ safesNotes, onSafesNotesChange, pricePerShare }: SAFENoteEditorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<SAFENote | null>(null);
  const defaultDate = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState<Partial<SAFENote>>({
    type: 'safe',
    principal: 0,
    valuationCap: 0,
    discount: 0.20,
    holderName: '',
    ...(defaultDate && { investmentDate: defaultDate }),
    mostFavoredNation: true,
    proRataRights: true,
  });

  const handleAdd = () => {
    if (!formData.principal || !formData.holderName) return;

    const newInstrument: SAFENote = {
      id: `${formData.type}-${Date.now()}`,
      type: formData.type as 'safe' | 'note',
      principal: formData.principal,
      valuationCap: formData.valuationCap,
      discount: formData.discount,
      interestRate: formData.interestRate,
      maturityDate: formData.maturityDate,
      holderName: formData.holderName!,
      investmentDate: formData.investmentDate!,
      mostFavoredNation: formData.mostFavoredNation,
      proRataRights: formData.proRataRights,
    };

    onSafesNotesChange([...safesNotes, newInstrument]);
    setShowAddDialog(false);
    const resetDate = new Date().toISOString().split('T')[0];
    setFormData({
      type: 'safe',
      principal: 0,
      valuationCap: 0,
      discount: 0.20,
      holderName: '',
      ...(resetDate && { investmentDate: resetDate }),
      mostFavoredNation: true,
      proRataRights: true,
    });
  };

  const handleEdit = (instrument: SAFENote) => {
    setEditingInstrument(instrument);
    setFormData(instrument);
    setShowAddDialog(true);
  };

  const handleUpdate = () => {
    if (!editingInstrument || !formData.principal || !formData.holderName) return;

    const updatedInstruments = safesNotes.map(inst => 
      inst.id === editingInstrument.id 
        ? { ...inst, ...formData } as SAFENote
        : inst
    );

    onSafesNotesChange(updatedInstruments);
    setShowAddDialog(false);
    setEditingInstrument(null);
    const resetDate = new Date().toISOString().split('T')[0];
    setFormData({
      type: 'safe',
      principal: 0,
      valuationCap: 0,
      discount: 0.20,
      holderName: '',
      ...(resetDate && { investmentDate: resetDate }),
      mostFavoredNation: true,
      proRataRights: true,
    });
  };

  const handleDelete = (id: string) => {
    onSafesNotesChange(safesNotes.filter(inst => inst.id !== id));
  };

  const calculateConversion = (instrument: SAFENote, pricePerShare: number) => {
    // Calculate cap-based price
    const capBasedPrice = instrument.valuationCap ? 
      instrument.valuationCap / 10000000 : Infinity; // Assuming 10M fully diluted shares

    // Calculate discount-based price  
    const discountBasedPrice = instrument.discount ? 
      pricePerShare * (1 - instrument.discount) : Infinity;

    // Take the lower of the two (better for investor)
    const conversionPrice = Math.min(capBasedPrice, discountBasedPrice);
    const shares = instrument.principal / conversionPrice;

    return {
      conversionPrice,
      shares,
      usedCap: conversionPrice === capBasedPrice,
      usedDiscount: conversionPrice === discountBasedPrice
    };
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">SAFEs & Convertible Notes</h3>
          <p className="text-sm text-gray-600">
            Manage securities that will convert in the next funding round
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add SAFE/Note
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {safesNotes.map((instrument) => {
          const conversion = pricePerShare ? calculateConversion(instrument, pricePerShare) : null;
          
          return (
            <Card key={instrument.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge className={instrument.type === 'safe' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}>
                      {instrument.type.toUpperCase()}
                    </Badge>
                    <span className="font-medium">{instrument.holderName}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(instrument)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(instrument.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Principal:</span>
                    <div className="font-medium">{formatCurrency(instrument.principal)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Investment Date:</span>
                    <div className="font-medium">{new Date(instrument.investmentDate).toLocaleDateString()}</div>
                  </div>
                </div>

                {instrument.valuationCap && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Valuation Cap:</span>
                      <div className="font-medium">{formatCurrency(instrument.valuationCap)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Discount:</span>
                      <div className="font-medium">{instrument.discount ? `${(instrument.discount * 100).toFixed(0)}%` : 'None'}</div>
                    </div>
                  </div>
                )}

                {instrument.interestRate && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Interest Rate:</span>
                      <div className="font-medium">{(instrument.interestRate * 100).toFixed(1)}%</div>
                    </div>
                    {instrument.maturityDate && (
                      <div>
                        <span className="text-gray-500">Maturity:</span>
                        <div className="font-medium">{new Date(instrument.maturityDate).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                )}

                {conversion && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Calculator className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">Conversion Preview</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Conversion Price:</span>
                        <div className="font-medium">{formatCurrency(conversion.conversionPrice)}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Shares:</span>
                        <div className="font-medium">{formatShares(conversion.shares)}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      {conversion.usedCap && (
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          Uses Cap
                        </Badge>
                      )}
                      {conversion.usedDiscount && (
                        <Badge variant="outline" className="text-blue-700 border-blue-300">
                          Uses Discount
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {instrument.mostFavoredNation && <span>MFN</span>}
                  {instrument.proRataRights && <span>Pro Rata</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInstrument ? 'Edit' : 'Add'} {formData.type?.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <Tabs value={formData.type ?? 'safe'} onValueChange={(value) => setFormData({ ...formData, type: value as 'safe' | 'note' })}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="safe">SAFE</TabsTrigger>
                <TabsTrigger value="note">Convertible Note</TabsTrigger>
              </TabsList>
              
              <TabsContent value="safe" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="holder-name">Investor Name</Label>
                    <Input
                      id="holder-name"
                      value={formData.holderName}
                      onChange={(e) => setFormData({ ...formData, holderName: e.target.value })}
                      placeholder="Angel Investor"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="principal">Investment Amount</Label>
                    <Input
                      id="principal"
                      type="number"
                      value={formData.principal}
                      onChange={(e) => setFormData({ ...formData, principal: Number(e.target.value) })}
                      placeholder="500000"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="valuation-cap">Valuation Cap</Label>
                    <Input
                      id="valuation-cap"
                      type="number"
                      value={formData.valuationCap}
                      onChange={(e) => setFormData({ ...formData, valuationCap: Number(e.target.value) })}
                      placeholder="8000000"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="discount">Discount (%)</Label>
                    <Input
                      id="discount"
                      type="number"
                      step="0.01"
                      max="1"
                      value={formData.discount ? formData.discount * 100 : ''}
                      onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) / 100 })}
                      placeholder="20"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="note" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="note-holder-name">Investor Name</Label>
                    <Input
                      id="note-holder-name"
                      value={formData.holderName}
                      onChange={(e) => setFormData({ ...formData, holderName: e.target.value })}
                      placeholder="Note Holder"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="note-principal">Principal Amount</Label>
                    <Input
                      id="note-principal"
                      type="number"
                      value={formData.principal}
                      onChange={(e) => setFormData({ ...formData, principal: Number(e.target.value) })}
                      placeholder="750000"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="interest-rate">Interest Rate (%)</Label>
                    <Input
                      id="interest-rate"
                      type="number"
                      step="0.01"
                      value={formData.interestRate ? formData.interestRate * 100 : ''}
                      onChange={(e) => setFormData({ ...formData, interestRate: Number(e.target.value) / 100 })}
                      placeholder="8"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="note-discount">Discount (%)</Label>
                    <Input
                      id="note-discount"
                      type="number"
                      step="0.01"
                      value={formData.discount ? formData.discount * 100 : ''}
                      onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) / 100 })}
                      placeholder="25"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maturity-date">Maturity Date</Label>
                    <Input
                      id="maturity-date"
                      type="date"
                      value={formData.maturityDate}
                      onChange={(e) => setFormData({ ...formData, maturityDate: e.target.value })}
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="note-cap">Valuation Cap</Label>
                    <Input
                      id="note-cap"
                      type="number"
                      value={formData.valuationCap}
                      onChange={(e) => setFormData({ ...formData, valuationCap: Number(e.target.value) })}
                      placeholder="12000000"
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="investment-date">Investment Date</Label>
                    <Input
                      id="investment-date"
                      type="date"
                      value={formData.investmentDate}
                      onChange={(e) => setFormData({ ...formData, investmentDate: e.target.value })}
                      className="border-yellow-300 bg-yellow-50"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={editingInstrument ? handleUpdate : handleAdd}>
                {editingInstrument ? 'Update' : 'Add'} {formData.type?.toUpperCase()}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
