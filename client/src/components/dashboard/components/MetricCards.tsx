import { Card, CardContent } from "@/components/ui/card";
import type { DashboardMetrics } from './DashboardMetrics';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  percentage?: string;
  className?: string;
}

/**
 * Reusable metric card component
 */
export function MetricCard({ title, value, subtitle, percentage, className = "" }: MetricCardProps) {
  return (
    <Card className={`bg-white border-0 shadow-card ${className}`}>
      <CardContent className="p-6">
        <div className="text-center">
          <div className="text-3xl font-inter font-bold text-charcoal">{value}</div>
          {percentage && (
            <div className="text-beige/80 font-medium mt-1">{percentage}</div>
          )}
          <div className="text-sm text-charcoal/70 mt-2">{title}</div>
          {subtitle && (
            <div className="text-xs text-charcoal/50 mt-1">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface InvestableCapitalCardProps {
  metrics: DashboardMetrics;
}

/**
 * Specialized card for investable capital with breakdown
 */
export function InvestableCapitalCard({ metrics }: InvestableCapitalCardProps) {
  const { investableCapital, committedCapital, managementFees, fundExpenses, exitProceedsRecycled } = metrics;
  
  return (
    <Card className="bg-white border-0 shadow-card col-span-2">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <div className="text-4xl font-inter font-bold text-charcoal">
            ${(investableCapital / 1000000).toFixed(1)}M
          </div>
          <div className="text-beige/80 font-medium mt-1">
            {((investableCapital / committedCapital) * 100).toFixed(2)}%
          </div>
          <div className="text-sm text-charcoal/70 mt-2">Investable Capital</div>
        </div>
        
        <div className="space-y-4 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-charcoal/70">Management Fees</span>
            <span className="font-mono text-red-600">($3.0M)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-charcoal/70">Fund Expenses</span>
            <span className="font-mono text-red-600">($3.4M)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-charcoal/70">Exit Proceeds Recycled</span>
            <span className="font-mono text-green-600">$40.0M</span>
          </div>
          <div className="border-t border-charcoal/20 pt-4">
            <div className="flex justify-between items-center font-bold">
              <span className="text-charcoal">Total Investable</span>
              <span className="font-mono text-charcoal">${(investableCapital / 1000000).toFixed(1)}M</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AllocationCardProps {
  metrics: DashboardMetrics;
}

/**
 * Card showing initial vs follow-on allocation
 */
export function AllocationCard({ metrics }: AllocationCardProps) {
  const { initialCapital, followOnCapital, investableCapital } = metrics;
  
  return (
    <Card className="bg-white border-0 shadow-card">
      <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-inter font-bold text-charcoal">
              ${(initialCapital / 1000000).toFixed(1)}M
            </div>
            <div className="text-beige/80 font-medium">
              {((initialCapital / investableCapital) * 100).toFixed(2)}%
            </div>
            <div className="text-sm text-charcoal/70 mt-1">Projected Initial</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-inter font-bold text-charcoal">
              ${(followOnCapital / 1000000).toFixed(1)}M
            </div>
            <div className="text-beige/80 font-medium">
              {((followOnCapital / investableCapital) * 100).toFixed(2)}%
            </div>
            <div className="text-sm text-charcoal/70 mt-1">Projected Follow-On</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface InvestmentsCardProps {
  metrics: DashboardMetrics;
}

/**
 * Card showing projected number of investments
 */
export function InvestmentsCard({ metrics }: InvestmentsCardProps) {
  const { projectedInvestments } = metrics;
  
  return (
    <Card className="bg-white border-0 shadow-card">
      <CardContent className="p-6">
        <div className="text-center">
          <div className="text-3xl font-inter font-bold text-charcoal">{projectedInvestments}</div>
          <div className="text-charcoal/70 font-medium mt-1">Projected</div>
          <div className="text-sm text-charcoal/70 mt-2">Number of Initial Investments</div>
          <div className="flex justify-center space-x-4 mt-4">
            <div className="text-center">
              <div className="text-lg font-bold text-charcoal">27</div>
              <div className="text-xs text-charcoal/50">By Entry Round</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-charcoal">26</div>
              <div className="text-xs text-charcoal/50">By Allocations</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}