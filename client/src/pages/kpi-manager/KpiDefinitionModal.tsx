import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart3, X } from 'lucide-react';

type KPI = {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative';
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  startDate: string;
  term: number;
  termUnit: 'quarters' | 'months' | 'years';
  numberFormat: string;
  askToUploadDocuments: boolean;
  showFullProjectionPeriod: boolean;
  hidePastHistoricals: boolean;
  description?: string;
};

interface KpiDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi?: Partial<KPI> | null;
  'data-modal-type'?: string;
}

export function KpiDefinitionModal({
  isOpen,
  onClose,
  kpi,
  'data-modal-type': modalType,
}: KpiDefinitionModalProps) {
  const [formData, setFormData] = useState<Partial<KPI>>(
    kpi || {
      type: 'quantitative',
      frequency: 'quarterly',
      numberFormat: 'United States Dollar ($)',
      askToUploadDocuments: false,
      showFullProjectionPeriod: true,
      hidePastHistoricals: false,
      term: 66,
      termUnit: 'quarters',
    }
  );

  if (!isOpen) return null;

  const handleSave = () => {
    // TODO: Implement save logic
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      data-modal-type={modalType}
    >
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5" />
              <span>KPI Definition</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="kpi-name">KPI Name</Label>
            <Input
              id="kpi-name"
              value={formData.name || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="ARR"
              className="border-gray-300"
            />
          </div>

          <div className="space-y-3">
            <Label>Type</Label>
            <Select
              value={formData.type ?? ''}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, type: value as 'quantitative' | 'qualitative' }))
              }
            >
              <SelectTrigger className="border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quantitative">Quantitative</SelectItem>
                <SelectItem value="qualitative">Qualitative</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Frequency</Label>
            <Select
              value={formData.frequency ?? ''}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  frequency: value as 'monthly' | 'quarterly' | 'semi-annual' | 'annual',
                }))
              }
            >
              <SelectTrigger className="border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Start Date</Label>
            <Input
              type="month"
              value={formData.startDate || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="border-gray-300"
            />
          </div>

          <div className="space-y-3">
            <Label>Term</Label>
            <div className="flex space-x-2">
              <Input
                type="number"
                value={formData.term || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({ ...prev, term: parseInt(e.target.value) }))
                }
                className="flex-1 border-gray-300"
                placeholder="66"
              />
              <Select
                value={formData.termUnit ?? ''}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    termUnit: value as 'quarters' | 'months' | 'years',
                  }))
                }
              >
                <SelectTrigger className="w-32 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarters">quarters</SelectItem>
                  <SelectItem value="months">months</SelectItem>
                  <SelectItem value="years">years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Number Format</Label>
            <Select
              value={formData.numberFormat ?? ''}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, numberFormat: value }))}
            >
              <SelectTrigger className="border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="United States Dollar ($)">United States Dollar ($)</SelectItem>
                <SelectItem value="Euro (�)">Euro (�)</SelectItem>
                <SelectItem value="Percentage (%)">Percentage (%)</SelectItem>
                <SelectItem value="Number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <Label className="text-base font-medium">KPI Requests Configuration</Label>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="upload-docs"
                checked={formData.askToUploadDocuments || false}
                onCheckedChange={(checked: boolean) =>
                  setFormData((prev) => ({ ...prev, askToUploadDocuments: !!checked }))
                }
              />
              <Label htmlFor="upload-docs" className="text-sm">
                Ask to upload documents
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-projection"
                checked={formData.showFullProjectionPeriod || false}
                onCheckedChange={(checked: boolean) =>
                  setFormData((prev) => ({ ...prev, showFullProjectionPeriod: !!checked }))
                }
              />
              <Label htmlFor="show-projection" className="text-sm">
                Show full projection period
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="hide-historicals"
                checked={formData.hidePastHistoricals || false}
                onCheckedChange={(checked: boolean) =>
                  setFormData((prev) => ({ ...prev, hidePastHistoricals: !!checked }))
                }
              />
              <Label htmlFor="hide-historicals" className="text-sm">
                Hide past historicals
              </Label>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button onClick={handleSave} className="flex-1">
              Save KPI
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
