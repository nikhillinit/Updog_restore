/**
 * DealCard - Component to display an individual deal in the pipeline
 *
 * Shows deal information including company name, sector, stage,
 * status, priority, and key metrics.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign, Users, TrendingUp } from "lucide-react";
import type { DealOpportunity } from "@shared/schema";

interface DealCardProps {
  deal: DealOpportunity;
  onClick?: () => void;
}

// Status color mapping
const statusColors: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700 border-gray-200",
  qualified: "bg-blue-50 text-blue-700 border-blue-200",
  pitch: "bg-purple-50 text-purple-700 border-purple-200",
  dd: "bg-amber-50 text-amber-700 border-amber-200",
  committee: "bg-indigo-50 text-indigo-700 border-indigo-200",
  term_sheet: "bg-pink-50 text-pink-700 border-pink-200",
  closed: "bg-green-50 text-green-700 border-green-200",
  passed: "bg-red-50 text-red-700 border-red-200",
};

// Priority color mapping
const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

// Status display labels
const statusLabels: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  pitch: "Pitch",
  dd: "Due Diligence",
  committee: "Committee",
  term_sheet: "Term Sheet",
  closed: "Closed",
  passed: "Passed",
};

export function DealCard({ deal, onClick }: DealCardProps) {
  const dealSize = deal.dealSize ? parseFloat(deal.dealSize.toString()) : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-pov-beige/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-inter font-semibold text-pov-charcoal truncate">
              {deal.companyName}
            </h4>
            <p className="font-poppins text-xs text-gray-500 truncate">
              {deal.sector}
            </p>
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
          <Badge
            variant="outline"
            className={statusColors[deal.status] || statusColors['lead']}
          >
            {statusLabels[deal.status] || deal.status}
          </Badge>
          <span className="font-poppins text-xs text-gray-400">
            {deal.stage}
          </span>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
          {dealSize !== null && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-poppins text-xs text-gray-600">
                ${(dealSize / 1000000).toFixed(1)}M
              </span>
            </div>
          )}
          {deal.employeeCount && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-poppins text-xs text-gray-600">
                {deal.employeeCount} employees
              </span>
            </div>
          )}
          {deal.foundedYear && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-poppins text-xs text-gray-600">
                Founded {deal.foundedYear}
              </span>
            </div>
          )}
          {deal.sourceType && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-poppins text-xs text-gray-600 truncate">
                {deal.sourceType}
              </span>
            </div>
          )}
        </div>

        {/* Next Action */}
        {deal.nextAction && (
          <div className="pt-2 border-t border-gray-100">
            <p className="font-poppins text-xs text-gray-500 truncate">
              <span className="font-medium">Next:</span> {deal.nextAction}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
