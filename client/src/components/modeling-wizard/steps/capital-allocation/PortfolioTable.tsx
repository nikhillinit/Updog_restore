 
 
 
 
 
/**
 * Portfolio Table Component
 * Displays portfolio companies with MOIC color coding and delete confirmation
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { CompanyData } from './CompanyDialog';
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

export interface PortfolioTableProps {
  companies: CompanyData[];
  onEdit: (company: CompanyData) => void;
  onDelete: (id: string) => void;
}

export function PortfolioTable({
  companies,
  onEdit,
  onDelete
}: PortfolioTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<CompanyData | null>(null);

  const handleDeleteClick = (company: CompanyData) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (companyToDelete?.id) {
      onDelete(companyToDelete.id);
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    }
  };

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(1)}M`;
  };

  const calculateMOIC = (company: CompanyData): number => {
    const totalInvestment = company.initialInvestment + (company.followOnInvestment || 0);
    return totalInvestment > 0 ? company.currentValue / totalInvestment : 0;
  };

  const renderMOIC = (moic: number) => {
    const isPositive = moic >= 1;
    const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
      <div className={`flex items-center gap-1 ${colorClass} font-semibold`}>
        <Icon className="h-4 w-4" />
        <span>{moic.toFixed(2)}x</span>
      </div>
    );
  };

  const formatStage = (stage: string): string => {
    const stageMap: Record<string, string> = {
      'seed': 'Seed',
      'series-a': 'Series A',
      'series-b': 'Series B',
      'series-c': 'Series C',
      'growth': 'Growth'
    };
    return stageMap[stage] || stage;
  };

  if (companies.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No companies yet</h3>
        <p className="mt-2 text-sm text-gray-600">
          Get started by adding your first portfolio company.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-[#E0D8D1] rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company Name</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Initial ($M)</TableHead>
              <TableHead className="text-right">Follow-On ($M)</TableHead>
              <TableHead className="text-right">Total Invested ($M)</TableHead>
              <TableHead className="text-right">Current Value ($M)</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead className="text-right">Exit Year</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company, index) => {
              const moic = calculateMOIC(company);
              const totalInvested = company.initialInvestment + (company.followOnInvestment || 0);
              const isEvenRow = index % 2 === 0;

              return (
                <TableRow
                  key={company.id}
                  className={isEvenRow ? 'bg-white' : 'bg-gray-50'}
                >
                  <TableCell className="font-medium text-pov-charcoal">
                    {company.name}
                  </TableCell>
                  <TableCell className="text-gray-700">
                    {company.sector}
                  </TableCell>
                  <TableCell className="text-gray-700">
                    {formatStage(company.stage)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-700">
                    {formatCurrency(company.initialInvestment)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-700">
                    {formatCurrency(company.followOnInvestment || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-pov-charcoal">
                    {formatCurrency(totalInvested)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-pov-charcoal">
                    {formatCurrency(company.currentValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderMOIC(moic)}
                  </TableCell>
                  <TableCell className="text-right text-gray-700">
                    {company.exitYear || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(company)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit {company.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(company)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete {company.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="p-4 bg-white border border-[#E0D8D1] rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Companies</div>
          <div className="text-2xl font-bold text-pov-charcoal">
            {companies.length}
          </div>
        </div>
        <div className="p-4 bg-white border border-[#E0D8D1] rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Invested</div>
          <div className="text-2xl font-bold text-pov-charcoal">
            {formatCurrency(
              companies.reduce(
                (sum, c) => sum + c.initialInvestment + (c.followOnInvestment || 0),
                0
              )
            )}
          </div>
        </div>
        <div className="p-4 bg-white border border-[#E0D8D1] rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Value</div>
          <div className="text-2xl font-bold text-pov-charcoal">
            {formatCurrency(
              companies.reduce((sum, c) => sum + c.currentValue, 0)
            )}
          </div>
        </div>
        <div className="p-4 bg-white border border-[#E0D8D1] rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Portfolio MOIC</div>
          <div className="text-2xl font-bold">
            {(() => {
              const totalInvested = companies.reduce(
                (sum, c) => sum + c.initialInvestment + (c.followOnInvestment || 0),
                0
              );
              const totalValue = companies.reduce((sum, c) => sum + c.currentValue, 0);
              const portfolioMOIC = totalInvested > 0 ? totalValue / totalInvested : 0;
              const isPositive = portfolioMOIC >= 1;
              return (
                <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                  {portfolioMOIC.toFixed(2)}x
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-inter font-bold">
              Delete Company
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-pov-charcoal">
                {companyToDelete?.name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
