/**
 * AIInsightCard Component
 *
 * Transforms Monte Carlo simulation results into natural language insights
 * with confidence levels and actionable recommendations for VC decisions.
 */

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Target,
  Brain,
  BarChart3
} from 'lucide-react';

// Types based on power law distribution data structures
export interface MonteCarloResult {
  multiple: number;
  irr: number;
  category: 'failure' | 'modest' | 'good' | 'homeRun' | 'unicorn';
  stage: string;
  exitTiming: number;
}

export interface PortfolioInsight {
  title: string;
  insight: string;
  recommendation: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'risk' | 'opportunity' | 'strategy' | 'allocation';
  metrics?: {
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'stable';
  }[];
}

interface AIInsightCardProps {
  results?: MonteCarloResult[];
  portfolioSize?: number;
  fundSize?: number;
  timeHorizon?: number;
  insights?: PortfolioInsight[];
  className?: string;
  variant?: 'default' | 'compact' | 'detailed';
}

// AI insight generation based on Monte Carlo results
function generateInsights(
  results: MonteCarloResult[],
  portfolioSize: number,
  fundSize: number,
  timeHorizon: number
): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];

  if (!results || results.length === 0) return insights;

  // Calculate key metrics
  const totalInvestments = results.length;
  const avgMultiple = results.reduce((sum, r) => sum + r.multiple, 0) / totalInvestments;
  const failureRate = results.filter(r => r.category === 'failure').length / totalInvestments;
  const unicornRate = results.filter(r => r.category === 'unicorn').length / totalInvestments;
  const homeRunRate = results.filter(r => r.category === 'homeRun').length / totalInvestments;

  // Series A Chasm Analysis
  if (failureRate > 0.65) {
    insights.push({
      title: "Series A Chasm Detected",
      insight: `Your ${Math.round(failureRate * 100)}% failure rate reflects the harsh reality of the Series A Chasm, where most startups fail to secure subsequent funding rounds.`,
      recommendation: `Consider increasing reserve allocation to ${Math.round(28 + failureRate * 10)}% to support portfolio companies through this critical transition.`,
      confidence: 85,
      severity: 'high',
      category: 'risk',
      metrics: [
        { label: 'Failure Rate', value: `${Math.round(failureRate * 100)}%`, trend: 'down' },
        { label: 'Recommended Reserves', value: `${Math.round(28 + failureRate * 10)}%`, trend: 'up' }
      ]
    });
  }

  // Power Law Distribution Analysis
  if (unicornRate > 0.005 && homeRunRate > 0.03) {
    insights.push({
      title: "Power Law Distribution Active",
      insight: `Your portfolio shows healthy power law dynamics with ${Math.round(unicornRate * 100 * 100) / 100}% unicorns driving ${Math.round((avgMultiple - 1) * 100)}% of returns.`,
      recommendation: `Focus on identifying and doubling down on potential 10x+ outcomes. Consider concentrating follow-on investments in top quartile performers.`,
      confidence: 92,
      severity: 'medium',
      category: 'opportunity',
      metrics: [
        { label: 'Unicorn Rate', value: `${Math.round(unicornRate * 1000) / 10}%`, trend: 'up' },
        { label: 'Home Run Rate', value: `${Math.round(homeRunRate * 100)}%`, trend: 'up' }
      ]
    });
  }

  // Portfolio Concentration Risk
  const top10Percent = Math.ceil(results.length * 0.1);
  const topPerformers = results.sort((a, b) => b.multiple - a.multiple).slice(0, top10Percent);
  const topPerformerContribution = topPerformers.reduce((sum, r) => sum + r.multiple, 0) /
                                   results.reduce((sum, r) => sum + r.multiple, 0);

  if (topPerformerContribution > 0.8) {
    insights.push({
      title: "High Concentration Risk",
      insight: `Top ${Math.round(100/results.length * top10Percent)}% of investments drive ${Math.round(topPerformerContribution * 100)}% of total returns.`,
      recommendation: `Diversify portfolio construction and consider increasing check sizes for high-conviction opportunities to reduce concentration risk.`,
      confidence: 78,
      severity: 'medium',
      category: 'risk',
      metrics: [
        { label: 'Top Performer Impact', value: `${Math.round(topPerformerContribution * 100)}%`, trend: 'up' },
        { label: 'Portfolio Concentration', value: 'High', trend: 'stable' }
      ]
    });
  }

  // IRR Analysis
  const avgIRR = results.reduce((sum, r) => sum + r.irr, 0) / totalInvestments;
  if (avgIRR > 0.25) {
    insights.push({
      title: "Strong IRR Performance",
      insight: `Portfolio IRR of ${Math.round(avgIRR * 100)}% exceeds venture benchmarks, indicating strong investment selection and timing.`,
      recommendation: `Maintain current investment thesis and consider raising fund size to capitalize on deal flow quality.`,
      confidence: 88,
      severity: 'low',
      category: 'opportunity',
      metrics: [
        { label: 'Portfolio IRR', value: `${Math.round(avgIRR * 100)}%`, trend: 'up' },
        { label: 'Benchmark', value: '20-25%', trend: 'stable' }
      ]
    });
  }

  return insights;
}

const severityConfig = {
  low: {
    bgColor: 'bg-semantic-success-50',
    borderColor: 'border-semantic-success-200',
    textColor: 'text-semantic-success-800',
    badgeVariant: 'secondary' as const,
    icon: Target,
    confidence: 'high' as const
  },
  medium: {
    bgColor: 'bg-semantic-info-50',
    borderColor: 'border-semantic-info-200',
    textColor: 'text-semantic-info-800',
    badgeVariant: 'default' as const,
    icon: TrendingUp,
    confidence: 'medium' as const
  },
  high: {
    bgColor: 'bg-semantic-warning-50',
    borderColor: 'border-semantic-warning-200',
    textColor: 'text-semantic-warning-800',
    badgeVariant: 'outline' as const,
    icon: AlertTriangle,
    confidence: 'low' as const
  },
  critical: {
    bgColor: 'bg-semantic-error-50',
    borderColor: 'border-semantic-error-200',
    textColor: 'text-semantic-error-800',
    badgeVariant: 'destructive' as const,
    icon: AlertTriangle,
    confidence: 'critical' as const
  }
};

const categoryConfig = {
  risk: { label: 'Risk Analysis', color: 'text-red-600' },
  opportunity: { label: 'Opportunity', color: 'text-green-600' },
  strategy: { label: 'Strategy', color: 'text-blue-600' },
  allocation: { label: 'Allocation', color: 'text-purple-600' }
};

export function AIInsightCard({
  results = [],
  portfolioSize = 25,
  fundSize = 100000000,
  timeHorizon = 10,
  insights: providedInsights,
  className,
  variant = 'default'
}: AIInsightCardProps) {
  // Generate insights from Monte Carlo results if not provided
  const insights = providedInsights || generateInsights(results, portfolioSize, fundSize, timeHorizon);

  if (insights.length === 0) {
    return (
      <Card className={cn("border-dashed border-2 border-gray-300", className)}>
        <CardContent className="p-6 text-center">
          <Brain className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">Run Monte Carlo simulation to generate AI insights</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {insights.map((insight, index) => {
        const config = severityConfig[insight.severity];
        const categoryInfo = categoryConfig[insight.category];
        const IconComponent = config.icon;

        return (
          <Card
            key={index}
            className={cn(
              "ai-insight-enhanced transition-all duration-300 ease-professional",
              "hover:shadow-ai-insight hover:-translate-y-1 reduced-motion-safe",
              "focus-visible-ring high-contrast-border",
              config.bgColor,
              config.borderColor,
              config.confidence,
              variant === 'compact' && "p-3",
              variant === 'detailed' && "p-6"
            )}
            role="article"
            aria-label={`AI Insight: ${insight.title}`}
            tabIndex={0}
          >
            <CardHeader className={cn(
              "pb-3",
              variant === 'compact' && "pb-2 pt-2"
            )}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    config.bgColor === 'bg-green-50' && 'bg-green-100',
                    config.bgColor === 'bg-blue-50' && 'bg-blue-100',
                    config.bgColor === 'bg-yellow-50' && 'bg-yellow-100',
                    config.bgColor === 'bg-red-50' && 'bg-red-100'
                  )}>
                    <IconComponent className={cn("h-5 w-5", config.textColor)} />
                  </div>
                  <div>
                    <h3 className={cn(
                      "font-semibold font-inter",
                      config.textColor,
                      variant === 'compact' ? "text-sm" : "text-base"
                    )}>
                      {insight.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={config.badgeVariant} className="text-xs">
                        {categoryInfo.label}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {insight.confidence}% confidence
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="ai-confidence-progress w-12">
                    <div
                      className={`progress-fill ${config.confidence}`}
                      role="progressbar"
                      aria-valuenow={insight.confidence}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Confidence: ${insight.confidence}%`}
                    ></div>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className={cn(
              "pt-0",
              variant === 'compact' && "pb-3"
            )}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <p
                      className={cn(
                        "font-poppins leading-relaxed",
                        config.textColor,
                        variant === 'compact' ? "text-sm" : "text-base"
                      )}
                      id={`insight-text-${index}`}
                    >
                      {insight.insight}
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <p
                      className={cn(
                        "font-poppins font-medium leading-relaxed",
                        config.textColor,
                        variant === 'compact' ? "text-sm" : "text-base"
                      )}
                      id={`recommendation-text-${index}`}
                    >
                      {insight.recommendation}
                    </p>
                  </div>
                </div>

                {variant === 'detailed' && insight.metrics && insight.metrics.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="grid grid-cols-2 gap-4">
                      {insight.metrics.map((metric, metricIndex) => (
                        <div
                          key={metricIndex}
                          className="flex items-center justify-between"
                          role="listitem"
                        >
                          <span className="text-sm text-gray-600 font-poppins">
                            {metric.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <span
                              className="text-sm font-semibold"
                              aria-label={`${metric.label}: ${metric.value}`}
                            >
                              {metric.value}
                            </span>
                            {metric.trend && (
                              <div
                                className={cn(
                                  "text-xs",
                                  metric.trend === 'up' && 'text-semantic-success-600',
                                  metric.trend === 'down' && 'text-semantic-error-600',
                                  metric.trend === 'stable' && 'text-semantic-neutral-500'
                                )}
                                aria-label={`Trend: ${metric.trend}`}
                              >
                                {metric.trend === 'up' && '↗'}
                                {metric.trend === 'down' && '↘'}
                                {metric.trend === 'stable' && '→'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {variant === 'detailed' && (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-center justify-center">
              <BarChart3 className="h-4 w-4 text-gray-500" />
              <p className="text-sm text-gray-600 font-poppins">
                Insights powered by power law distribution analysis and VC industry benchmarks
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AIInsightCard;