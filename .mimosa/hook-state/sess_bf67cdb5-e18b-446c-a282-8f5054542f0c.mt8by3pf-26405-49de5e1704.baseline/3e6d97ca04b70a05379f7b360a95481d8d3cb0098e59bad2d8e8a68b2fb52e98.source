/**
 * DealCard - Component to display an individual deal in the pipeline
 *
 * Shows deal information including company name, sector, stage,
 * status, priority, and key metrics.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, DollarSign, Users, TrendingUp } from 'lucide-react';
import type { DealOpportunity } from '@shared/schema';

interface DealCardProps {
  deal: DealOpportunity;
  onClick?: () => void;
}

// Status color mapping
const statusColors: Record<string, string> = {
  lead: 'bg-pov-gray text-charcoal-700 border-beige-200',
  qualified: 'bg-[#cfe7df] text-pov-charcoal border-[#cfe7df]',
  pitch: 'bg-[#ddd6f5] text-pov-charcoal border-[#ddd6f5]',
  dd: 'bg-[#efd9bd] text-pov-charcoal border-[#efd9bd]',
  committee: 'bg-[#f2d7dc] text-pov-charcoal border-[#f2d7dc]',
  term_sheet: 'bg-[#ddd6f5] text-pov-charcoal border-[#ddd6f5]',
  closed: 'bg-success/10 text-success-dark border-success/50',
  passed: 'bg-error/10 text-error-dark border-error/50',
};

// Priority color mapping
const priorityColors: Record<string, string> = {
  high: 'bg-error/10 text-error-dark border-error/50',
  medium: 'bg-warning/10 text-warning-dark border-warning/50',
  low: 'bg-success/10 text-success-dark border-success/50',
};

// Status display labels
const statusLabels: Record<string, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  pitch: 'Pitch',
  dd: 'Due Diligence',
  committee: 'Committee',
  term_sheet: 'Term Sheet',
  closed: 'Closed',
  passed: 'Passed',
};

function safeParseMoney(value: unknown): number | null {
  if (value == null) return null;
  const num = parseFloat(String(value));
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const dealSize = safeParseMoney(deal.dealSize);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-pov-beige/50"
      role="button"
      tabIndex={0}
      aria-label={`Deal: ${deal.companyName}, ${deal.sector}, ${deal.priority} priority`}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-inter font-semibold text-pov-charcoal truncate">
              {deal.companyName}
            </h4>
            <p className="font-poppins text-xs text-charcoal-500 truncate">{deal.sector}</p>
          </div>
          <Badge
            variant="outline"
            className={priorityColors[deal.priority] || priorityColors['medium']}
          >
            {deal.priority.charAt(0).toUpperCase() + deal.priority.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Stage and Status */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[deal.status] || statusColors['lead']}>
            {statusLabels[deal.status] || deal.status}
          </Badge>
          <span className="font-poppins text-xs text-charcoal-400">{deal.stage}</span>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-charcoal/7">
          {dealSize !== null && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-charcoal-400" />
              <span className="font-poppins text-xs text-charcoal-600">
                ${(dealSize / 1000000).toFixed(1)}M
              </span>
            </div>
          )}
          {deal.employeeCount && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-charcoal-400" />
              <span className="font-poppins text-xs text-charcoal-600">
                {deal.employeeCount} employees
              </span>
            </div>
          )}
          {deal.foundedYear && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-charcoal-400" />
              <span className="font-poppins text-xs text-charcoal-600">
                Founded {deal.foundedYear}
              </span>
            </div>
          )}
          {deal.sourceType && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-charcoal-400" />
              <span className="font-poppins text-xs text-charcoal-600 truncate">
                {deal.sourceType}
              </span>
            </div>
          )}
        </div>

        {/* Next Action */}
        {deal.nextAction && (
          <div className="pt-2 border-t border-charcoal/7">
            <p className="font-poppins text-xs text-charcoal-500 truncate">
              <span className="font-medium">Next:</span> {deal.nextAction}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
