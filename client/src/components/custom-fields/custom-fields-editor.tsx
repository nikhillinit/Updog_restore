import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { CalendarIcon, Tag, X } from 'lucide-react';
import { CustomField } from './custom-fields-manager';

interface CustomFieldValue {
  fieldId: string;
  value: string | number | boolean | Date | string[];
}

interface CustomFieldsEditorProps {
  fields: CustomField[];
  values: CustomFieldValue[];
  onValuesChange: (values: CustomFieldValue[]) => void;
  className?: string;
}

const COLOR_PRESETS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#84cc16', label: 'Lime' },
  { value: '#22c55e', label: 'Green' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#0ea5e9', label: 'Sky' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#d946ef', label: 'Fuchsia' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#64748b', label: 'Slate' },
  { value: '#374151', label: 'Gray' },
  { value: '#1f2937', label: 'Dark Gray' },
];

export default function CustomFieldsEditor({ fields, values, onValuesChange, className = '' }: CustomFieldsEditorProps) {
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  const getFieldValue = (fieldId: string) => {
    const fieldValue = values.find(v => v.fieldId === fieldId);
    return fieldValue?.value;
  };

  const updateFieldValue = (fieldId: string, value: string | number | boolean | Date | string[]) => {
    const updatedValues = values.filter(v => v.fieldId !== fieldId);
    if (value !== undefined && value !== null && value !== '') {
      updatedValues.push({ fieldId, value });
    }
    onValuesChange(updatedValues);
  };

  const addTag = (fieldId: string) => {
    const tagInput = tagInputs[fieldId]?.trim();
    if (!tagInput) return;

    const currentTags = (getFieldValue(fieldId) as string[]) || [];
    if (!currentTags.includes(tagInput)) {
      updateFieldValue(fieldId, [...currentTags, tagInput]);
    }
    setTagInputs({ ...tagInputs, [fieldId]: '' });
  };

  const removeTag = (fieldId: string, tagToRemove: string) => {
    const currentTags = (getFieldValue(fieldId) as string[]) || [];
    updateFieldValue(fieldId, currentTags.filter((tag: string) => tag !== tagToRemove));
  };

  const handleTagInputKeyPress = (fieldId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(fieldId);
    }
  };

  const renderFieldInput = (field: CustomField) => {
    const value = getFieldValue(field.id);

    switch (field.type) {
      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => updateFieldValue(field.id, parseFloat(e.target.value) || '')}
            placeholder="Enter a number"
          />
        );

      case 'text':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            placeholder="Enter text"
            rows={2}
          />
        );

      case 'tags':
        const tags = value || [];
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: string, index: number) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-red-600"
                    onClick={() => removeTag(field.id, tag)}
                  />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInputs[field.id] || ''}
                onChange={(e) => setTagInputs({ ...tagInputs, [field.id]: e.target.value })}
                onKeyPress={(e) => handleTagInputKeyPress(field.id, e)}
                placeholder="Type and press Enter to add tag"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(field.id)}
                disabled={!tagInputs[field.id]?.trim()}
              >
                <Tag className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'color':
        return (
          <div className="space-y-2">
            <Select
              value={value || ''}
              onValueChange={(selectedColor) => updateFieldValue(field.id, selectedColor)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a color">
                  {value && (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: value }}
                      />
                      {COLOR_PRESETS.find(c => c.value === value)?.label || value}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COLOR_PRESETS.map(color => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: color.value }}
                      />
                      {color.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => updateFieldValue(field.id, date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      default:
        return null;
    }
  };

  if (fields.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-gray-500">
          <p>No custom fields defined.</p>
          <p className="text-sm mt-1">Define custom fields in the Custom Fields management section.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Custom Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="flex items-center gap-2">
              {field.name}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            {renderFieldInput(field)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}