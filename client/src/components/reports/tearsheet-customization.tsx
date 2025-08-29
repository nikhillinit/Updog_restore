/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings, CheckCircle } from 'lucide-react';

interface TearSheetField {
  id: string;
  name: string;
  category: 'tearsheet' | 'kpi' | 'custom';
  selected: boolean;
}

interface TearSheetCustomizationProps {
  onFieldsChange?: (_fields: TearSheetField[]) => void;
}

const DEFAULT_TEARSHEET_FIELDS: TearSheetField[] = [
  { id: 'total-invested', name: 'Total Invested to Date', category: 'tearsheet', selected: true },
  { id: 'initial-investment', name: 'Initial Investment', category: 'tearsheet', selected: true },
  { id: 'follow-on-investments', name: 'Follow-On Investments to Date', category: 'tearsheet', selected: true },
  { id: 'reserves-remaining', name: 'Reserves Remaining', category: 'tearsheet', selected: true },
  { id: 'realized-exit-proceeds', name: 'Realized Exit Proceeds', category: 'tearsheet', selected: true },
  { id: 'cum-capital-raised', name: 'Cum Capital Raised', category: 'tearsheet', selected: true },
  { id: 'current-post-money', name: 'Current Post Money Valuation', category: 'tearsheet', selected: true },
  { id: 'ownership', name: 'Ownership', category: 'tearsheet', selected: true },
  { id: 'current-fmv', name: 'Current FMV', category: 'tearsheet', selected: true },
  { id: 'current-irr', name: 'Current IRR', category: 'tearsheet', selected: true },
  { id: 'current-moic', name: 'Current MOIC', category: 'tearsheet', selected: true },
  { id: 'company-description', name: 'Company Description', category: 'tearsheet', selected: true },
  { id: 'partner-commentary', name: 'Partner Commentary', category: 'tearsheet', selected: true },
  { id: 'historical-financings', name: 'Historical Financings', category: 'tearsheet', selected: true },
  { id: 'operating-kpis', name: 'Operating KPIs', category: 'tearsheet', selected: true },
  { id: 'exit-cases', name: 'Exit Cases', category: 'tearsheet', selected: true },
];

const DEFAULT_KPI_FIELDS: TearSheetField[] = [
  { id: 'arr', name: 'ARR', category: 'kpi', selected: true },
  { id: 'cash-balance', name: 'Cash Balance', category: 'kpi', selected: true },
  { id: 'sales', name: 'Sales', category: 'kpi', selected: true },
  { id: 'status-report', name: 'Status Report', category: 'kpi', selected: true },
  { id: 'employees', name: 'Number of Employees', category: 'kpi', selected: true },
  { id: 'burn-rate', name: 'Burn Rate (in Months)', category: 'kpi', selected: true },
  { id: 'women-employees', name: 'Women Employees', category: 'kpi', selected: true },
  { id: 'lgbtq-employees', name: 'Number of Employees who identify as a member of the LGBTQ+', category: 'kpi', selected: true },
  { id: 'veteran-employees', name: 'Number of Employees who are Veterans', category: 'kpi', selected: true },
  { id: 'disability-employees', name: 'Number of Employees who have a Disability', category: 'kpi', selected: true },
  { id: 'poc-employees', name: 'Number of Employees who are People of Color', category: 'kpi', selected: true },
  { id: 'team-dynamics', name: 'Team Dynamics', category: 'kpi', selected: true },
  { id: 'team-update', name: 'Team Update', category: 'kpi', selected: false },
  { id: 'units-sold', name: 'Units Sold', category: 'kpi', selected: false },
];

const SAMPLE_CUSTOM_FIELDS: TearSheetField[] = [
  { id: 'internal-status', name: 'Internal Status', category: 'custom', selected: false },
  { id: 'lead-status', name: 'Lead Status', category: 'custom', selected: false },
  { id: 'years-operation', name: 'Years of Operation', category: 'custom', selected: false },
  { id: 'internal-code', name: 'Internal Code', category: 'custom', selected: false },
  { id: 'internal-fmv', name: 'Internal FMV', category: 'custom', selected: false },
  { id: 'strategic', name: 'Strategic', category: 'custom', selected: false },
  { id: 'deal-source', name: 'Deal Source', category: 'custom', selected: false },
];

export default function TearSheetCustomization({ onFieldsChange }: TearSheetCustomizationProps) {
  const [tearsheetFields, setTearsheetFields] = useState<TearSheetField[]>(DEFAULT_TEARSHEET_FIELDS);
  const [kpiFields, setKpiFields] = useState<TearSheetField[]>(DEFAULT_KPI_FIELDS);
  const [customFields, setCustomFields] = useState<TearSheetField[]>(SAMPLE_CUSTOM_FIELDS);
  const [isOpen, setIsOpen] = useState(false);

  const handleFieldToggle = (fieldId: string, category: 'tearsheet' | 'kpi' | 'custom') => {
    const updateFields = (fields: TearSheetField[]) =>
      fields.map(field =>
        field.id === fieldId ? { ...field, selected: !field.selected } : field
      );

    if (category === 'tearsheet') {
      const updated = updateFields(tearsheetFields);
      setTearsheetFields(updated);
      onFieldsChange?.(updated);
    } else if (category === 'kpi') {
      const updated = updateFields(kpiFields);
      setKpiFields(updated);
      onFieldsChange?.(updated);
    } else if (category === 'custom') {
      const updated = updateFields(customFields);
      setCustomFields(updated);
      onFieldsChange?.(updated);
    }
  };

  const getSelectedCount = () => {
    return [...tearsheetFields, ...kpiFields, ...customFields].filter(field => field.selected).length;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tearsheet': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'kpi': return 'bg-green-100 text-green-800 border-green-200';
      case 'custom': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Customize
          {getSelectedCount() > 0 && (
            <Badge variant="secondary" className="ml-2">
              {getSelectedCount()}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Tearsheet</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Selected Fields</p>
              <p className="text-sm text-gray-600">
                {getSelectedCount()} fields selected for tearsheet display
              </p>
            </div>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>

          {/* Tearsheet Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge className={getCategoryColor('tearsheet')}>Tearsheet Fields</Badge>
                <span className="text-base font-medium">Core Investment Data</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tearsheetFields.map((field) => (
                <div key={field.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={field.id}
                    checked={field.selected}
                    onCheckedChange={() => handleFieldToggle(field.id, field.category)}
                  />
                  <Label htmlFor={field.id} className="flex-1 cursor-pointer">
                    {field.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* KPI Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge className={getCategoryColor('kpi')}>KPI Metrics</Badge>
                <span className="text-base font-medium">Show quantitative KPI metrics as of Apr 2024</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {kpiFields.map((field) => (
                <div key={field.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={field.id}
                    checked={field.selected}
                    onCheckedChange={() => handleFieldToggle(field.id, field.category)}
                  />
                  <Label htmlFor={field.id} className="flex-1 cursor-pointer">
                    {field.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Custom Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge className={getCategoryColor('custom')}>Custom Fields</Badge>
                <span className="text-base font-medium">User-Defined Fields</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customFields.length > 0 ? (
                customFields.map((field) => (
                  <div key={field.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={field.id}
                      checked={field.selected}
                      onCheckedChange={() => handleFieldToggle(field.id, field.category)}
                    />
                    <Label htmlFor={field.id} className="flex-1 cursor-pointer">
                      {field.name}
                    </Label>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p>No custom fields defined yet.</p>
                  <p className="text-sm">Create custom fields in the Custom Fields section to see them here.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsOpen(false)}>
              Apply Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
