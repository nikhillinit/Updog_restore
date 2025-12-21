/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit } from 'lucide-react';

export interface CustomField {
  id: string;
  name: string;
  type: 'number' | 'tags' | 'text' | 'color' | 'date';
  required?: boolean;
  options?: string[]; // For tags and color options
  defaultValue?: any;
}

interface CustomFieldsManagerProps {
  fields: CustomField[];
  onFieldsChange: (_fields: CustomField[]) => void;
  className?: string;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'number', label: 'Number' },
  { value: 'tags', label: 'Tags' },
  { value: 'text', label: 'Text' },
  { value: 'color', label: 'Color Codes' },
  { value: 'date', label: 'Dates' },
];

const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b', '#374151', '#1f2937'
];

export default function CustomFieldsManager({ fields, onFieldsChange, className = '' }: CustomFieldsManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [newField, setNewField] = useState<Partial<CustomField>>({
    name: '',
    type: 'text',
    required: false,
  });

  const handleAddField = () => {
    if (!newField.name || !newField.type) return;

    const field: CustomField = {
      id: `field-${Date.now()}`,
      name: newField.name,
      type: newField.type as CustomField['type'],
      required: newField.required || false,
      ...(newField.type === 'color' ? { options: COLOR_PRESETS } : {}),
    };

    onFieldsChange([...fields, field]);
    setNewField({ name: '', type: 'text', required: false });
    setIsAddDialogOpen(false);
  };

  const handleEditField = (field: CustomField) => {
    setEditingField(field);
    setNewField({ ...field });
    setIsAddDialogOpen(true);
  };

  const handleUpdateField = () => {
    if (!editingField || !newField.name || !newField.type) return;

    const updatedFields = fields.map(f => 
      f.id === editingField.id 
        ? { ...f, name: newField.name!, type: newField.type as CustomField['type'], required: newField.required || false }
        : f
    );

    onFieldsChange(updatedFields);
    setNewField({ name: '', type: 'text', required: false });
    setEditingField(null);
    setIsAddDialogOpen(false);
  };

  const handleDeleteField = (fieldId: string) => {
    onFieldsChange(fields.filter(f => f.id !== fieldId));
  };

  const getFieldTypeColor = (type: string) => {
    switch (type) {
      case 'number': return 'bg-blue-100 text-blue-800';
      case 'tags': return 'bg-green-100 text-green-800';
      case 'text': return 'bg-gray-100 text-gray-800';
      case 'color': return 'bg-purple-100 text-purple-800';
      case 'date': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Custom Fields Definitions</h2>
          <p className="text-sm text-gray-600 mt-1">
            Custom Fields are used to add additional information to an investment. For example, you may want to add additional tags to an investment to help you filter and sort your investments, or create a color field to help you visually identify investments.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingField ? 'Edit Custom Field' : 'Add Custom Field'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="field-name">Field Name</Label>
                <Input
                  id="field-name"
                  value={newField.name || ''}
                  onChange={(e: any) => setNewField({ ...newField, name: e.target.value })}
                  placeholder="e.g., Internal Status"
                />
              </div>
              <div>
                <Label htmlFor="field-type">Field Type</Label>
                <Select
                  value={newField.type || 'text'}
                  onValueChange={(value: any) => setNewField({ ...newField, type: value as CustomField['type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  setEditingField(null);
                  setNewField({ name: '', type: 'text', required: false });
                }}>
                  Cancel
                </Button>
                <Button onClick={editingField ? handleUpdateField : handleAddField}>
                  {editingField ? 'Update' : 'Add Field'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Fields List */}
      <Card>
        <CardContent className="p-6">
          {fields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No custom fields defined yet.</p>
              <p className="text-sm">Click "Add Field" to create your first custom field.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field: any) => (
                <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium text-gray-900">{field.name}</div>
                      <Badge className={getFieldTypeColor(field.type)}>
                        {FIELD_TYPE_OPTIONS.find(opt => opt.value === field.type)?.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditField(field)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteField(field.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                These fields will appear in the Custom Fields section when editing investments:
              </p>
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-medium mb-3">Custom Fields</h4>
                <div className="space-y-3">
                  {fields.map((field: any) => (
                    <div key={field.id} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{field.name}</span>
                      <div className="flex items-center space-x-2">
                        {field.type === 'color' && (
                          <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {FIELD_TYPE_OPTIONS.find(opt => opt.value === field.type)?.label}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
