/**
 * Bulk Operations Toolbar
 * Provides bulk edit, delete, and status update capabilities for investments
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Edit3, Trash2, Tag, CheckCircle, X, AlertTriangle } from 'lucide-react';

interface Investment {
  id: string;
  company_name: string;
  status: 'Active' | 'Exited' | 'Written Off';
  stage: string;
  sector: string;
  tags?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic investment fields from various sources
  [key: string]: any;
}

interface BulkOperationsToolbarProps {
  selectedInvestments: Investment[];
  onClearSelection: () => void;
  onBulkUpdate: (updates: Partial<Investment>) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkTag: (ids: string[], tags: string[]) => Promise<void>;
}

const INVESTMENT_STAGES = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D+',
  'Growth',
  'Exit',
];
const INVESTMENT_STATUSES = [
  'Active',
  'Exited',
  'Written Off',
  'Under Review',
  'Follow-on Required',
];
const SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer',
  'Industrial',
  'Energy',
  'Real Estate',
  'Other',
];

export const BulkOperationsToolbar: React.FC<BulkOperationsToolbarProps> = ({
  selectedInvestments,
  onClearSelection,
  onBulkUpdate,
  onBulkDelete,
  onBulkTag,
}) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Investment>>({});
  const [newTags, setNewTags] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedCount = selectedInvestments.length;

  if (selectedCount === 0) {
    return null;
  }

  const handleBulkEdit = async () => {
    setIsLoading(true);
    try {
      // Remove empty/undefined values
      const cleanedUpdates = Object.fromEntries(
        Object.entries(editForm).filter(([_, value]) => value !== undefined && value !== '')
      );

      await onBulkUpdate(cleanedUpdates);
      setIsEditModalOpen(false);
      setEditForm({});
    } catch (error) {
      console.error('Bulk edit failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsLoading(true);
    try {
      const ids = selectedInvestments.map((inv) => inv.id);
      await onBulkDelete(ids);
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error('Bulk delete failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkTag = async () => {
    setIsLoading(true);
    try {
      const tags = newTags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      const ids = selectedInvestments.map((inv) => inv.id);
      await onBulkTag(ids, tags);
      setIsTagModalOpen(false);
      setNewTags('');
    } catch (error) {
      console.error('Bulk tagging failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-blue-900">
              {selectedCount} investment{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Edit */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Bulk Edit Investments</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={editForm.status || ''}
                      onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTMENT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Stage</Label>
                    <Select
                      value={editForm.stage || ''}
                      onValueChange={(value) => setEditForm((prev) => ({ ...prev, stage: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTMENT_STAGES.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Sector</Label>
                    <Select
                      value={editForm.sector || ''}
                      onValueChange={(value) => setEditForm((prev) => ({ ...prev, sector: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sector" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTORS.map((sector) => (
                          <SelectItem key={sector} value={sector}>
                            {sector}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Notes (append to existing)</Label>
                    <Textarea
                      value={editForm['notes'] || ''}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes to append"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleBulkEdit} disabled={isLoading} className="flex-1">
                      {isLoading ? 'Updating...' : `Update ${selectedCount} Investments`}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Bulk Tag */}
            <Dialog open={isTagModalOpen} onOpenChange={setIsTagModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Tag className="h-4 w-4" />
                  Tag
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Tags to Investments</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Tags (comma-separated)</Label>
                    <Input
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      placeholder="e.g., high-growth, ai-company, priority"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Enter tags separated by commas. These will be added to all selected
                      investments.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleBulkTag}
                      disabled={isLoading || !newTags.trim()}
                      className="flex-1"
                    >
                      {isLoading ? 'Adding Tags...' : `Tag ${selectedCount} Investments`}
                    </Button>
                    <Button variant="outline" onClick={() => setIsTagModalOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Quick Status Updates */}
            <div className="flex items-center gap-1 border-l pl-2 ml-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => onBulkUpdate({ status: 'Active' })}
              >
                <CheckCircle className="h-4 w-4" />
                Mark Active
              </Button>
            </div>

            {/* Bulk Delete */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-red-700 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-900">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm Bulk Delete
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    Are you sure you want to delete {selectedCount} investment
                    {selectedCount !== 1 ? 's' : ''}? This action cannot be undone.
                  </p>

                  <div className="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
                    {selectedInvestments.map((inv) => (
                      <div key={inv.id} className="text-sm py-1">
                        • {inv.company_name}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="destructive"
                      onClick={handleBulkDelete}
                      disabled={isLoading}
                      className="flex-1"
                    >
                      {isLoading ? 'Deleting...' : `Delete ${selectedCount} Investments`}
                    </Button>
                    <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="gap-1 text-gray-600 hover:text-gray-900"
        >
          <X className="h-4 w-4" />
          Clear Selection
        </Button>
      </div>

      {/* Selected Investment Summary */}
      <div className="mt-3 pt-3 border-t border-blue-200">
        <div className="flex flex-wrap gap-2">
          <div className="text-sm text-blue-700">
            <strong>Companies:</strong>{' '}
            {selectedInvestments
              .slice(0, 3)
              .map((inv) => inv.company_name)
              .join(', ')}
            {selectedCount > 3 && ` and ${selectedCount - 3} more`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkOperationsToolbar;
