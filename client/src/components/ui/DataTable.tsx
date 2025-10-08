/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DataTable Component
 * Generic, reusable table with sorting, sticky headers, and Press On Ventures styling
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState<T> {
  column: keyof T | null;
  direction: SortDirection;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  rows
}: DataTableProps<T>) {
  const [sortState, setSortState] = React.useState<SortState<T>>({
    column: null,
    direction: null
  });

  const handleSort = (columnKey: keyof T) => {
    setSortState(prev => {
      if (prev.column !== columnKey) {
        return { column: columnKey, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column: columnKey, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

  const sortedRows = React.useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aVal = a[sortState.column!];
      const bVal = b[sortState.column!];

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortState]);

  const renderSortIndicator = (columnKey: keyof T) => {
    if (sortState.column !== columnKey) {
      return null;
    }
    return (
      <span className="ml-1 text-[#292929]">
        {sortState.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const isNumericColumn = (columnKey: keyof T): boolean => {
    // Check if first non-null value is a number
    const firstValue = rows.find(row => row[columnKey] != null)?.[columnKey];
    return typeof firstValue === 'number';
  };

  return (
    <div className="border border-[#E0D8D1] rounded-lg overflow-hidden">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 bg-[#F2F2F2] z-10">
            <tr className="border-b border-[#E0D8D1]">
              {columns.map(column => (
                <th
                  key={String(column.key)}
                  className={cn(
                    'h-12 px-4 align-middle font-poppins font-bold text-[#292929]',
                    'cursor-pointer select-none hover:bg-[#E8E8E8] transition-colors',
                    column.align === 'right' ? 'text-right' : 'text-left'
                  )}
                  onClick={() => handleSort(column.key)}
                >
                  <div className={cn(
                    'flex items-center gap-1',
                    column.align === 'right' ? 'justify-end' : 'justify-start'
                  )}>
                    {column.label}
                    {renderSortIndicator(column.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const isEvenRow = rowIndex % 2 === 0;
              return (
                <tr
                  key={rowIndex}
                  className={cn(
                    'border-b border-[#E0D8D1] last:border-b-0',
                    isEvenRow ? 'bg-white' : 'bg-[#F2F2F2]'
                  )}
                >
                  {columns.map(column => {
                    const value = row[column.key];
                    const isNumeric = isNumericColumn(column.key);

                    return (
                      <td
                        key={String(column.key)}
                        className={cn(
                          'p-4 align-middle',
                          column.align === 'right' || isNumeric
                            ? 'text-right tabular-nums'
                            : 'text-left',
                          isNumeric && 'font-mono'
                        )}
                      >
                        {value != null ? String(value) : '-'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
