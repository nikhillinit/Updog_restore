/**
 * ContextualTooltip System
 *
 * Smart tooltips that explain VC concepts with market context, definitions,
 * and guidance on key metrics like power law, Series A Chasm, IRR, MOIC, DPI.
 */

import React, { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  HelpCircle,
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle,
  BarChart3,
  PieChart,
  Calculator,
  ExternalLink,
  BookOpen,
  Lightbulb
} from 'lucide-react';

export type ConceptCategory =
  | 'distribution'
  | 'metrics'
  | 'stages'
  | 'strategies'
  | 'risk'
  | 'market';

export interface VCConcept {
  id: string;
  term: string;
  shortDefinition: string;
  detailedExplanation: string;
  businessContext: string;
  category: ConceptCategory;
  relatedTerms: string[];
  benchmarks?: {
    label: string;
    value: string;
    context: string;
  }[];
  examples?: string[];
  calculations?: {
    formula: string;
    description: string;
    example?: string;
  };
  marketInsight?: string;
  actionableAdvice?: string;
}

// Comprehensive VC concept database
const VC_CONCEPTS: Record<string, VCConcept> = {
  'power-law': {
    id: 'power-law',
    term: 'Power Law Distribution',
    shortDefinition: 'A few investments drive most returns in VC portfolios',
    detailedExplanation: 'In venture capital, returns follow a power law where a small number of investments (typically 1-3% of portfolio) generate 50-70% of total returns. This means most investments fail or return modest amounts, while rare "unicorns" create outsized value.',
    businessContext: 'Understanding power law distributions is crucial for portfolio construction, reserve allocation, and investment strategy. It explains why VCs need large portfolios and why concentration risk can be both dangerous and necessary.',
    category: 'distribution',
    relatedTerms: ['unicorn', 'series-a-chasm', 'portfolio-construction'],
    benchmarks: [
      { label: 'Top 1% of investments', value: '50-70%', context: 'of total portfolio returns' },
      { label: 'Typical failure rate', value: '70-80%', context: 'of early-stage investments' },
      { label: 'Home run rate', value: '2-5%', context: 'investments returning 10x+' }
    ],
    marketInsight: '2024-2025 data shows even more extreme power law dynamics due to increased competition and later-stage capital abundance.',
    actionableAdvice: 'Build larger portfolios (25+ investments) and maintain 25-30% reserves for follow-on investments in breakout companies.'
  },

  'series-a-chasm': {
    id: 'series-a-chasm',
    term: 'Series A Chasm',
    shortDefinition: 'The difficult transition from seed to Series A funding',
    detailedExplanation: 'The Series A Chasm refers to the significant challenge startups face transitioning from seed funding to Series A. Many companies that raise seed rounds struggle to achieve the metrics and traction needed for institutional Series A investment.',
    businessContext: 'This phenomenon creates high failure rates (70%+) and requires careful reserve management. Companies need substantial product-market fit, revenue growth, and market validation to cross this chasm.',
    category: 'stages',
    relatedTerms: ['seed-stage', 'product-market-fit', 'reserve-allocation'],
    benchmarks: [
      { label: 'Seed to Series A conversion', value: '20-30%', context: 'of seed companies raise Series A' },
      { label: 'Typical timing', value: '18-24 months', context: 'from seed to Series A attempt' },
      { label: 'Bridge funding rate', value: '40-50%', context: 'of companies need bridge rounds' }
    ],
    marketInsight: 'Post-2023 market correction has made the Series A Chasm even more challenging, with higher bars for revenue and growth metrics.',
    actionableAdvice: 'Reserve 30-40% of fund for follow-on investments to help portfolio companies bridge the Series A gap.'
  },

  'irr': {
    id: 'irr',
    term: 'IRR (Internal Rate of Return)',
    shortDefinition: 'Annualized return rate that makes NPV of cash flows equal zero',
    detailedExplanation: 'IRR measures the annualized rate of return on an investment, accounting for the timing of cash flows. In VC, IRR is crucial because it captures both the magnitude of returns and the time to achieve them.',
    businessContext: 'VC funds typically target 20-25% net IRR. Higher IRRs indicate better performance, but can be skewed by early exits or small sample sizes. Should be evaluated alongside MOIC and DPI.',
    category: 'metrics',
    relatedTerms: ['moic', 'dpi', 'cash-flows'],
    calculations: {
      formula: 'IRR = (Ending Value / Beginning Value)^(1/years) - 1',
      description: 'Rate at which NPV of all cash flows equals zero',
      example: 'Investment: $1M → Exit: $10M in 5 years → IRR = 58%'
    },
    benchmarks: [
      { label: 'Top quartile VC funds', value: '25%+', context: 'net IRR to LPs' },
      { label: 'Median VC funds', value: '12-15%', context: 'net IRR to LPs' },
      { label: 'Individual unicorns', value: '50-100%+', context: 'gross IRR from investment' }
    ],
    actionableAdvice: 'Focus on time to exit alongside multiple. A 5x return in 3 years (71% IRR) beats 10x in 8 years (33% IRR).'
  },

  'moic': {
    id: 'moic',
    term: 'MOIC (Multiple of Invested Capital)',
    shortDefinition: 'Total value returned divided by total capital invested',
    detailedExplanation: 'MOIC measures how many times an investment returns the original capital invested. Unlike IRR, MOIC ignores timing and focuses purely on the multiple of returns achieved.',
    businessContext: 'VC funds typically target 3-5x MOIC at the fund level. MOIC is easier to understand and compare than IRR, but doesn\'t account for the time value of money.',
    category: 'metrics',
    relatedTerms: ['irr', 'dpi', 'unrealized-value'],
    calculations: {
      formula: 'MOIC = Total Value / Total Invested Capital',
      description: 'Simple multiple of returns vs. investment',
      example: 'Investment: $2M → Current Value: $20M → MOIC = 10x'
    },
    benchmarks: [
      { label: 'Top quartile funds', value: '4-6x', context: 'fund-level MOIC' },
      { label: 'Median funds', value: '2-3x', context: 'fund-level MOIC' },
      { label: 'Unicorn investments', value: '50-200x', context: 'individual investment MOIC' }
    ],
    actionableAdvice: 'Target portfolio construction that can achieve 3-4x fund MOIC even with 70% failure rate through a few high-multiple outcomes.'
  },

  'dpi': {
    id: 'dpi',
    term: 'DPI (Distributions to Paid-in Capital)',
    shortDefinition: 'Actual cash returned to investors divided by capital called',
    detailedExplanation: 'DPI measures actual cash distributions received by LPs, not paper valuations. It\'s the most concrete performance metric as it reflects real money returned to investors.',
    businessContext: 'DPI increases over fund life as companies exit. Early-stage funds may have low DPI for years while building portfolio value. DPI combined with RVPI gives total fund performance.',
    category: 'metrics',
    relatedTerms: ['rvpi', 'cash-flows', 'fund-lifecycle'],
    calculations: {
      formula: 'DPI = Cumulative Distributions / Paid-in Capital',
      description: 'Cash actually returned vs. cash invested',
      example: 'Fund: $100M raised, $150M distributed → DPI = 1.5x'
    },
    benchmarks: [
      { label: 'Mature funds (8-10yr)', value: '2-4x', context: 'DPI for top quartile' },
      { label: 'Mid-stage funds (4-6yr)', value: '0.5-1.5x', context: 'partial distributions' },
      { label: 'Young funds (1-3yr)', value: '0-0.3x', context: 'limited exits' }
    ],
    actionableAdvice: 'Focus on building DPI through partial exits, secondaries, and dividend recaps, not just waiting for full exits.'
  },

  'portfolio-construction': {
    id: 'portfolio-construction',
    term: 'Portfolio Construction',
    shortDefinition: 'Strategic approach to building a diversified VC portfolio',
    detailedExplanation: 'Portfolio construction in VC involves balancing risk and return through diversification across stages, sectors, and investment sizes while accounting for power law dynamics.',
    businessContext: 'Given high failure rates and power law returns, VCs need enough investments to capture outliers while maintaining sufficient capital for follow-ons in winners.',
    category: 'strategies',
    relatedTerms: ['power-law', 'reserve-allocation', 'diversification'],
    benchmarks: [
      { label: 'Portfolio size', value: '20-30', context: 'investments for early-stage funds' },
      { label: 'Reserve ratio', value: '25-40%', context: 'of fund for follow-ons' },
      { label: 'Sector concentration', value: '<30%', context: 'in any single sector' }
    ],
    actionableAdvice: 'Build portfolios of 25+ investments with 30% reserves, diversified across sectors but concentrated in your expertise areas.'
  },

  'unicorn': {
    id: 'unicorn',
    term: 'Unicorn',
    shortDefinition: 'Private company valued at $1 billion or more',
    detailedExplanation: 'Unicorns are rare, high-growth companies that achieve billion-dollar valuations while still private. They typically drive the majority of VC fund returns due to power law dynamics.',
    businessContext: 'While rare (1-3% of investments), unicorns are essential for top-tier VC returns. The key is identifying and supporting potential unicorns early in their journey.',
    category: 'market',
    relatedTerms: ['power-law', 'decacorn', 'ipo'],
    benchmarks: [
      { label: 'Global unicorns', value: '1,200+', context: 'as of 2024' },
      { label: 'Unicorn rate', value: '1-3%', context: 'of VC-backed companies' },
      { label: 'Value creation', value: '50-70%', context: 'of fund returns from unicorns' }
    ],
    marketInsight: 'Unicorn creation has slowed post-2022 but companies are staying private longer, creating more opportunities for VC investors.',
    actionableAdvice: 'Focus on large market opportunities with network effects, winner-take-all dynamics, and exceptional founding teams.'
  }
};

interface ContextualTooltipProps {
  concept: string;
  children: React.ReactNode;
  variant?: 'default' | 'detailed' | 'inline';
  showIcon?: boolean;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

const CATEGORY_CONFIG = {
  distribution: { icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
  metrics: { icon: Calculator, color: 'text-blue-600', bg: 'bg-blue-50' },
  stages: { icon: Target, color: 'text-green-600', bg: 'bg-green-50' },
  strategies: { icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  risk: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  market: { icon: PieChart, color: 'text-indigo-600', bg: 'bg-indigo-50' }
};

function DetailedConceptCard({ concept }: { concept: VCConcept }) {
  const [showCalculation, setShowCalculation] = useState(false);
  const categoryConfig = CATEGORY_CONFIG[concept.category];
  const IconComponent = categoryConfig.icon;

  return (
    <Card className="w-80 max-w-sm border-0 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", categoryConfig.bg)}>
            <IconComponent className={cn("w-5 h-5", categoryConfig.color)} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold font-inter text-slate-900 leading-tight">
              {concept.term}
            </h3>
            <Badge variant="outline" className="mt-1 text-xs capitalize">
              {concept.category.replace('-', ' ')}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Short Definition */}
        <div>
          <p className="text-sm font-medium text-slate-800 font-poppins leading-relaxed">
            {concept.shortDefinition}
          </p>
        </div>

        {/* Detailed Explanation */}
        <div>
          <p className="text-sm text-slate-600 font-poppins leading-relaxed">
            {concept.detailedExplanation}
          </p>
        </div>

        {/* Benchmarks */}
        {concept.benchmarks && concept.benchmarks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Key Benchmarks
            </h4>
            <div className="space-y-2">
              {concept.benchmarks.map((benchmark, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{benchmark.label}</span>
                  <div className="text-right">
                    <span className="font-semibold text-slate-800">{benchmark.value}</span>
                    <div className="text-xs text-slate-500">{benchmark.context}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calculations */}
        {concept.calculations && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCalculation(!showCalculation)}
              className="w-full text-xs"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {showCalculation ? 'Hide' : 'Show'} Calculation
            </Button>
            {showCalculation && (
              <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Formula:</div>
                  <code className="text-xs bg-white px-2 py-1 rounded border font-mono">
                    {concept.calculations.formula}
                  </code>
                </div>
                <div className="text-xs text-slate-600">
                  {concept.calculations.description}
                </div>
                {concept.calculations.example && (
                  <div className="text-xs text-slate-600 italic">
                    Example: {concept.calculations.example}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Market Insight */}
        {concept.marketInsight && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold text-blue-800 mb-1">Market Insight</div>
                <p className="text-xs text-blue-700 leading-relaxed">
                  {concept.marketInsight}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actionable Advice */}
        {concept.actionableAdvice && (
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold text-green-800 mb-1">Actionable Advice</div>
                <p className="text-xs text-green-700 leading-relaxed">
                  {concept.actionableAdvice}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Related Terms */}
        {concept.relatedTerms.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs font-semibold text-slate-700 mb-2">Related Concepts</div>
            <div className="flex flex-wrap gap-1">
              {concept.relatedTerms.map(term => (
                <Badge key={term} variant="secondary" className="text-xs">
                  {term.replace('-', ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ContextualTooltip({
  concept,
  children,
  variant = 'default',
  showIcon = true,
  className,
  side = 'top'
}: ContextualTooltipProps) {
  const conceptData = VC_CONCEPTS[concept];

  if (!conceptData) {
    // Fallback for unknown concepts
    return (
      <span className={className}>
        {children}
        {showIcon && <HelpCircle className="w-4 h-4 text-gray-400 ml-1 inline" />}
      </span>
    );
  }

  const categoryConfig = CATEGORY_CONFIG[conceptData.category];

  if (variant === 'inline') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "underline decoration-dotted cursor-help",
              categoryConfig.color,
              className
            )}>
              {children}
              {showIcon && <HelpCircle className="w-4 h-4 ml-1 inline opacity-60" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side={side} className="max-w-xs">
            <div className="space-y-2">
              <div className="font-semibold">{conceptData.term}</div>
              <div className="text-sm">{conceptData.shortDefinition}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("cursor-help", className)}>
            {children}
            {showIcon && <HelpCircle className="w-4 h-4 text-gray-400 ml-1 inline" />}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="p-0 border-0">
          <DetailedConceptCard concept={conceptData} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Convenience components for common VC terms
export const PowerLawTooltip = ({ children, ...props }: Omit<ContextualTooltipProps, 'concept'>) => (
  <ContextualTooltip concept="power-law" {...props}>{children}</ContextualTooltip>
);

export const SeriesAChasmTooltip = ({ children, ...props }: Omit<ContextualTooltipProps, 'concept'>) => (
  <ContextualTooltip concept="series-a-chasm" {...props}>{children}</ContextualTooltip>
);

export const IRRTooltip = ({ children, ...props }: Omit<ContextualTooltipProps, 'concept'>) => (
  <ContextualTooltip concept="irr" {...props}>{children}</ContextualTooltip>
);

export const MOICTooltip = ({ children, ...props }: Omit<ContextualTooltipProps, 'concept'>) => (
  <ContextualTooltip concept="moic" {...props}>{children}</ContextualTooltip>
);

export const DPITooltip = ({ children, ...props }: Omit<ContextualTooltipProps, 'concept'>) => (
  <ContextualTooltip concept="dpi" {...props}>{children}</ContextualTooltip>
);

export default ContextualTooltip;