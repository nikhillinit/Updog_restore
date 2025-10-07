/**
 * Expense List Component
 *
 * Manages additional granular expenses with add/remove functionality.
 * Supports one-time and annual expense types.
 *
 * Features:
 * - Add/remove expense items
 * - Type selection (one-time vs annual)
 * - Year input for one-time expenses
 * - Optional description field
 * - Validation and error display
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type ExpenseItem = {
  id: string;
  name: string;
  amount: number;
  type?: 'one-time' | 'annual';
  description?: string;
  year?: number;
};

export interface ExpenseListProps {
  expenses: ExpenseItem[];
  onChange: (expenses: ExpenseItem[]) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ExpenseList({ expenses, onChange }: ExpenseListProps) {
  const addExpense = () => {
    const newExpense: ExpenseItem = {
      id: `expense-${Date.now()}`,
      name: '',
      amount: 0,
      type: 'one-time',
      year: 1
    };
    onChange([...expenses, newExpense]);
  };

  const removeExpense = (id: string) => {
    onChange(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, updates: Partial<ExpenseItem>) => {
    onChange(
      expenses.map(e =>
        e.id === id ? { ...e, ...updates } : e
      )
    );
  };

  if (expenses.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 bg-charcoal-50 rounded-lg border-2 border-dashed border-charcoal-200">
          <p className="text-charcoal-600 font-poppins text-sm mb-4">
            No additional expenses added yet
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={addExpense}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {expenses.map((expense, index) => (
        <div
          key={expense.id}
          className="bg-white rounded-lg border border-charcoal-200 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-inter font-bold text-charcoal-600">
              Expense {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeExpense(expense.id)}
              className="text-error hover:text-error hover:bg-error/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Expense Name */}
            <div>
              <Label className="font-poppins text-charcoal-700">
                Name *
              </Label>
              <Input
                type="text"
                placeholder="e.g., Legal Fees"
                value={expense.name}
                onChange={(e) => updateExpense(expense.id, { name: e.target.value })}
                className="mt-2"
              />
            </div>

            {/* Amount */}
            <div>
              <Label className="font-poppins text-charcoal-700">
                Amount ($M) *
              </Label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500 font-poppins">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.50"
                  value={expense.amount || ''}
                  onChange={(e) => updateExpense(expense.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="pl-7"
                />
              </div>
            </div>

            {/* Expense Type */}
            <div>
              <Label className="font-poppins text-charcoal-700">
                Type *
              </Label>
              <Select
                value={expense.type}
                onValueChange={(value) =>
                  updateExpense(expense.id, { type: value as 'one-time' | 'annual' })
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-time">One-time</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Year (only for one-time expenses) */}
            {expense.type === 'one-time' && (
              <div>
                <Label className="font-poppins text-charcoal-700">
                  Year *
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="1"
                  value={expense.year || ''}
                  onChange={(e) => updateExpense(expense.id, { year: parseInt(e.target.value) || 1 })}
                  className="mt-2"
                />
              </div>
            )}
          </div>

          {/* Optional Description */}
          <div>
            <Label className="font-poppins text-charcoal-700">
              Description (optional)
            </Label>
            <Input
              type="text"
              placeholder="Additional details about this expense"
              value={expense.description || ''}
              onChange={(e) => updateExpense(expense.id, { description: e.target.value })}
              className="mt-2"
            />
          </div>
        </div>
      ))}

      {/* Add More Button */}
      {expenses.length < 20 && (
        <Button
          type="button"
          variant="outline"
          onClick={addExpense}
          className="w-full gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Another Expense
        </Button>
      )}

      {expenses.length >= 20 && (
        <p className="text-sm text-charcoal-600 font-poppins text-center">
          Maximum of 20 expenses reached
        </p>
      )}
    </div>
  );
}
