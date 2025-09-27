/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Search, 
  Calendar, 
  TrendingUp, 
  ChevronDown,
  Eye,
  BarChart3,
  Edit2,
  Upload
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Investment {
  id: string;
  name: string;
  status: 'Active' | 'Realized' | 'Written Off';
  stage: string;
  currentStage: string;
  investmentDate: string;
  invested: number;
  moic: number;
  ownership: number;
  currentValue: number;
  irr?: number;
}

const SAMPLE_INVESTMENTS: Investment[] = [
  {
    id: '1',
    name: 'AlphaTech',
    status: 'Active',
    stage: 'Series A',
    currentStage: 'Series B',
    investmentDate: 'Jan 2021',
    invested: 2400000,
    moic: 1.85,
    ownership: 4.2,
    currentValue: 4440000,
    irr: 42.3
  },
  {
    id: '2',
    name: 'Amplio',
    status: 'Active',
    stage: 'Series A',
    currentStage: 'Series A',
    investmentDate: 'Jan 2021',
    invested: 2400000,
    moic: 1.65,
    ownership: 3.8,
    currentValue: 3960000,
    irr: 28.7
  },
  {
    id: '3',
    name: 'Cybros',
    status: 'Active',
    stage: 'Seed',
    currentStage: 'Seed',
    investmentDate: 'Jan 2021',
    invested: 1200000,
    moic: 2.15,
    ownership: 5.2,
    currentValue: 2580000,
    irr: 65.4
  },
  {
    id: '4',
    name: 'DigitalWave',
    status: 'Active',
    stage: 'Seed',
    currentStage: 'Seed',
    investmentDate: 'Dec 2021',
    invested: 1500000,
    moic: 1.45,
    ownership: 4.8,
    currentValue: 2175000,
    irr: 18.9
  },
  {
    id: '5',
    name: 'EchelonTech',
    status: 'Realized',
    stage: 'Seed',
    currentStage: 'Exit',
    investmentDate: 'Jan 2021',
    invested: 1000000,
    moic: 3.25,
    ownership: 0,
    currentValue: 3250000,
    irr: 89.2
  }
];

export default function InvestmentsLayout() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');

  const filteredInvestments = SAMPLE_INVESTMENTS.filter(investment => {
    const matchesSearch = investment.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || investment.status === selectedStatus;
    const matchesStage = selectedStage === 'all' || investment.stage === selectedStage;
    return matchesSearch && matchesStatus && matchesStage;
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      'Active': 'bg-blue-100 text-blue-800 border-blue-200',
      'Realized': 'bg-green-100 text-green-800 border-green-200',
      'Written Off': 'bg-red-100 text-red-800 border-red-200'
    };
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number, decimals = 1) => {
    return `${value.toFixed(decimals)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tactyc Ventures II L.P. / Investments</h1>
          <p className="text-gray-600 mt-1">View and manage investments</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="direct" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="direct" className="text-sm">Direct Investments</TabsTrigger>
          <TabsTrigger value="fund" className="text-sm">Fund Investments</TabsTrigger>
        </TabsList>

        <TabsContent value="direct" className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add Investment
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
            
            <Button variant="outline" className="text-gray-700 border-gray-300">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" className="text-gray-600">
                <Calendar className="h-4 w-4 mr-1" />
                Upcoming Rounds
              </Button>
              
              <Button variant="outline" size="sm" className="text-gray-600">
                <BarChart3 className="h-4 w-4 mr-1" />
                Planning View
              </Button>
              
              <Button variant="outline" size="sm" className="text-gray-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                FMV Update
              </Button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-4 py-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by company name. Press Enter to search."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white border-gray-300"
              />
            </div>
            
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Realized">Realized</SelectItem>
                <SelectItem value="Written Off">Written Off</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="Seed">Seed</SelectItem>
                <SelectItem value="Series A">Series A</SelectItem>
                <SelectItem value="Series B">Series B</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Investments Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12">Actions</TableHead>
                  <TableHead className="font-medium">Name</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="font-medium">Investment Date</TableHead>
                  <TableHead className="font-medium">Entry Stage</TableHead>
                  <TableHead className="font-medium">Current Stage</TableHead>
                  <TableHead className="font-medium text-right">Invested</TableHead>
                  <TableHead className="font-medium text-right">Current Value</TableHead>
                  <TableHead className="font-medium text-right">MOIC</TableHead>
                  <TableHead className="font-medium text-right">IRR</TableHead>
                  <TableHead className="font-medium text-right">Ownership</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvestments.map((investment: any) => (
                  <TableRow key={investment.id} className="hover:bg-gray-50 cursor-pointer">
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <BarChart3 className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Edit2 className="h-4 w-4 text-gray-500" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <a 
                        href={`/investments/company/${investment.id}`}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        {investment.name}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs border", getStatusBadge(investment.status))}>
                        {investment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{investment.investmentDate}</TableCell>
                    <TableCell className="text-gray-600">{investment.stage}</TableCell>
                    <TableCell className="text-gray-600">{investment.currentStage}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(investment.invested)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(investment.currentValue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={cn(
                        investment.moic >= 2 ? "text-green-600" : 
                        investment.moic >= 1 ? "text-blue-600" : "text-red-600"
                      )}>
                        {investment.moic.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {investment.irr ? (
                        <span className={cn(
                          investment.irr >= 30 ? "text-green-600" : 
                          investment.irr >= 15 ? "text-blue-600" : "text-red-600"
                        )}>
                          {formatPercent(investment.irr)}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPercent(investment.ownership)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">5</div>
                <p className="text-sm text-gray-600">Total Investments</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{formatCurrency(8500000)}</div>
                <p className="text-sm text-gray-600">Total Invested</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{formatCurrency(16405000)}</div>
                <p className="text-sm text-gray-600">Current Portfolio Value</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">1.93x</div>
                <p className="text-sm text-gray-600">Average MOIC</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="fund">
          <div className="text-center py-12">
            <p className="text-gray-500">Fund Investments will be displayed here</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
