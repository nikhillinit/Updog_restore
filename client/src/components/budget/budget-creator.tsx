/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Calculator,
  Trash2
} from "lucide-react";

interface ExpenseCategory {
  id: string;
  category: string;
  lifetimeExpense: number;
  expenseRatio: number;
  term: number;
  isCustom?: boolean;
}

interface BudgetCreatorProps {
  fundSize?: number;
  onBudgetCreate?: (_budget: ExpenseCategory[]) => void;
  className?: string;
}

export default function BudgetCreator({ fundSize = 200000000, onBudgetCreate, className }: BudgetCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseRatio, setNewExpenseRatio] = useState("");
  const [newExpenseTerm, setNewExpenseTerm] = useState("120");

  // Standard expense categories based on common fund ratios
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([
    {
      id: "legal",
      category: "Legal",
      lifetimeExpense: 400000,
      expenseRatio: 0.20,
      term: 60
    },
    {
      id: "administration",
      category: "Administration", 
      lifetimeExpense: 1500000,
      expenseRatio: 0.75,
      term: 120
    },
    {
      id: "tax",
      category: "Tax",
      lifetimeExpense: 160000,
      expenseRatio: 0.08,
      term: 120
    },
    {
      id: "audit",
      category: "Audit",
      lifetimeExpense: 600000,
      expenseRatio: 0.30,
      term: 120
    },
    {
      id: "software",
      category: "Software",
      lifetimeExpense: 300000,
      expenseRatio: 0.15,
      term: 60
    },
    {
      id: "setup",
      category: "Setup",
      lifetimeExpense: 500000,
      expenseRatio: 0.25,
      term: 1
    },
    {
      id: "other",
      category: "Other",
      lifetimeExpense: 1200000,
      expenseRatio: 0.60,
      term: 120
    }
  ]);

  const totalExpense = expenseCategories.reduce((sum: any, cat: any) => sum + cat.lifetimeExpense, 0);
  const totalRatio = expenseCategories.reduce((sum: any, cat: any) => sum + cat.expenseRatio, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (ratio: number) => `${ratio.toFixed(2)}%`;

  const handleExpenseChange = (id: string, field: keyof ExpenseCategory, value: string | number) => {
    setExpenseCategories(prev => prev.map(cat => {
      if (cat.id === id) {
        const updated = { ...cat, [field]: value };
        
        // Auto-calculate ratio when expense changes
        if (field === 'lifetimeExpense') {
          updated.expenseRatio = (Number(value) / fundSize) * 100;
        }
        // Auto-calculate expense when ratio changes
        if (field === 'expenseRatio') {
          updated.lifetimeExpense = (Number(value) / 100) * fundSize;
        }
        
        return updated;
      }
      return cat;
    }));
  };

  const handleAddCustomExpense = () => {
    if (!newExpenseCategory || !newExpenseAmount) return;

    const amount = parseFloat(newExpenseAmount);
    const ratio = parseFloat(newExpenseRatio) || (amount / fundSize) * 100;
    const term = parseInt(newExpenseTerm) || 120;

    const newExpense: ExpenseCategory = {
      id: `custom-${Date.now()}`,
      category: newExpenseCategory,
      lifetimeExpense: amount,
      expenseRatio: ratio,
      term: term,
      isCustom: true
    };

    setExpenseCategories(prev => [...prev, newExpense]);
    
    // Reset form
    setNewExpenseCategory("");
    setNewExpenseAmount("");
    setNewExpenseRatio("");
    setNewExpenseTerm("120");
  };

  const handleRemoveExpense = (id: string) => {
    setExpenseCategories(prev => prev.filter(cat => cat.id !== id));
  };

  const handleCreateBudget = () => {
    if (onBudgetCreate) {
      onBudgetCreate(expenseCategories);
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center space-x-2">
          <Calculator className="h-4 w-4" />
          <span>Create Budget</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Calculator className="h-5 w-5" />
            <span>Budget Creator</span>
          </DialogTitle>
          <DialogDescription>
            These are estimated expense ratios based on standard funds. Your actual budget categories and estimated expenses may vary depending on the specific circumstances of your fund.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Expense Categories Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Lifetime Expense</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Expense Ratio (%)</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Term</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenseCategories.map((category: any) => (
                  <tr key={category.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{category.category}</span>
                        {category.isCustom && (
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        )}
                      </div>
                    </td>
                    
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <Input
                          type="number"
                          value={category.lifetimeExpense}
                          onChange={(e: any) => handleExpenseChange(category.id, 'lifetimeExpense', parseFloat(e.target.value) || 0)}
                          className="w-32 bg-yellow-50 border-yellow-300"
                        />
                      </div>
                    </td>
                    
                    <td className="py-3 px-4">
                      <span className="font-medium">{formatPercent(category.expenseRatio)}</span>
                    </td>
                    
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          value={category.term}
                          onChange={(e: any) => handleExpenseChange(category.id, 'term', parseInt(e.target.value) || 1)}
                          className="w-16 bg-yellow-50 border-yellow-300"
                        />
                        <span className="text-gray-500 text-sm">months</span>
                      </div>
                    </td>
                    
                    <td className="py-3 px-4">
                      {category.isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveExpense(category.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                
                {/* Totals Row */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="py-4 px-4 font-bold text-gray-900">Total</td>
                  <td className="py-4 px-4 font-bold text-gray-900">{formatCurrency(totalExpense)}</td>
                  <td className="py-4 px-4 font-bold text-gray-900">{formatPercent(totalRatio)}</td>
                  <td className="py-4 px-4"></td>
                  <td className="py-4 px-4"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Add Custom Expense */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-blue-900">
                <Plus className="h-5 w-5" />
                <span>Add Custom Expense Category</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="category-name">Category Name</Label>
                  <Input
                    id="category-name"
                    value={newExpenseCategory}
                    onChange={(e: any) => setNewExpenseCategory(e.target.value)}
                    placeholder="e.g., Marketing"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="expense-amount">Lifetime Expense ($)</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    value={newExpenseAmount}
                    onChange={(e: any) => setNewExpenseAmount(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="expense-term">Term (months)</Label>
                  <Input
                    id="expense-term"
                    type="number"
                    value={newExpenseTerm}
                    onChange={(e: any) => setNewExpenseTerm(e.target.value)}
                    placeholder="120"
                    className="mt-1"
                  />
                </div>
                
                <div className="flex items-end">
                  <Button onClick={handleAddCustomExpense} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Category
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget Summary */}
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">{formatCurrency(totalExpense)}</div>
                  <div className="text-sm text-green-700">Total Lifetime Expenses</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">{formatPercent(totalRatio)}</div>
                  <div className="text-sm text-green-700">Total Expense Ratio</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">{expenseCategories.length}</div>
                  <div className="text-sm text-green-700">Expense Categories</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBudget} className="bg-blue-600 hover:bg-blue-700">
              Create Budget
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
