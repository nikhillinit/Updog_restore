/**
 * Variance Tracking Test Fixtures
 *
 * Comprehensive test data for variance tracking features
 */


export const varianceTrackingFixtures = {
  // Fund baseline fixtures
  baselines: {
    quarterly: {
      fund_id: 1,
      name: 'Q4 2024 Quarterly Baseline',
      description: 'End of year quarterly baseline with strong performance metrics',
      baseline_type: 'quarterly' as const,
      period_start: '2024-10-01T00:00:00Z',
      period_end: '2024-12-31T23:59:59Z',
      snapshot_date: '2024-12-31T23:59:59Z',
      total_value: '2500000.00',
      deployed_capital: '2000000.00',
      irr: '0.1850',
      multiple: '1.4500',
      dpi: '0.9200',
      tvpi: '1.3800',
      portfolio_count: 18,
      average_investment: '138888.89',
      top_performers: {
        companies: [
          { id: 1, name: 'TechCorp Alpha', valuation: 500000.00, growth: 0.25 },
          { id: 2, name: 'HealthTech Beta', valuation: 400000.00, growth: 0.18 },
          { id: 3, name: 'FinTech Gamma', valuation: 350000.00, growth: 0.15 }
        ]
      },
      sector_distribution: {
        'Technology': 0.35,
        'Healthcare': 0.28,
        'Financial Services': 0.22,
        'Consumer': 0.10,
        'Other': 0.05
      },
      stage_distribution: {
        'Seed': 0.15,
        'Series A': 0.35,
        'Series B': 0.30,
        'Series C+': 0.20
      },
      reserve_allocation: {
        totalReserves: 500000.00,
        allocatedReserves: 350000.00,
        availableReserves: 150000.00,
        reserveRatio: 0.20
      },
      pacing_metrics: {
        deploymentRate: 0.80,
        quarterlyTarget: 0.75,
        paceVsTarget: 1.07,
        projectedDeployment: 2400000.00
      },
      is_active: true,
      is_default: true,
      confidence: '0.92',
      tags: ['quarterly', 'high-confidence', 'board-approved'],
      created_by: 1
    },

    annual: {
      fund_id: 1,
      name: '2024 Annual Baseline',
      description: 'Full year baseline including all quarterly data',
      baseline_type: 'annual' as const,
      period_start: '2024-01-01T00:00:00Z',
      period_end: '2024-12-31T23:59:59Z',
      snapshot_date: '2024-12-31T23:59:59Z',
      total_value: '2500000.00',
      deployed_capital: '2000000.00',
      irr: '0.1650',
      multiple: '1.4200',
      dpi: '0.8800',
      tvpi: '1.3500',
      portfolio_count: 18,
      average_investment: '138888.89',
      top_performers: {
        companies: [
          { id: 1, name: 'TechCorp Alpha', valuation: 500000.00, growth: 0.45 },
          { id: 2, name: 'HealthTech Beta', valuation: 400000.00, growth: 0.38 }
        ]
      },
      sector_distribution: {
        'Technology': 0.38,
        'Healthcare': 0.25,
        'Financial Services': 0.22,
        'Consumer': 0.12,
        'Other': 0.03
      },
      stage_distribution: {
        'Seed': 0.12,
        'Series A': 0.38,
        'Series B': 0.32,
        'Series C+': 0.18
      },
      reserve_allocation: {
        totalReserves: 500000.00,
        allocatedReserves: 400000.00,
        availableReserves: 100000.00,
        reserveRatio: 0.20
      },
      pacing_metrics: {
        deploymentRate: 0.80,
        annualTarget: 0.85,
        paceVsTarget: 0.94,
        projectedDeployment: 2550000.00
      },
      is_active: true,
      is_default: false,
      confidence: '0.95',
      tags: ['annual', 'audited', 'final'],
      created_by: 1
    },

    milestone: {
      fund_id: 1,
      name: 'Series B Milestone Baseline',
      description: 'Baseline captured after major Series B investment round',
      baseline_type: 'milestone' as const,
      period_start: '2024-11-01T00:00:00Z',
      period_end: '2024-11-30T23:59:59Z',
      snapshot_date: '2024-11-30T23:59:59Z',
      total_value: '2750000.00',
      deployed_capital: '2200000.00',
      irr: '0.1950',
      multiple: '1.5000',
      dpi: '0.9500',
      tvpi: '1.4200',
      portfolio_count: 19,
      average_investment: '144736.84',
      top_performers: {
        companies: [
          { id: 1, name: 'TechCorp Alpha', valuation: 600000.00, growth: 0.30 },
          { id: 4, name: 'AI Innovations', valuation: 500000.00, growth: 0.00 } // New investment
        ]
      },
      sector_distribution: {
        'Technology': 0.40,
        'Healthcare': 0.25,
        'Financial Services': 0.20,
        'Consumer': 0.10,
        'Other': 0.05
      },
      stage_distribution: {
        'Seed': 0.10,
        'Series A': 0.35,
        'Series B': 0.35,
        'Series C+': 0.20
      },
      reserve_allocation: {
        totalReserves: 550000.00,
        allocatedReserves: 450000.00,
        availableReserves: 100000.00,
        reserveRatio: 0.20
      },
      pacing_metrics: {
        deploymentRate: 0.88,
        monthlyTarget: 0.85,
        paceVsTarget: 1.03,
        projectedDeployment: 2600000.00
      },
      is_active: true,
      is_default: false,
      confidence: '0.88',
      tags: ['milestone', 'series-b', 'major-investment'],
      created_by: 1
    }
  },

  // Variance report fixtures
  reports: {
    periodicReport: {
      baselineId: '', // To be set in tests
      reportName: 'December 2024 Variance Analysis',
      reportType: 'periodic' as const,
      reportPeriod: 'monthly',
      asOfDate: '2024-12-31T23:59:59Z',
      currentMetrics: {
        totalValue: 2650000.00,
        deployedCapital: 2100000.00,
        irr: 0.1720,
        multiple: 1.4800,
        dpi: 0.9400,
        tvpi: 1.3900,
        portfolioCount: 18,
        averageInvestment: 147222.22
      },
      baselineMetrics: {
        totalValue: 2500000.00,
        deployedCapital: 2000000.00,
        irr: 0.1850,
        multiple: 1.4500,
        dpi: 0.9200,
        tvpi: 1.3800,
        portfolioCount: 18,
        averageInvestment: 138888.89
      },
      variances: {
        totalValueVariance: 150000.00,
        totalValueVariancePct: 0.06,
        irrVariance: -0.013,
        multipleVariance: 0.03,
        dpiVariance: 0.02,
        tvpiVariance: 0.01
      },
      portfolioVariances: {
        companyVariances: [
          {
            companyId: 1,
            companyName: 'TechCorp Alpha',
            valuationVariance: 50000.00,
            valuationVariancePct: 0.10,
            riskLevel: 'low'
          },
          {
            companyId: 5,
            companyName: 'Legacy Corp',
            valuationVariance: -25000.00,
            valuationVariancePct: -0.15,
            riskLevel: 'high'
          }
        ],
        sectorVariances: {
          'Technology': { variance: 0.02, impact: 'positive' },
          'Healthcare': { variance: -0.01, impact: 'negative' }
        },
        stageVariances: {
          'Series A': { variance: 0.03, impact: 'positive' },
          'Series B': { variance: -0.02, impact: 'negative' }
        },
        portfolioCountVariance: 0
      },
      insights: {
        overallScore: 0.75,
        significantVariances: [
          {
            metric: 'irr',
            variance: -0.013,
            variancePct: -0.07,
            severity: 'medium'
          }
        ],
        factors: [
          {
            factor: 'Market volatility in tech sector',
            impact: 'negative',
            magnitude: 0.15
          },
          {
            factor: 'Strong performance in healthcare investments',
            impact: 'positive',
            magnitude: 0.08
          }
        ],
        riskLevel: 'medium'
      },
      alertsTriggered: [
        {
          alertType: 'irr_decline',
          severity: 'warning',
          threshold: -0.01,
          actualValue: -0.013
        }
      ],
      thresholdBreaches: [
        {
          metric: 'irr',
          thresholdValue: 0.18,
          actualValue: 0.172,
          breachType: 'below_threshold'
        }
      ],
      riskLevel: 'medium',
      calculationEngine: 'variance-v1',
      calculationDurationMs: 1850,
      dataQualityScore: 0.94
    },

    alertTriggeredReport: {
      baselineId: '', // To be set in tests
      reportName: 'Alert-Triggered Variance Report - IRR Decline',
      reportType: 'alert_triggered' as const,
      asOfDate: '2024-12-31T18:30:00Z',
      currentMetrics: {
        totalValue: 2450000.00,
        deployedCapital: 2000000.00,
        irr: 0.1650,
        multiple: 1.4200,
        dpi: 0.9100,
        tvpi: 1.3600
      },
      baselineMetrics: {
        totalValue: 2500000.00,
        deployedCapital: 2000000.00,
        irr: 0.1850,
        multiple: 1.4500,
        dpi: 0.9200,
        tvpi: 1.3800
      },
      variances: {
        totalValueVariance: -50000.00,
        totalValueVariancePct: -0.02,
        irrVariance: -0.02,
        multipleVariance: -0.03,
        dpiVariance: -0.01,
        tvpiVariance: -0.02
      },
      riskLevel: 'high',
      calculationEngine: 'variance-v1',
      calculationDurationMs: 950,
      dataQualityScore: 0.97
    }
  },

  // Alert rule fixtures
  alertRules: {
    irrDeclineRule: {
      name: 'IRR Decline Alert',
      description: 'Alert when IRR drops by more than 1% from baseline',
      ruleType: 'threshold' as const,
      metricName: 'irr',
      operator: 'lt' as const,
      thresholdValue: -0.01,
      severity: 'warning' as const,
      category: 'performance' as const,
      checkFrequency: 'daily' as const,
      suppressionPeriod: 60,
      notificationChannels: ['email', 'slack'],
      conditions: {
        minimumVariance: 0.005,
        confidenceThreshold: 0.8
      },
      filters: {
        fundTypes: ['growth', 'venture'],
        minimumPortfolioSize: 5
      }
    },

    totalValueCriticalRule: {
      name: 'Total Value Critical Decline',
      description: 'Critical alert for significant total value drops',
      ruleType: 'threshold' as const,
      metricName: 'totalValue',
      operator: 'lt' as const,
      thresholdValue: -0.10, // 10% decline
      severity: 'critical' as const,
      category: 'performance' as const,
      checkFrequency: 'realtime' as const,
      suppressionPeriod: 30,
      notificationChannels: ['email', 'slack', 'webhook'],
      escalationRules: {
        levels: [
          { threshold: -0.10, delay: 0, notify: ['portfolio_manager'] },
          { threshold: -0.15, delay: 30, notify: ['portfolio_manager', 'gp'] },
          { threshold: -0.20, delay: 60, notify: ['portfolio_manager', 'gp', 'board'] }
        ]
      }
    },

    multipleRangeRule: {
      name: 'Multiple Range Monitor',
      description: 'Monitor when fund multiple falls outside target range',
      ruleType: 'threshold' as const,
      metricName: 'multiple',
      operator: 'between' as const,
      thresholdValue: 1.2,
      secondaryThreshold: 2.0,
      severity: 'info' as const,
      category: 'performance' as const,
      checkFrequency: 'weekly' as const,
      suppressionPeriod: 10080, // 1 week
      notificationChannels: ['email']
    },

    trendRule: {
      name: 'Portfolio Value Trend Analysis',
      description: 'Alert on negative portfolio value trends over time',
      ruleType: 'trend' as const,
      metricName: 'totalValue',
      operator: 'lt' as const,
      thresholdValue: -0.05, // 5% negative trend
      severity: 'warning' as const,
      category: 'risk' as const,
      checkFrequency: 'weekly' as const,
      suppressionPeriod: 1440, // 24 hours
      notificationChannels: ['email'],
      conditions: {
        lookbackPeriod: '30d',
        minimumDataPoints: 4,
        trendConfidence: 0.85
      }
    }
  },

  // Performance alert fixtures
  alerts: {
    irrDeclineAlert: {
      fund_id: 1,
      alert_type: 'threshold_breach',
      severity: 'warning' as const,
      category: 'performance' as const,
      title: 'IRR Decline Detected',
      description: 'Fund IRR has declined by 1.3% from the quarterly baseline, falling below the warning threshold of 1%.',
      recommendations: [
        'Review portfolio companies with negative performance',
        'Consider reserve deployment to support struggling investments',
        'Analyze market conditions affecting portfolio sectors'
      ],
      metric_name: 'irr',
      threshold_value: -0.01,
      actual_value: -0.013,
      variance_amount: -0.013,
      variance_percentage: -0.07,
      triggered_at: '2024-12-31T15:30:00Z',
      status: 'active' as const,
      affected_entities: {
        companies: [5, 8, 12], // Company IDs affected
        sectors: ['Consumer', 'Other'],
        stages: ['Series A']
      },
      context_data: {
        baselineDate: '2024-12-31T23:59:59Z',
        analysisDate: '2024-12-31T15:30:00Z',
        contributingFactors: [
          'Market downturn in consumer sector',
          'Delayed Series A rounds'
        ]
      },
      escalation_level: 0,
      rule_version: '1.0.0'
    },

    criticalValueAlert: {
      fund_id: 1,
      alert_type: 'threshold_breach',
      severity: 'critical' as const,
      category: 'risk' as const,
      title: 'Critical Portfolio Value Decline',
      description: 'Total portfolio value has declined by 12% in the last 24 hours, exceeding the critical threshold of 10%.',
      recommendations: [
        'Immediate review of portfolio companies',
        'Emergency LP communication',
        'Consider defensive strategies',
        'Review market conditions and external factors'
      ],
      metric_name: 'totalValue',
      threshold_value: -0.10,
      actual_value: -0.12,
      variance_amount: -300000.00,
      variance_percentage: -0.12,
      triggered_at: '2024-12-31T09:15:00Z',
      status: 'acknowledged' as const,
      affected_entities: {
        companies: [1, 2, 3, 5, 8, 10, 12],
        sectors: ['Technology', 'Healthcare', 'Consumer'],
        stages: ['Series A', 'Series B']
      },
      context_data: {
        marketConditions: 'High volatility',
        externalFactors: ['Federal Reserve announcement', 'Sector rotation'],
        impactAnalysis: {
          directImpact: 0.08,
          marketImpact: 0.04
        }
      },
      escalation_level: 1,
      escalated_at: '2024-12-31T09:45:00Z',
      escalated_to: ['portfolio_manager', 'gp'],
      rule_version: '1.1.0'
    },

    resolvedAlert: {
      fund_id: 1,
      alert_type: 'trend_analysis',
      severity: 'info' as const,
      category: 'operational' as const,
      title: 'Portfolio Diversification Improvement',
      description: 'Portfolio sector diversification has improved, reducing concentration risk.',
      recommendations: [
        'Continue balanced investment approach',
        'Monitor for over-diversification'
      ],
      metric_name: 'sectorConcentration',
      threshold_value: 0.40,
      actual_value: 0.35,
      variance_amount: -0.05,
      variance_percentage: -0.125,
      triggered_at: '2024-12-25T10:00:00Z',
      first_occurrence: '2024-12-20T14:30:00Z',
      last_occurrence: '2024-12-30T16:20:00Z',
      occurrence_count: 3,
      status: 'resolved' as const,
      acknowledged_by: 1,
      acknowledged_at: '2024-12-26T09:00:00Z',
      resolved_by: 1,
      resolved_at: '2024-12-30T17:00:00Z',
      resolution_notes: 'Diversification targets achieved through recent investments in healthcare and fintech sectors.',
      escalation_level: 0,
      rule_version: '1.0.0'
    }
  },

  // Test scenarios for complex variance analysis
  scenarios: {
    majorPortfolioChange: {
      description: 'Scenario with major portfolio company exit and new investment',
      before: {
        totalValue: 2500000.00,
        portfolioCount: 18,
        companies: [
          { id: 1, name: 'TechCorp', valuation: 500000.00 },
          { id: 2, name: 'ExitCorp', valuation: 400000.00 } // Will exit
        ]
      },
      after: {
        totalValue: 2800000.00,
        portfolioCount: 18,
        companies: [
          { id: 1, name: 'TechCorp', valuation: 600000.00 }, // Grew
          { id: 3, name: 'NewCorp', valuation: 500000.00 } // New investment
        ]
      },
      expectedVariances: {
        totalValueVariance: 300000.00,
        portfolioCountVariance: 0,
        exitCount: 1,
        newInvestmentCount: 1
      }
    },

    marketDownturn: {
      description: 'Scenario simulating market downturn affecting all holdings',
      before: {
        totalValue: 2500000.00,
        irr: 0.185,
        multiple: 1.45
      },
      after: {
        totalValue: 2200000.00,
        irr: 0.155,
        multiple: 1.32
      },
      expectedVariances: {
        totalValueVariance: -300000.00,
        totalValueVariancePct: -0.12,
        irrVariance: -0.03,
        multipleVariance: -0.13
      },
      expectedAlerts: ['critical_value_decline', 'irr_decline']
    },

    strongPerformance: {
      description: 'Scenario with exceptional portfolio performance',
      before: {
        totalValue: 2500000.00,
        irr: 0.185,
        multiple: 1.45,
        tvpi: 1.38
      },
      after: {
        totalValue: 3200000.00,
        irr: 0.245,
        multiple: 1.85,
        tvpi: 1.72
      },
      expectedVariances: {
        totalValueVariance: 700000.00,
        totalValueVariancePct: 0.28,
        irrVariance: 0.06,
        multipleVariance: 0.40,
        tvpiVariance: 0.34
      },
      expectedAlerts: [] // Positive variance shouldn't trigger alerts
    }
  }
};

// Helper functions for test data generation
export const varianceTestHelpers = {
  /**
   * Generate random baseline data for stress testing
   */
  generateRandomBaseline(fundId: number, overrides: Partial<any> = {}): any {
    const base = {
      fund_id: fundId,
      name: `Random Baseline ${Date.now()}`,
      baseline_type: ['quarterly', 'annual', 'milestone'][Math.floor(Math.random() * 3)],
      period_start: '2024-01-01T00:00:00Z',
      period_end: '2024-12-31T23:59:59Z',
      snapshot_date: '2024-12-31T23:59:59Z',
      total_value: (Math.random() * 5000000 + 1000000).toFixed(2),
      deployed_capital: (Math.random() * 4000000 + 800000).toFixed(2),
      irr: (Math.random() * 0.3 + 0.05).toFixed(4),
      multiple: (Math.random() * 2 + 1).toFixed(2),
      portfolio_count: Math.floor(Math.random() * 30 + 5),
      confidence: (Math.random() * 0.3 + 0.7).toFixed(2),
      created_by: 1,
      ...overrides
    };
    return base;
  },

  /**
   * Generate variance report data based on baseline
   */
  generateVarianceReport(baseline: any, varianceLevel: 'low' | 'medium' | 'high' = 'medium'): any {
    const multipliers = {
      low: { value: 0.02, irr: 0.005, multiple: 0.02 },
      medium: { value: 0.05, irr: 0.01, multiple: 0.05 },
      high: { value: 0.15, irr: 0.03, multiple: 0.15 }
    };

    const mult = multipliers[varianceLevel];
    const direction = Math.random() > 0.5 ? 1 : -1;

    const currentValue = parseFloat(baseline.total_value) * (1 + direction * mult.value);
    const currentIrr = parseFloat(baseline.irr) + direction * mult.irr;
    const currentMultiple = parseFloat(baseline.multiple) * (1 + direction * mult.multiple);

    return {
      baseline_id: baseline.id,
      report_name: `Generated Variance Report ${Date.now()}`,
      report_type: 'periodic',
      analysis_start: baseline.period_start,
      analysis_end: baseline.period_end,
      as_of_date: baseline.snapshot_date,
      current_metrics: {
        totalValue: currentValue,
        irr: currentIrr,
        multiple: currentMultiple
      },
      baseline_metrics: {
        totalValue: parseFloat(baseline.total_value),
        irr: parseFloat(baseline.irr),
        multiple: parseFloat(baseline.multiple)
      },
      total_value_variance: currentValue - parseFloat(baseline.total_value),
      total_value_variance_pct: (currentValue - parseFloat(baseline.total_value)) / parseFloat(baseline.total_value),
      irr_variance: currentIrr - parseFloat(baseline.irr),
      multiple_variance: currentMultiple - parseFloat(baseline.multiple),
      risk_level: varianceLevel === 'high' ? 'high' : varianceLevel === 'medium' ? 'medium' : 'low'
    };
  },

  /**
   * Create test alert based on variance data
   */
  generateAlert(variance: any, severity: 'info' | 'warning' | 'critical' = 'warning'): any {
    return {
      fund_id: 1,
      variance_report_id: variance.id,
      alert_type: 'threshold_breach',
      severity,
      category: 'performance',
      title: `${severity.charAt(0).toUpperCase() + severity.slice(1)} Variance Detected`,
      description: `Variance analysis has detected ${severity} level changes in portfolio metrics.`,
      metric_name: Math.abs(variance.irr_variance || 0) > Math.abs(variance.total_value_variance_pct || 0) ? 'irr' : 'totalValue',
      threshold_value: severity === 'critical' ? -0.10 : severity === 'warning' ? -0.05 : -0.02,
      actual_value: variance.irr_variance || variance.total_value_variance_pct,
      triggered_at: new Date().toISOString(),
      status: 'active'
    };
  }
};