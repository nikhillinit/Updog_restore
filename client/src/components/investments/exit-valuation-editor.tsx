import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TrendingUp, Calendar, DollarSign, FileText } from 'lucide-react';

interface ExitValuationEditorProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  currentValuation: number;
  currentDate: string;
  onUpdateExit: (_valuation: number, _date: string, _notes: string, _multiple: string) => void;
}

const exitMultiples = [
  { id: 'conservative', name: 'Conservative (3-5x)', range: '3-5x Revenue' },
  { id: 'market', name: 'Market (5-8x)', range: '5-8x Revenue' },
  { id: 'optimistic', name: 'Optimistic (8-12x)', range: '8-12x Revenue' },
  { id: 'aggressive', name: 'Aggressive (12x+)', range: '12x+ Revenue' },
  { id: 'custom', name: 'Custom Multiple', range: 'Custom' },
];

export default function ExitValuationEditor({
  open,
  onOpenChange,
  currentValuation,
  currentDate,
  onUpdateExit,
}: ExitValuationEditorProps) {
  const [exitValuation, setExitValuation] = useState(currentValuation);
  const [exitDate, setExitDate] = useState(currentDate);
  const [exitNotes, setExitNotes] = useState('');
  const [selectedMultiple, setSelectedMultiple] = useState('market');

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(0)}M`;
    return `$${value.toLocaleString()}`;
  };

  const handleSave = () => {
    onUpdateExit(exitValuation, exitDate, exitNotes, selectedMultiple);
    onOpenChange(false);
  };

  const handleMultipleChange = (multipleId: string) => {
    setSelectedMultiple(multipleId);

    // Auto-adjust valuation based on multiple selection
    const baseRevenue = 50000000; // Assume $50M revenue for calculation
    switch (multipleId) {
      case 'conservative':
        setExitValuation(baseRevenue * 4); // 4x revenue
        break;
      case 'market':
        setExitValuation(baseRevenue * 6.5); // 6.5x revenue
        break;
      case 'optimistic':
        setExitValuation(baseRevenue * 10); // 10x revenue
        break;
      case 'aggressive':
        setExitValuation(baseRevenue * 15); // 15x revenue
        break;
      default:
        // Keep current valuation for custom
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span>Update Exit Valuation</span>
          </DialogTitle>
          <DialogDescription>
            Update your investment thesis and expected exit valuation for this company
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current vs New Comparison */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <Label className="text-sm text-gray-600">Current Exit Valuation</Label>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(currentValuation)}
              </div>
              <div className="text-sm text-gray-500">{currentDate}</div>
            </div>
            <div className="text-center">
              <Label className="text-sm text-gray-600">New Exit Valuation</Label>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {formatCurrency(exitValuation)}
              </div>
              <div className="text-sm text-gray-500">{exitDate}</div>
            </div>
          </div>

          {/* Exit Multiple Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Exit Multiple Framework</Label>
            <div className="grid grid-cols-2 gap-3">
              {exitMultiples.map((multiple) => (
                <Button
                  key={multiple.id}
                  variant={selectedMultiple === multiple.id ? 'default' : 'outline'}
                  className={`h-auto p-3 flex flex-col items-start space-y-1 ${
                    selectedMultiple === multiple.id
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleMultipleChange(multiple.id)}
                >
                  <span className="font-medium text-sm">{multiple.name}</span>
                  <span className="text-xs opacity-80">{multiple.range}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Exit Valuation Input */}
          <div className="space-y-2">
            <Label htmlFor="exit-valuation" className="text-sm font-medium">
              Exit Valuation ($)
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="exit-valuation"
                type="number"
                value={exitValuation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setExitValuation(Number(e.target.value))
                }
                className="pl-10 bg-yellow-50 border-yellow-300"
                placeholder="3000000000"
              />
            </div>
            <p className="text-xs text-gray-500">
              Enter the expected exit valuation in dollars (e.g., 3000000000 for $3B)
            </p>
          </div>

          {/* Exit Date */}
          <div className="space-y-2">
            <Label htmlFor="exit-date" className="text-sm font-medium">
              Expected Exit Date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="exit-date"
                type="date"
                value={exitDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExitDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Investment Thesis Notes */}
          <div className="space-y-2">
            <Label htmlFor="exit-notes" className="text-sm font-medium">
              Investment Thesis & Exit Notes
            </Label>
            <Textarea
              id="exit-notes"
              value={exitNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExitNotes(e.target.value)}
              placeholder="Update your investment thesis, market opportunity, competitive positioning, and rationale for this exit valuation..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Key Metrics Summary */}
          <div className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-gray-600" />
              <Label className="text-sm font-medium">Exit Scenario Summary</Label>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Valuation Change:</span>
                <div
                  className={`font-semibold ${
                    exitValuation > currentValuation
                      ? 'text-green-600'
                      : exitValuation < currentValuation
                        ? 'text-red-600'
                        : 'text-gray-600'
                  }`}
                >
                  {exitValuation > currentValuation ? '+' : ''}
                  {(((exitValuation - currentValuation) / currentValuation) * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-gray-600">Exit Multiple:</span>
                <div className="font-semibold">
                  {exitMultiples.find((m) => m.id === selectedMultiple)?.name.split(' (')[0] ||
                    'Custom'}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Time to Exit:</span>
                <div className="font-semibold">
                  {Math.ceil(
                    (new Date(exitDate).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24 * 365)
                  )}{' '}
                  years
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            Update Exit Valuation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
