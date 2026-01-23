/**
 * UI Catalog - Admin-only component showcase
 *
 * Displays all canonical UI primitives with variants for visual verification.
 * Access controlled by AdminRoute wrapper (FLAGS.UI_CATALOG - no localStorage override)
 */

import React, { useState } from 'react';
import { presson } from '@/theme/presson.tokens';
import { KpiCard } from '@/components/ui/KpiCard';
import { SwipeableMetricCards, MetricCardData } from '@/components/ui/SwipeableMetricCards';
import { DataTable } from '@/components/ui/DataTable';
import { ContextualTooltip, IRRTooltip, MOICTooltip, DPITooltip } from '@/components/ui/contextual-tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, DollarSign, Target, BarChart3, TrendingUp, Percent, Wallet } from 'lucide-react';

// Sample data for DataTable
const sampleTableData = [
  { company: 'FinanceAI', status: 'Active', invested: '$2.00M', ownership: '8.5%' },
  { company: 'HealthLink', status: 'Active', invested: '$1.50M', ownership: '12.3%' },
  { company: 'DataStream', status: 'Active', invested: '$3.50M', ownership: '5.2%' },
];

const sampleTableColumns = [
  { key: 'company' as const, label: 'Company' },
  { key: 'status' as const, label: 'Status' },
  { key: 'invested' as const, label: 'Invested', align: 'right' as const },
  { key: 'ownership' as const, label: 'Ownership', align: 'right' as const },
];

// Sample metrics for SwipeableMetricCards
const sampleMetrics: MetricCardData[] = [
  {
    id: '1',
    title: 'Total Companies',
    value: '5',
    subtitle: '3 Active',
    change: '2 Exited',
    trend: 'stable',
    severity: 'neutral',
    icon: Building2,
  },
  {
    id: '2',
    title: 'Total Invested',
    value: '$10.5M',
    subtitle: 'Capital deployed',
    change: '',
    trend: 'stable',
    severity: 'neutral',
    icon: DollarSign,
  },
  {
    id: '3',
    title: 'Current Value',
    value: '$31.2M',
    subtitle: 'Portfolio value',
    change: '+197%',
    trend: 'up',
    severity: 'success',
    icon: Target,
  },
  {
    id: '4',
    title: 'Average MOIC',
    value: '2.97x',
    subtitle: 'Multiple on invested',
    change: '',
    trend: 'up',
    severity: 'success',
    icon: BarChart3,
  },
];

function TokensSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">Design Tokens</h2>
      <p className="text-presson-textMuted">
        Canonical colors from <code className="bg-presson-surfaceSubtle px-1 rounded">presson.tokens.ts</code>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(presson.color).map(([name, value]) => (
          <div key={name} className="space-y-2">
            <div
              className="h-16 rounded-lg border border-presson-borderSubtle"
              style={{ backgroundColor: value }}
            />
            <p className="text-sm font-mono">{name}</p>
            <p className="text-xs text-presson-textMuted">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiCardsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">KPI Cards</h2>
      <p className="text-presson-textMuted">
        Desktop metric display using <code className="bg-presson-surfaceSubtle px-1 rounded">KpiCard</code>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Neutral Intent"
          value="$10.5M"
          delta="No change indicator"
          intent="neutral"
        />
        <KpiCard
          label="Positive Intent"
          value="+25.3%"
          delta="Up from last quarter"
          intent="positive"
        />
        <KpiCard
          label="Negative Intent"
          value="-8.2%"
          delta="Down from target"
          intent="negative"
        />
        <KpiCard
          label="No Delta"
          value="42"
          intent="neutral"
        />
      </div>
    </section>
  );
}

function MobileCardsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">Mobile Metric Cards</h2>
      <p className="text-presson-textMuted">
        Touch-optimized carousel using <code className="bg-presson-surfaceSubtle px-1 rounded">SwipeableMetricCards</code>
      </p>

      <div className="max-w-md mx-auto border border-presson-borderSubtle rounded-lg p-4 bg-presson-surfaceSubtle">
        <p className="text-xs text-presson-textMuted mb-2 text-center">Mobile Preview (swipe enabled)</p>
        <SwipeableMetricCards
          metrics={sampleMetrics}
          showNavigation={true}
          showIndicators={true}
          cardsPerView={1}
        />
      </div>
    </section>
  );
}

function DataTableSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">Data Table</h2>
      <p className="text-presson-textMuted">
        Sortable table using <code className="bg-presson-surfaceSubtle px-1 rounded">DataTable</code>
      </p>

      <div className="space-y-4">
        <h3 className="font-medium">With Data</h3>
        <DataTable columns={sampleTableColumns} rows={sampleTableData} />

        <h3 className="font-medium">Empty State</h3>
        <DataTable columns={sampleTableColumns} rows={[]} />
      </div>
    </section>
  );
}

function TooltipsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">Contextual Tooltips</h2>
      <p className="text-presson-textMuted">
        VC concept explanations using <code className="bg-presson-surfaceSubtle px-1 rounded">ContextualTooltip</code>
      </p>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="space-y-1">
          <p className="text-sm text-presson-textMuted">IRR Tooltip</p>
          <div className="flex items-center gap-2">
            <IRRTooltip>
              <span className="font-mono font-bold text-lg">25.3%</span>
            </IRRTooltip>
            <span className="text-sm text-presson-textMuted">IRR</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-presson-textMuted">MOIC Tooltip</p>
          <div className="flex items-center gap-2">
            <MOICTooltip>
              <span className="font-mono font-bold text-lg">2.8x</span>
            </MOICTooltip>
            <span className="text-sm text-presson-textMuted">MOIC</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-presson-textMuted">DPI Tooltip</p>
          <div className="flex items-center gap-2">
            <DPITooltip>
              <span className="font-mono font-bold text-lg">0.45x</span>
            </DPITooltip>
            <span className="text-sm text-presson-textMuted">DPI</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-presson-textMuted">Custom Concept</p>
          <ContextualTooltip concept="power-law" variant="detailed">
            <Badge variant="outline" className="cursor-help">
              Power Law
            </Badge>
          </ContextualTooltip>
        </div>
      </div>
    </section>
  );
}

function ButtonsSection() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-presson-text">Buttons</h2>
      <p className="text-presson-textMuted">
        Button variants using Press On brand tokens
      </p>

      <div className="flex flex-wrap gap-4">
        <Button className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90">
          Primary CTA
        </Button>
        <Button variant="outline" className="border-presson-borderSubtle">
          Secondary
        </Button>
        <Button variant="ghost">
          Ghost
        </Button>
        <Button disabled className="bg-presson-accent text-presson-accentOn">
          Disabled
        </Button>
      </div>
    </section>
  );
}

export default function UICatalog() {
  // Note: Access control is handled by AdminRoute wrapper in App.tsx
  // The UI_CATALOG flag is a secure admin flag (no localStorage override)
  return (
    <div className="min-h-screen bg-presson-bg p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-presson-text">UI Catalog</h1>
          <p className="text-presson-textMuted">
            Press On Ventures canonical UI primitives and design tokens
          </p>
          <Badge variant="outline" className="text-xs">
            Admin Only
          </Badge>
        </header>

        <TokensSection />
        <KpiCardsSection />
        <MobileCardsSection />
        <DataTableSection />
        <TooltipsSection />
        <ButtonsSection />

        <footer className="pt-8 border-t border-presson-borderSubtle">
          <p className="text-sm text-presson-textMuted">
            Source: <code>client/src/theme/presson.tokens.ts</code>
          </p>
        </footer>
      </div>
    </div>
  );
}
