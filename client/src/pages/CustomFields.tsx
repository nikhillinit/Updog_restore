/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import CustomFieldsManager, { CustomField } from '@/components/custom-fields/custom-fields-manager';

// Sample custom fields for demonstration
const SAMPLE_CUSTOM_FIELDS: CustomField[] = [
  {
    id: 'field-1',
    name: 'Internal Status',
    type: 'color',
    required: false,
  },
  {
    id: 'field-2',
    name: 'Founding Year',
    type: 'number',
    required: false,
  },
  {
    id: 'field-3',
    name: 'Lead Status',
    type: 'text',
    required: false,
  },
  {
    id: 'field-4',
    name: 'Years of Operation',
    type: 'number',
    required: false,
  },
  {
    id: 'field-5',
    name: 'Internal Code',
    type: 'text',
    required: false,
  },
  {
    id: 'field-6',
    name: 'Internal FMV',
    type: 'number',
    required: false,
  },
  {
    id: 'field-7',
    name: 'Strategic',
    type: 'tags',
    required: false,
  },
  {
    id: 'field-8',
    name: 'Deal Source',
    type: 'text',
    required: false,
  },
];

export default function CustomFields() {
  const { currentFund } = useFundContext();
  const [, setLocation] = useLocation();
  const [customFields, setCustomFields] = useState<CustomField[]>(SAMPLE_CUSTOM_FIELDS);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleFieldsChange = (fields: CustomField[]) => {
    setCustomFields(fields);
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    // Here you would typically save to the backend
    console.log('Saving custom fields:', customFields);
    setHasUnsavedChanges(false);
    
    // Show success message
    // toast.success('Custom fields saved successfully');
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) return;
    }
    setLocation('/investments');
  };

  if (!currentFund) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Please select a fund to manage custom fields.</p>
          <Button className="mt-4" onClick={() => setLocation('/setup')}>
            Set Up Fund
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Investments
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
                <p className="text-sm text-gray-600">
                  Create and manage custom tracking fields for portfolio companies
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {hasUnsavedChanges && (
                <div className="text-sm text-orange-600 bg-orange-50 px-3 py-1 rounded-md">
                  Unsaved changes
                </div>
              )}
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasUnsavedChanges}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <CustomFieldsManager
          fields={customFields}
          onFieldsChange={handleFieldsChange}
        />
      </div>
    </div>
  );
}
