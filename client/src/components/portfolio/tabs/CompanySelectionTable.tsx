/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCents, dollarsToCents } from '@/lib/units';
import { getDeltaIcon, getDeltaColorClass } from '@/lib/reallocation-utils';
import { spreadIfDefined } from '@/lib/spreadIfDefined';
import type { SelectedCompany } from '@/types/reallocation';
import type { PortfolioCompany } from '@shared/schema';

type Company = Pick<
  PortfolioCompany,
  'id' | 'name' | 'plannedReservesCents' | 'allocationCapCents'
>;

interface CompanySelectionTableProps {
  companies: Company[];
  selectedCompanies: SelectedCompany[];
  onSelectionChange: (selected: SelectedCompany[]) => void;
}

export function CompanySelectionTable({
  companies,
  selectedCompanies,
  onSelectionChange,
}: CompanySelectionTableProps) {
  const [editingValues, setEditingValues] = useState<Record<number, string>>(
    {}
  );

  const isSelected = (companyId: number): boolean => {
    return selectedCompanies.some((c) => c.id === companyId);
  };

  const getSelectedCompany = (
    companyId: number
  ): SelectedCompany | undefined => {
    return selectedCompanies.find((c) => c.id === companyId);
  };

  const handleCheckboxChange = (company: Company, checked: boolean) => {
    if (checked) {
      // Add company to selection with current allocation as default
      const newSelection: SelectedCompany = {
        id: company.id,
        name: company.name,
        currentAllocation: company.plannedReservesCents || 0,
        newAllocation: company.plannedReservesCents || 0,
        ...spreadIfDefined("cap", company.allocationCapCents),
      };
      onSelectionChange([...selectedCompanies, newSelection]);
    } else {
      // Remove company from selection
      onSelectionChange(selectedCompanies.filter((c) => c.id !== company.id));
      // Clear editing value
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[company.id];
        return next;
      });
    }
  };

  const handleAllocationChange = (companyId: number, value: string) => {
    // Update editing value
    setEditingValues((prev) => ({ ...prev, [companyId]: value }));

    // Parse and validate
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return; // Don't update if invalid
    }

    // Convert to cents
    const cents = dollarsToCents(numValue);

    // Update selected company
    onSelectionChange(
      selectedCompanies.map((c) =>
        c.id === companyId ? { ...c, newAllocation: cents } : c
      )
    );
  };

  const getDisplayValue = (company: Company): string => {
    const selected = getSelectedCompany(company.id);
    if (!selected) return '';

    // Use editing value if available
    if (editingValues[company.id] !== undefined) {
      return editingValues[company.id];
    }

    // Otherwise format the current value
    return (selected.newAllocation / 100).toFixed(2);
  };

  const getDelta = (company: Company): number => {
    const selected = getSelectedCompany(company.id);
    if (!selected) return 0;
    return selected.newAllocation - selected.currentAllocation;
  };

  const getDeltaStatus = (
    delta: number
  ): 'increased' | 'decreased' | 'unchanged' => {
    if (delta > 0) return 'increased';
    if (delta < 0) return 'decreased';
    return 'unchanged';
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Select</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">Current Allocation</TableHead>
            <TableHead className="text-right">New Allocation</TableHead>
            <TableHead className="text-right">Delta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500">
                No companies available
              </TableCell>
            </TableRow>
          ) : (
            companies.map((company) => {
              const selected = isSelected(company.id);
              const delta = getDelta(company);
              const deltaStatus = getDeltaStatus(delta);
              const deltaIcon = getDeltaIcon(deltaStatus);
              const deltaColorClass = getDeltaColorClass(delta);

              return (
                <TableRow key={company.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) =>
                        handleCheckboxChange(company, checked as boolean)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(company.plannedReservesCents || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {selected ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-gray-500">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={getDisplayValue(company)}
                          onChange={(e) =>
                            handleAllocationChange(company.id, e.target.value)
                          }
                          className="w-32 text-right"
                        />
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {selected ? (
                      <div
                        className={`flex items-center justify-end gap-1 font-medium ${deltaColorClass}`}
                      >
                        <span>{deltaIcon}</span>
                        <span>{formatCents(Math.abs(delta))}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
