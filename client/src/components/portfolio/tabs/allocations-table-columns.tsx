/**
 * Column definitions for Allocations table
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/units';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpDown, Pencil } from 'lucide-react';
import type { AllocationCompany } from './types';

export interface ColumnDef<T> {
  id: string;
  header: string | ((props: { column: Column<T> }) => React.ReactNode);
  accessorKey?: keyof T;
  cell?: (props: { row: { original: T } }) => React.ReactNode;
  sortable?: boolean;
}

export interface Column<T> {
  toggleSorting: (desc?: boolean) => void;
}

export const createAllocationsColumns = (
  onEdit: (company: AllocationCompany) => void
): ColumnDef<AllocationCompany>[] => [
  {
    id: 'company_name',
    accessorKey: 'company_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="h-8 px-2 lg:px-3 hover:bg-transparent"
      >
        Company Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="font-medium text-gray-900">{row.original.company_name}</div>
    ),
    sortable: true,
  },
  {
    id: 'sector',
    accessorKey: 'sector',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="h-8 px-2 lg:px-3 hover:bg-transparent"
      >
        Sector
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="font-normal">
        {row.original.sector}
      </Badge>
    ),
    sortable: true,
  },
  {
    id: 'stage',
    accessorKey: 'stage',
    header: 'Stage',
    cell: ({ row }) => (
      <span className="text-gray-600">{row.original.stage}</span>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      const statusColors: Record<string, string> = {
        active: 'bg-green-50 text-green-700 border-green-200',
        exited: 'bg-blue-50 text-blue-700 border-blue-200',
        written_off: 'bg-red-50 text-red-700 border-red-200',
        on_hold: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      };

      return (
        <Badge
          variant="outline"
          className={statusColors[status] || 'bg-gray-50 text-gray-700 border-gray-200'}
        >
          {status.replace('_', ' ')}
        </Badge>
      );
    },
  },
  {
    id: 'invested_amount_cents',
    accessorKey: 'invested_amount_cents',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="h-8 px-2 lg:px-3 hover:bg-transparent"
      >
        Invested
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {formatCents(row.original.invested_amount_cents, { compact: true })}
      </div>
    ),
    sortable: true,
  },
  {
    id: 'deployed_reserves_cents',
    accessorKey: 'deployed_reserves_cents',
    header: 'Deployed Reserves',
    cell: ({ row }) => (
      <div className="text-right font-medium text-blue-600">
        {formatCents(row.original.deployed_reserves_cents, { compact: true })}
      </div>
    ),
  },
  {
    id: 'planned_reserves_cents',
    accessorKey: 'planned_reserves_cents',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="h-8 px-2 lg:px-3 hover:bg-transparent"
      >
        Planned Reserves
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium text-purple-600">
        {formatCents(row.original.planned_reserves_cents, { compact: true })}
      </div>
    ),
    sortable: true,
  },
  {
    id: 'allocation_cap_cents',
    accessorKey: 'allocation_cap_cents',
    header: 'Allocation Cap',
    cell: ({ row }) => (
      <div className="text-right font-medium text-gray-700">
        {row.original.allocation_cap_cents
          ? formatCents(row.original.allocation_cap_cents, { compact: true })
          : <span className="text-gray-400 italic">No cap</span>
        }
      </div>
    ),
  },
  {
    id: 'last_allocation_at',
    accessorKey: 'last_allocation_at',
    header: 'Last Updated',
    cell: ({ row }) => {
      const lastUpdated = row.original.last_allocation_at;
      return (
        <div className="text-sm text-gray-500">
          {lastUpdated
            ? formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })
            : <span className="text-gray-400 italic">Never</span>
          }
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(row.original)}
        className="h-8 px-3"
      >
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>
    ),
  },
];
