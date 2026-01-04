/**
 * Cohort Definition Selector Component
 *
 * Allows users to select and configure cohort analysis parameters.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Settings, Building, TrendingUp, Calendar } from 'lucide-react';
import { useCohortDefinitions, useCreateCohortDefinition } from '@/hooks/useCohortAnalysis';
import type { VintageGranularity, CohortUnit } from '@shared/types';

interface CohortDefinitionSelectorProps {
  /** Currently selected definition ID */
  selectedId: number | undefined;
  /** Callback when selection changes */
  onSelect: (id: number | undefined) => void;
  /** Compact mode for inline display */
  compact?: boolean;
}

export function CohortDefinitionSelector({
  selectedId,
  onSelect,
  compact = false,
}: CohortDefinitionSelectorProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<CohortUnit>('company');
  const [newGranularity, setNewGranularity] = useState<VintageGranularity>('year');

  const { data: definitionsData, isLoading } = useCohortDefinitions();
  const { mutate: createDefinition, isPending: isCreating } = useCreateCohortDefinition();

  const definitions = definitionsData?.definitions || [];
  const selectedDefinition = definitions.find((d) => d.id === selectedId);

  const handleCreate = () => {
    if (!newName.trim()) return;

    createDefinition(
      {
        name: newName.trim(),
        unit: newUnit,
        vintageGranularity: newGranularity,
      },
      {
        onSuccess: (created) => {
          setIsCreateOpen(false);
          setNewName('');
          onSelect(created.id);
        },
      }
    );
  };

  const getUnitIcon = (unit: CohortUnit) => {
    return unit === 'company' ? (
      <Building className="h-3 w-3" />
    ) : (
      <TrendingUp className="h-3 w-3" />
    );
  };

  const getGranularityIcon = () => (
    <Calendar className="h-3 w-3" />
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={selectedId?.toString() || 'default'}
          onValueChange={(v) => onSelect(v === 'default' ? undefined : Number(v))}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select view..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              <span className="flex items-center gap-2">
                Default View
                {definitions.find((d) => d.isDefault) && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
              </span>
            </SelectItem>
            {definitions
              .filter((d) => !d.isDefault)
              .map((def) => (
                <SelectItem key={def.id} value={def.id.toString()}>
                  <span className="flex items-center gap-2">
                    {getUnitIcon(def.unit as CohortUnit)}
                    {def.name}
                    <Badge variant="outline" className="text-xs">
                      {def.vintageGranularity}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <CreateDefinitionDialog
            newName={newName}
            setNewName={setNewName}
            newUnit={newUnit}
            setNewUnit={setNewUnit}
            newGranularity={newGranularity}
            setNewGranularity={setNewGranularity}
            isCreating={isCreating}
            onCreate={handleCreate}
          />
        </Dialog>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            Cohort View
          </CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New View
              </Button>
            </DialogTrigger>
            <CreateDefinitionDialog
              newName={newName}
              setNewName={setNewName}
              newUnit={newUnit}
              setNewUnit={setNewUnit}
              newGranularity={newGranularity}
              setNewGranularity={setNewGranularity}
              isCreating={isCreating}
              onCreate={handleCreate}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-32 animate-pulse bg-gray-100 rounded-lg" />
        ) : (
          <div className="grid gap-2">
            {definitions.map((def) => (
              <button
                key={def.id}
                onClick={() => onSelect(def.id)}
                className={`w-full p-3 rounded-lg border text-left transition-colors ${
                  selectedId === def.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{def.name}</span>
                  {def.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    {getUnitIcon(def.unit as CohortUnit)}
                    {def.unit === 'company' ? 'Company-based' : 'Investment-based'}
                  </span>
                  <span className="flex items-center gap-1">
                    {getGranularityIcon()}
                    {def.vintageGranularity === 'year' ? 'Annual' : 'Quarterly'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedDefinition && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="text-xs text-gray-500">Current selection:</div>
            <div className="text-sm">
              <span className="font-medium">{selectedDefinition.name}</span>
              <p className="text-gray-500 mt-1">
                {selectedDefinition.unit === 'company'
                  ? 'Cohorts based on company vintage (earliest included investment)'
                  : 'Cohorts based on individual investment dates'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Internal component for the create dialog content
function CreateDefinitionDialog({
  newName,
  setNewName,
  newUnit,
  setNewUnit,
  newGranularity,
  setNewGranularity,
  isCreating,
  onCreate,
}: {
  newName: string;
  setNewName: (name: string) => void;
  newUnit: CohortUnit;
  setNewUnit: (unit: CohortUnit) => void;
  newGranularity: VintageGranularity;
  setNewGranularity: (granularity: VintageGranularity) => void;
  isCreating: boolean;
  onCreate: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create Cohort View</DialogTitle>
        <DialogDescription>
          Configure how investments are grouped and analyzed.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">View Name</Label>
          <Input
            id="name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Quarterly by Investment"
          />
        </div>

        <div className="space-y-2">
          <Label>Cohort Unit</Label>
          <RadioGroup
            value={newUnit}
            onValueChange={(v) => setNewUnit(v as CohortUnit)}
            className="grid grid-cols-2 gap-2"
          >
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                newUnit === 'company'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <RadioGroupItem value="company" className="sr-only" />
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-gray-600" />
                <div>
                  <div className="font-medium text-sm">Company</div>
                  <div className="text-xs text-gray-500">By company vintage</div>
                </div>
              </div>
            </label>
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                newUnit === 'investment'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <RadioGroupItem value="investment" className="sr-only" />
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-600" />
                <div>
                  <div className="font-medium text-sm">Investment</div>
                  <div className="text-xs text-gray-500">By investment date</div>
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Vintage Granularity</Label>
          <RadioGroup
            value={newGranularity}
            onValueChange={(v) => setNewGranularity(v as VintageGranularity)}
            className="grid grid-cols-2 gap-2"
          >
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                newGranularity === 'year'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <RadioGroupItem value="year" className="sr-only" />
              <div>
                <div className="font-medium text-sm">Annual</div>
                <div className="text-xs text-gray-500">Group by year (e.g., 2023)</div>
              </div>
            </label>
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                newGranularity === 'quarter'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <RadioGroupItem value="quarter" className="sr-only" />
              <div>
                <div className="font-medium text-sm">Quarterly</div>
                <div className="text-xs text-gray-500">Group by quarter (e.g., 2023-Q1)</div>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onCreate} disabled={!newName.trim() || isCreating}>
          {isCreating ? 'Creating...' : 'Create View'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default CohortDefinitionSelector;
