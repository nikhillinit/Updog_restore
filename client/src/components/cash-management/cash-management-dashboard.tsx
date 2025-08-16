/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Calendar, Plus, Download, Filter, Search, Trash2, Edit3, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface CashCategory {
  category: string;
  previousBalance: number;
  weightedRequirements: number;
  currentBalance: number;
}

interface CashTransaction {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'inflow' | 'outflow';
  status: 'completed' | 'pending' | 'scheduled';
}

const CASH_CATEGORIES: CashCategory[] = [
  {
    category: 'Fund Capital Reserves',
    previousBalance: 37795000,
    weightedRequirements: 42450000,
    currentBalance: 45710000
  },
  {
    category: 'Management Fees',
    previousBalance: 2450000,
    weightedRequirements: 2680000,
    currentBalance: 2890000
  },
  {
    category: 'Follow-On Commitments',
    previousBalance: 15840000,
    weightedRequirements: 18200000,
    currentBalance: 19560000
  },
  {
    category: 'Operating Expenses',
    previousBalance: 1250000,
    weightedRequirements: 1350000,
    currentBalance: 1180000
  },
  {
    category: 'Distributions',
    previousBalance: 850000,
    weightedRequirements: 920000,
    currentBalance: 1250000
  }
];

const SAMPLE_TRANSACTIONS: CashTransaction[] = [
  {
    id: '1',
    date: '2024-01-15',
    category: 'Fund Capital Reserves',
    description: 'LP Capital Call - Q1 2024',
    amount: 5000000,
    type: 'inflow',
    status: 'completed'
  },
  {
    id: '2',
    date: '2024-01-12',
    category: 'Follow-On Commitments',
    description: 'TechCorp Series B Follow-On',
    amount: 2500000,
    type: 'outflow',
    status: 'completed'
  },
  {
    id: '3',
    date: '2024-01-10',
    category: 'Management Fees',
    description: 'Q1 Management Fee Payment',
    amount: 450000,
    type: 'outflow',
    status: 'completed'
  },
  {
    id: '4',
    date: '2024-01-20',
    category: 'Operating Expenses',
    description: 'Legal and Administrative Costs',
    amount: 75000,
    type: 'outflow',
    status: 'pending'
  },
  {
    id: '5',
    date: '2024-01-25',
    category: 'Distributions',
    description: 'LP Distribution - DataFlow Exit',
    amount: 1200000,
    type: 'outflow',
    status: 'scheduled'
  }
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatCurrencyShort = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return formatCurrency(amount);
};

export default function CashManagementDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [transactions, setTransactions] = useState<CashTransaction[]>(SAMPLE_TRANSACTIONS);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  const totalCurrentBalance = CASH_CATEGORIES.reduce((sum, cat) => sum + cat.currentBalance, 0);
  const totalWeightedRequirements = CASH_CATEGORIES.reduce((sum, cat) => sum + cat.weightedRequirements, 0);
  const totalPreviousBalance = CASH_CATEGORIES.reduce((sum, cat) => sum + cat.previousBalance, 0);
  
  const balanceChange = totalCurrentBalance - totalPreviousBalance;
  const balanceChangePercent = ((balanceChange / totalPreviousBalance) * 100);

  const filteredTransactions = transactions.filter(transaction => {
    const matchesCategory = filterCategory === 'all' || transaction.category === filterCategory;
    const matchesSearch = transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const AddTransactionDialog = () => {
    const [newTransaction, setNewTransaction] = useState({
      category: '',
      description: '',
      amount: '',
      type: 'outflow' as 'inflow' | 'outflow',
      date: new Date().toISOString().split('T')[0]
    });

    const handleSubmit = () => {
      const transaction: CashTransaction = {
        id: Math.random().toString(36).substr(2, 9),
        ...newTransaction,
        amount: parseFloat(newTransaction.amount),
        status: 'pending'
      };
      setTransactions([transaction, ...transactions]);
      setShowAddTransaction(false);
      setNewTransaction({
        category: '',
        description: '',
        amount: '',
        type: 'outflow',
        date: new Date().toISOString().split('T')[0]
      });
    };

    return (
      <Dialog open={showAddTransaction} onOpenChange={setShowAddTransaction}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Cash Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Transaction Type</Label>
                <Select value={newTransaction.type} onValueChange={(value: 'inflow' | 'outflow') => 
                  setNewTransaction({...newTransaction, type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflow">Cash Inflow</SelectItem>
                    <SelectItem value="outflow">Cash Outflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={newTransaction.category} onValueChange={(value) => 
                setNewTransaction({...newTransaction, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CASH_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.category} value={cat.category}>
                      {cat.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                placeholder="Transaction description"
                value={newTransaction.description}
                onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={newTransaction.amount}
                onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddTransaction(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!newTransaction.category || !newTransaction.description || !newTransaction.amount}>
                Add Transaction
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cash Management</h1>
          <p className="text-gray-600 mt-1">Monitor fund cash flows, track balances, and manage liquidity requirements</p>
        </div>
        <div className="flex items-center space-x-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="q1">Q1 2024</SelectItem>
              <SelectItem value="q4">Q4 2023</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowAddTransaction(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cash Balance</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrencyShort(totalCurrentBalance)}</p>
                <div className="flex items-center mt-1">
                  {balanceChange >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm ${balanceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {balanceChangePercent >= 0 ? '+' : ''}{balanceChangePercent.toFixed(1)}% from last period
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Weighted Requirements</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrencyShort(totalWeightedRequirements)}</p>
                <p className="text-sm text-gray-500 mt-1">Target liquidity needs</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Excess/(Deficit)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencyShort(totalCurrentBalance - totalWeightedRequirements)}
                </p>
                <p className="text-sm text-gray-500 mt-1">vs. requirements</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Categories</p>
                <p className="text-2xl font-bold text-gray-900">{CASH_CATEGORIES.length}</p>
                <p className="text-sm text-gray-500 mt-1">Cash categories</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Cash Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transaction History</TabsTrigger>
          <TabsTrigger value="projections">Cash Projections</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Cash Categories Table */}
          <Card>
            <CardHeader>
              <CardTitle>Cash Categories Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Category</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Previous Balance</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Weighted Requirements</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Current Balance</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-600">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CASH_CATEGORIES.map((category, index) => {
                      const variance = category.currentBalance - category.weightedRequirements;
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium">{category.category}</td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {formatCurrency(category.previousBalance)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {formatCurrency(category.weightedRequirements)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatCurrency(category.currentBalance)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-3 px-4">Total</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalPreviousBalance)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalWeightedRequirements)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalCurrentBalance)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`${(totalCurrentBalance - totalWeightedRequirements) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(totalCurrentBalance - totalWeightedRequirements) >= 0 ? '+' : ''}
                          {formatCurrency(totalCurrentBalance - totalWeightedRequirements)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          {/* Transaction Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CASH_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.category} value={cat.category}>
                        {cat.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Transaction List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        transaction.type === 'inflow' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-gray-600">{transaction.category} • {transaction.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge 
                        variant={transaction.status === 'completed' ? 'default' : 
                                transaction.status === 'pending' ? 'secondary' : 'outline'}
                      >
                        {transaction.status}
                      </Badge>
                      <span className={`font-medium ${
                        transaction.type === 'inflow' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'inflow' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                      <div className="flex items-center space-x-1">
                        <Button variant="ghost" size="sm">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projections" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Projections</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Cash flow projection modeling and scenario analysis coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddTransactionDialog />
    </div>
  );
}
