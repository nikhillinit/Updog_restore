import React from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, AlertCircle, DollarSign, Check } from "lucide-react";
import { useFundSelector, useFundActions } from '@/stores/useFundSelector';
import { useFundContext } from '@/contexts/FundContext';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { spreadIfDefined } from '@/lib/spreadIfDefined';
import type { FundExpense } from '@/stores/fundStore';
import type { ExpenseCategory } from '@shared/types';

// Default expense categories for VC funds
const DEFAULT_EXPENSE_CATEGORIES: Array<{
  category: ExpenseCategory;
  label: string;
  description: string;
  defaultAmount?: number;
}> = [
  { category: 'legal', label: 'Legal & Regulatory', description: 'Legal fees, regulatory compliance', defaultAmount: 15000 },
  { category: 'audit', label: 'Audit & Tax', description: 'Annual audit, tax preparation', defaultAmount: 25000 },
  { category: 'administration', label: 'Fund Administration', description: 'Administrator fees, reporting', defaultAmount: 20000 },
  { category: 'custodian', label: 'Custodian & Banking', description: 'Custody fees, banking costs', defaultAmount: 5000 },
  { category: 'consulting', label: 'Consulting & Advisory', description: 'Strategic consulting, board fees', defaultAmount: 10000 },
  { category: 'technology', label: 'Technology & Systems', description: 'Software, infrastructure', defaultAmount: 8000 },
  { category: 'insurance', label: 'Insurance', description: 'D&O, E&O insurance', defaultAmount: 12000 },
  { category: 'travel', label: 'Travel & Entertainment', description: 'Business travel, LP meetings', defaultAmount: 6000 },
  { category: 'office', label: 'Office & Operations', description: 'Rent, utilities, office supplies', defaultAmount: 18000 },
  { category: 'due_diligence', label: 'Due Diligence', description: 'Investment research, expert calls', defaultAmount: 15000 },
];

export default function CashflowManagementStep() {
  const [, navigate] = useLocation();

  // Get fund size from context
  const { currentFund } = useFundContext();
  const fundSize = currentFund?.size ? currentFund.size / 1000000 : 50; // Convert to millions for calculations
  const fundExpenses = useFundSelector(s => s.fundExpenses);

  // Actions
  const { addFundExpense, updateFundExpense, removeFundExpense } = useFundActions(s => ({
    addFundExpense: s.addFundExpense,
    updateFundExpense: s.updateFundExpense,
    removeFundExpense: s.removeFundExpense,
  }));

  // Local state for cashflow settings
  const [cashflowConfig, setCashflowConfig] = React.useState({
    enableCashflowTracking: true,
    enableAutomaticCapitalCalls: false,
    enableExpenseTracking: true,
    capitalCallNoticeDays: 10,
    capitalCallPaymentDays: 30,
    minimumCashRatio: 5, // percentage
    forecastHorizonMonths: 12,
  });

  // Local state for new expense form
  const [newExpense, setNewExpense] = React.useState({
    category: 'legal' as ExpenseCategory,
    monthlyAmount: 0,
    startMonth: 1,
    endMonth: undefined as number | undefined,
    isRecurring: true,
  });

  // Calculate total annual expenses
  const totalAnnualExpenses = React.useMemo(() => {
    return fundExpenses.reduce((total, expense) => {
      const months = expense.endMonth ? (expense.endMonth - expense.startMonth + 1) : 12;
      return total + (expense.monthlyAmount * months);
    }, 0);
  }, [fundExpenses]);

  // Calculate as percentage of fund size
  const expenseRatio = React.useMemo(() => {
    if (!fundSize || fundSize === 0) return 0;
    return (totalAnnualExpenses / (fundSize * 1000000)) * 100;
  }, [totalAnnualExpenses, fundSize]);

  // Auto-populate with default expenses if none exist
  React.useEffect(() => {
    if (fundExpenses.length === 0 && fundSize) {
      // Add a few key expense categories automatically
      const keyExpenses = DEFAULT_EXPENSE_CATEGORIES.slice(0, 5);
      keyExpenses.forEach((expenseTemplate, index) => {
        const baseAmount = expenseTemplate.defaultAmount || 10000;
        // Scale based on fund size (larger funds have higher expenses)
        const scaleFactor = Math.min(Math.max(fundSize / 100, 0.5), 3);
        const monthlyAmount = Math.round((baseAmount * scaleFactor) / 12);

        const expense: FundExpense = {
          id: `auto-${expenseTemplate.category}-${index}`,
          category: expenseTemplate.label,
          monthlyAmount,
          startMonth: 1,
        };
        // Ongoing expense, no endMonth
        addFundExpense(expense);
      });
    }
  }, [fundExpenses.length, fundSize, addFundExpense]);

  const handleAddExpense = () => {
    const baseExpense: FundExpense = {
      id: `expense-${Date.now()}`,
      category: newExpense.category,
      monthlyAmount: newExpense.monthlyAmount,
      startMonth: newExpense.startMonth,
    };

    // Only add endMonth for fixed-term expenses
    const expense = newExpense.isRecurring
      ? baseExpense
      : { ...baseExpense, ...spreadIfDefined("endMonth", newExpense.endMonth) };

    addFundExpense(expense);

    // Reset form
    setNewExpense({
      category: 'legal',
      monthlyAmount: 0,
      startMonth: 1,
      endMonth: undefined,
      isRecurring: true,
    });
  };

  const handleUpdateExpense = (id: string, field: keyof FundExpense, value: any) => {
    updateFundExpense(id, { [field]: value });
  };

  const handleRemoveExpense = (id: string) => {
    removeFundExpense(id);
  };

  const handleNext = () => {
    // Fund setup is complete, navigate to dashboard
    alert('Fund setup complete! Redirecting to dashboard...');
    navigate('/dashboard');
  };

  const handlePrevious = () => {
    navigate('/fund-setup?step=4');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-inter font-bold text-[#292929]">Cashflow & Liquidity Management</h1>
        <p className="text-[#292929]/70 font-poppins">
          Configure cashflow tracking, expense management, and liquidity monitoring for your fund.
        </p>
      </div>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="capital-calls">Capital Calls</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Fund Operating Expenses
              </CardTitle>
              <CardDescription>
                Track recurring and one-time fund expenses including legal, audit, and operational costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-[#F2F2F2] rounded-xl">
                <div className="text-center">
                  <div className="text-2xl font-inter font-bold text-[#292929]">
                    ${totalAnnualExpenses.toLocaleString()}
                  </div>
                  <div className="text-sm text-[#292929]/60 font-poppins">Annual Expenses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-inter font-bold text-[#292929]">
                    {expenseRatio.toFixed(1)}%
                  </div>
                  <div className="text-sm text-[#292929]/60 font-poppins">of Fund Size</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-inter font-bold text-[#292929]">
                    {fundExpenses.length}
                  </div>
                  <div className="text-sm text-[#292929]/60 font-poppins">Expense Categories</div>
                </div>
              </div>

              {/* Expense List */}
              <div className="space-y-4">
                <h3 className="text-lg font-inter font-bold text-[#292929]">Current Expenses</h3>
                {fundExpenses.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No expenses configured yet. Add your first expense below.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {fundExpenses.map((expense, index) => (
                      <div key={expense.id} className="flex items-center gap-4 p-3 border border-[#E0D8D1] rounded-xl">
                        <div className="flex-1">
                          <div className="font-poppins font-medium text-[#292929]">{expense.category}</div>
                          <div className="text-sm text-[#292929]/60 font-poppins">
                            {expense.endMonth ?
                              `Months ${expense.startMonth}-${expense.endMonth}` :
                              `Starting month ${expense.startMonth}, ongoing`
                            }
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-poppins font-medium text-[#292929]">${expense.monthlyAmount.toLocaleString()}/mo</div>
                          <div className="text-sm text-[#292929]/60 font-poppins">
                            ${(expense.monthlyAmount * 12).toLocaleString()}/yr
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveExpense(expense.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Expense */}
              <div className="space-y-4 p-4 border border-[#E0D8D1] rounded-xl">
                <h3 className="text-lg font-inter font-bold text-[#292929]">Add New Expense</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="font-poppins font-medium text-[#292929]">Category</Label>
                    <Select value={newExpense.category} onValueChange={(v) => setNewExpense(prev => ({ ...prev, category: v as ExpenseCategory }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_EXPENSE_CATEGORIES.map(cat => (
                          <SelectItem key={cat.category} value={cat.category}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-poppins font-medium text-[#292929]">Monthly Amount</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newExpense.monthlyAmount || ''}
                      onChange={(e) => setNewExpense(prev => ({ ...prev, monthlyAmount: parseInt(e.target.value) || 0 }))}
                      className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-poppins font-medium text-[#292929]">Start Month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="120"
                      value={newExpense.startMonth}
                      onChange={(e) => setNewExpense(prev => ({ ...prev, startMonth: parseInt(e.target.value) || 1 }))}
                      className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-poppins font-medium text-[#292929]">Duration</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newExpense.isRecurring}
                        onCheckedChange={(checked) => setNewExpense(prev => ({ ...prev, isRecurring: checked, endMonth: checked ? undefined : 12 }))}
                      />
                      <span className="text-sm font-poppins text-[#292929]">{newExpense.isRecurring ? 'Ongoing' : 'Fixed term'}</span>
                    </div>
                    {!newExpense.isRecurring && (
                      <Input
                        type="number"
                        placeholder="End month"
                        value={newExpense.endMonth || ''}
                        onChange={(e) => setNewExpense(prev => ({ ...prev, endMonth: parseInt(e.target.value) || undefined }))}
                        className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                      />
                    )}
                  </div>
                </div>

                <Button onClick={handleAddExpense} disabled={!newExpense.monthlyAmount} className="bg-[#292929] hover:bg-[#292929]/90 font-poppins font-medium">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Expense
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Capital Calls Tab */}
        <TabsContent value="capital-calls" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Capital Call Settings</CardTitle>
              <CardDescription>
                Configure automatic capital call generation and timing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-poppins font-medium text-[#292929]">Notice Period (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="90"
                    value={cashflowConfig.capitalCallNoticeDays}
                    onChange={(e) => setCashflowConfig(prev => ({ ...prev, capitalCallNoticeDays: parseInt(e.target.value) || 10 }))}
                    className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                  />
                  <p className="text-sm text-[#292929]/60 font-poppins">
                    Days between capital call notice and due date
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-poppins font-medium text-[#292929]">Payment Period (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={cashflowConfig.capitalCallPaymentDays}
                    onChange={(e) => setCashflowConfig(prev => ({ ...prev, capitalCallPaymentDays: parseInt(e.target.value) || 30 }))}
                    className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                  />
                  <p className="text-sm text-[#292929]/60 font-poppins">
                    Days LPs have to fund capital calls
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border border-[#E0D8D1] rounded-xl">
                <div>
                  <h4 className="font-poppins font-medium text-[#292929]">Automatic Capital Calls</h4>
                  <p className="text-sm text-[#292929]/60 font-poppins">
                    Generate capital calls automatically based on investment pipeline
                  </p>
                </div>
                <Switch
                  checked={cashflowConfig.enableAutomaticCapitalCalls}
                  onCheckedChange={(checked) => setCashflowConfig(prev => ({ ...prev, enableAutomaticCapitalCalls: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Liquidity Tab */}
        <TabsContent value="liquidity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Liquidity Monitoring</CardTitle>
              <CardDescription>
                Set up liquidity thresholds and monitoring parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-poppins font-medium text-[#292929]">Minimum Cash Ratio (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={cashflowConfig.minimumCashRatio}
                    onChange={(e) => setCashflowConfig(prev => ({ ...prev, minimumCashRatio: parseFloat(e.target.value) || 5 }))}
                    className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                  />
                  <p className="text-sm text-[#292929]/60 font-poppins">
                    Minimum cash as % of fund size
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-poppins font-medium text-[#292929]">Forecast Horizon (Months)</Label>
                  <Input
                    type="number"
                    min="3"
                    max="60"
                    value={cashflowConfig.forecastHorizonMonths}
                    onChange={(e) => setCashflowConfig(prev => ({ ...prev, forecastHorizonMonths: parseInt(e.target.value) || 12 }))}
                    className="border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                  />
                  <p className="text-sm text-[#292929]/60 font-poppins">
                    How far ahead to project cashflows
                  </p>
                </div>
              </div>

              {/* Liquidity Alerts */}
              <div className="space-y-3">
                <h4 className="font-poppins font-medium text-[#292929]">Alert Thresholds</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-xl">
                    <div>
                      <span className="font-poppins font-medium text-yellow-600">Low Liquidity Warning</span>
                      <p className="text-sm text-[#292929]/60 font-poppins">Alert when cash falls below 2% of fund size</p>
                    </div>
                    <Badge variant="outline" className="text-yellow-600">2%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-xl">
                    <div>
                      <span className="font-poppins font-medium text-red-600">Critical Liquidity Alert</span>
                      <p className="text-sm text-[#292929]/60 font-poppins">Alert when cash falls below 1% of fund size</p>
                    </div>
                    <Badge variant="outline" className="text-red-600">1%</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cashflow Management Settings</CardTitle>
              <CardDescription>
                Configure overall cashflow tracking and integration settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-[#E0D8D1] rounded-xl">
                  <div>
                    <h4 className="font-poppins font-medium text-[#292929]">Enable Cashflow Tracking</h4>
                    <p className="text-sm text-[#292929]/60 font-poppins">
                      Track all fund cash inflows and outflows
                    </p>
                  </div>
                  <Switch
                    checked={cashflowConfig.enableCashflowTracking}
                    onCheckedChange={(checked) => setCashflowConfig(prev => ({ ...prev, enableCashflowTracking: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-[#E0D8D1] rounded-xl">
                  <div>
                    <h4 className="font-poppins font-medium text-[#292929]">Enable Expense Tracking</h4>
                    <p className="text-sm text-[#292929]/60 font-poppins">
                      Detailed tracking of fund operating expenses
                    </p>
                  </div>
                  <Switch
                    checked={cashflowConfig.enableExpenseTracking}
                    onCheckedChange={(checked) => setCashflowConfig(prev => ({ ...prev, enableExpenseTracking: checked }))}
                  />
                </div>

                {/* Integration Settings */}
                <div className="space-y-3">
                  <h4 className="font-poppins font-medium text-[#292929]">Integrations</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-xl">
                      <div>
                        <span className="font-poppins font-medium text-[#292929]">Banking API</span>
                        <p className="text-sm text-[#292929]/60 font-poppins">Real-time bank balance sync</p>
                      </div>
                      <Badge variant="outline">Coming Soon</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-xl">
                      <div>
                        <span className="font-poppins font-medium text-[#292929]">Portfolio Company Reporting</span>
                        <p className="text-sm text-[#292929]/60 font-poppins">Automatic distribution forecasting</p>
                      </div>
                      <Switch checked={true} disabled />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <Button
          data-testid="previous-step"
          variant="outline"
          onClick={handlePrevious}
          className="border-[#E0D8D1] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        <Button
          data-testid="finish-setup"
          onClick={handleNext}
          className="bg-green-600 hover:bg-green-700 font-poppins font-medium"
        >
          <Check className="h-4 w-4 mr-2" />
          Complete Setup
        </Button>
      </div>
    </div>
  );
}