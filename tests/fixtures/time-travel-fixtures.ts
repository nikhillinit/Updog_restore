/**
 * Time-Travel Analytics Test Fixtures
 *
 * Comprehensive test data for time-travel analytics features
 */

export const timeTravelFixtures = {
  // Fund state snapshot fixtures
  snapshots: {
    quarterlySnapshot: {
      fund_id: 1,
      snapshot_name: 'Q4 2024 End-of-Quarter Snapshot',
      description: 'Comprehensive end-of-quarter state capture including all portfolio data',
      snapshot_type: 'quarterly' as const,
      trigger_event: 'scheduled' as const,
      captured_at: '2024-12-31T23:59:59Z',
      portfolio_state: {
        totalValue: 2500000.00,
        deployedCapital: 2000000.00,
        availableCapital: 500000.00,
        portfolioCount: 18,
        companies: [
          {
            id: 1,
            name: 'TechCorp Alpha',
            valuation: 500000.00,
            ownership: 0.15,
            stage: 'Series A',
            sector: 'Technology',
            investmentDate: '2023-03-15T00:00:00Z',
            lastValuationDate: '2024-12-31T00:00:00Z',
            status: 'active'
          },
          {
            id: 2,
            name: 'HealthTech Beta',
            valuation: 400000.00,
            ownership: 0.12,
            stage: 'Series B',
            sector: 'Healthcare',
            investmentDate: '2023-06-20T00:00:00Z',
            lastValuationDate: '2024-12-31T00:00:00Z',
            status: 'active'
          },
          {
            id: 3,
            name: 'FinTech Gamma',
            valuation: 350000.00,
            ownership: 0.18,
            stage: 'Series A',
            sector: 'Financial Services',
            investmentDate: '2023-09-10T00:00:00Z',
            lastValuationDate: '2024-12-31T00:00:00Z',
            status: 'active'
          }
        ],
        sectorBreakdown: {
          'Technology': 0.35,
          'Healthcare': 0.28,
          'Financial Services': 0.22,
          'Consumer': 0.10,
          'Other': 0.05
        },
        stageBreakdown: {
          'Seed': 0.15,
          'Series A': 0.35,
          'Series B': 0.30,
          'Series C+': 0.20
        },
        geographicBreakdown: {
          'North America': 0.65,
          'Europe': 0.25,
          'Asia': 0.10
        }
      },
      fund_metrics: {
        irr: 0.1850,
        multiple: 1.4500,
        dpi: 0.9200,
        tvpi: 1.3800,
        moic: 1.4200,
        unrealizedValue: 2100000.00,
        realizedValue: 400000.00,
        distributionHistory: [
          { date: '2024-06-30T00:00:00Z', amount: 200000.00, type: 'dividend' },
          { date: '2024-09-30T00:00:00Z', amount: 200000.00, type: 'partial_exit' }
        ],
        cashFlow: {
          totalInvested: 2000000.00,
          totalDistributed: 400000.00,
          netCashFlow: -1600000.00
        }
      },
      reserve_metrics: {
        totalReserves: 500000.00,
        allocatedReserves: 350000.00,
        availableReserves: 150000.00,
        reserveRatio: 0.20,
        reserveAllocation: [
          { companyId: 1, allocated: 100000.00, purpose: 'follow_on' },
          { companyId: 2, allocated: 150000.00, purpose: 'bridge_financing' },
          { companyId: 3, allocated: 100000.00, purpose: 'follow_on' }
        ]
      },
      pacing_metrics: {
        deploymentRate: 0.80,
        quarterlyTarget: 0.75,
        paceVsTarget: 1.07,
        projectedDeployment: 2400000.00,
        investmentPace: {
          q1: 0.20,
          q2: 0.25,
          q3: 0.30,
          q4: 0.25
        }
      },
      data_integrity_score: 0.95,
      status: 'active' as const,
      version: '2.1.0',
      metadata: {
        snapshotEngine: 'time-travel-v2',
        calculationTime: 2850,
        dataSource: 'fund_management_system',
        validation: {
          checksRun: 25,
          checksPasssed: 24,
          warnings: ['Minor rounding difference in sector allocation'],
          errors: []
        }
      },
      tags: ['quarterly', 'eoy', 'audited', 'board-review'],
      created_by: 1
    },

    milestoneSnapshot: {
      fund_id: 1,
      snapshot_name: 'Series B Investment Milestone',
      description: 'State captured immediately after major Series B investment in AI Innovations',
      snapshot_type: 'milestone' as const,
      trigger_event: 'investment' as const,
      captured_at: '2024-11-15T16:30:00Z',
      portfolio_state: {
        totalValue: 2750000.00,
        deployedCapital: 2200000.00,
        availableCapital: 300000.00,
        portfolioCount: 19,
        companies: [
          {
            id: 4,
            name: 'AI Innovations Inc',
            valuation: 500000.00,
            ownership: 0.20,
            stage: 'Series B',
            sector: 'Technology',
            investmentDate: '2024-11-15T16:30:00Z',
            lastValuationDate: '2024-11-15T16:30:00Z',
            status: 'active'
          }
          // ... other existing companies
        ],
        sectorBreakdown: {
          'Technology': 0.40, // Increased due to new investment
          'Healthcare': 0.25,
          'Financial Services': 0.20,
          'Consumer': 0.10,
          'Other': 0.05
        }
      },
      fund_metrics: {
        irr: 0.1950,
        multiple: 1.5000,
        dpi: 0.9500,
        tvpi: 1.4200,
        moic: 1.4800,
        unrealizedValue: 2350000.00,
        realizedValue: 400000.00
      },
      event_context: {
        triggerEventId: 'evt_series_b_001',
        eventType: 'investment',
        eventDescription: 'Series B investment of $500K in AI Innovations Inc',
        relatedEntities: [
          { type: 'company', id: 4, name: 'AI Innovations Inc' },
          { type: 'user', id: 1, name: 'Portfolio Manager' }
        ]
      },
      status: 'active' as const,
      tags: ['milestone', 'series-b', 'ai-investment'],
      created_by: 1
    },

    preExitSnapshot: {
      fund_id: 1,
      snapshot_name: 'Pre-Exit State - LegacyCorp',
      description: 'Portfolio state captured before LegacyCorp exit transaction',
      snapshot_type: 'milestone' as const,
      trigger_event: 'exit_preparation' as const,
      captured_at: '2024-10-15T14:00:00Z',
      portfolio_state: {
        totalValue: 2600000.00,
        deployedCapital: 2000000.00,
        availableCapital: 400000.00,
        portfolioCount: 19,
        companies: [
          {
            id: 5,
            name: 'LegacyCorp',
            valuation: 300000.00,
            ownership: 0.25,
            stage: 'Series A',
            sector: 'Consumer',
            investmentDate: '2022-08-10T00:00:00Z',
            lastValuationDate: '2024-10-15T00:00:00Z',
            status: 'exit_pending',
            exitDetails: {
              exitType: 'acquisition',
              buyer: 'MegaCorp Industries',
              expectedValue: 450000.00,
              expectedCloseDate: '2024-10-31T00:00:00Z'
            }
          }
        ]
      },
      fund_metrics: {
        irr: 0.1750,
        multiple: 1.4200,
        dpi: 0.8900,
        tvpi: 1.3600
      },
      event_context: {
        triggerEventId: 'evt_exit_prep_001',
        eventType: 'exit_preparation',
        eventDescription: 'Pre-exit valuation and portfolio snapshot for LegacyCorp acquisition',
        relatedEntities: [
          { type: 'company', id: 5, name: 'LegacyCorp' },
          { type: 'buyer', id: 'megacorp', name: 'MegaCorp Industries' }
        ]
      },
      status: 'active' as const,
      tags: ['pre-exit', 'acquisition', 'legacycorp'],
      created_by: 1
    },

    emergencySnapshot: {
      fund_id: 1,
      snapshot_name: 'Emergency Market Snapshot',
      description: 'Emergency snapshot during market volatility event',
      snapshot_type: 'emergency' as const,
      trigger_event: 'market_event' as const,
      captured_at: '2024-12-01T09:30:00Z',
      portfolio_state: {
        totalValue: 2200000.00, // Significant decline
        deployedCapital: 2000000.00,
        availableCapital: 500000.00,
        portfolioCount: 18,
        marketConditions: {
          volatilityIndex: 0.35,
          marketSentiment: 'bearish',
          sectorImpact: {
            'Technology': -0.15,
            'Healthcare': -0.08,
            'Financial Services': -0.12,
            'Consumer': -0.20
          }
        }
      },
      fund_metrics: {
        irr: 0.1450,
        multiple: 1.3500,
        dpi: 0.8800,
        tvpi: 1.2900
      },
      event_context: {
        triggerEventId: 'evt_market_001',
        eventType: 'market_event',
        eventDescription: 'Federal Reserve announcement triggered market volatility',
        externalFactors: [
          'Federal Reserve rate announcement',
          'Tech sector rotation',
          'Geopolitical uncertainty'
        ]
      },
      status: 'active' as const,
      urgency: 'high',
      tags: ['emergency', 'market-volatility', 'fed-announcement'],
      created_by: 1
    }
  },

  // Snapshot comparison fixtures
  comparisons: {
    periodOverPeriod: {
      base_snapshot_id: '', // To be set in tests
      compare_snapshot_id: '', // To be set in tests
      comparison_name: 'Q3 vs Q4 2024 Performance Analysis',
      comparison_type: 'period_over_period' as const,
      comparison_period: '2024-09-30 to 2024-12-31',
      value_changes: {
        totalValueChange: 150000.00,
        totalValueChangePct: 0.064,
        deployedCapitalChange: 100000.00,
        availableCapitalChange: -50000.00,
        portfolioCountChange: 1,
        irrChange: 0.015,
        multipleChange: 0.080,
        dpiChange: 0.025,
        tvpiChange: 0.055
      },
      portfolio_changes: {
        newInvestments: [
          {
            companyId: 4,
            companyName: 'AI Innovations Inc',
            investmentAmount: 500000.00,
            valuation: 500000.00,
            stage: 'Series B'
          }
        ],
        exits: [],
        valuationChanges: [
          {
            companyId: 1,
            companyName: 'TechCorp Alpha',
            previousValuation: 450000.00,
            currentValuation: 500000.00,
            change: 50000.00,
            changePct: 0.111
          },
          {
            companyId: 2,
            companyName: 'HealthTech Beta',
            previousValuation: 380000.00,
            currentValuation: 400000.00,
            change: 20000.00,
            changePct: 0.053
          }
        ],
        statusChanges: [],
        sectorRebalancing: {
          'Technology': { from: 0.32, to: 0.35, change: 0.03 },
          'Healthcare': { from: 0.30, to: 0.28, change: -0.02 },
          'Financial Services': { from: 0.22, to: 0.22, change: 0.00 }
        }
      },
      insights: {
        topDrivers: [
          'Strong Q4 performance in TechCorp Alpha',
          'Successful Series B investment in AI sector',
          'Market recovery in technology sector'
        ],
        concerns: [
          'Slight decline in healthcare allocation',
          'Increased sector concentration risk'
        ],
        recommendations: [
          'Monitor technology sector concentration',
          'Consider healthcare sector opportunities',
          'Review diversification targets'
        ],
        overallTrend: 'positive',
        riskLevel: 'medium',
        confidenceScore: 0.88
      },
      metrics_comparison: {
        performance: {
          irr: { before: 0.170, after: 0.185, variance: 0.015, trend: 'improving' },
          multiple: { before: 1.370, after: 1.450, variance: 0.080, trend: 'improving' },
          tvpi: { before: 1.325, after: 1.380, variance: 0.055, trend: 'improving' }
        },
        portfolio: {
          diversification: { before: 0.75, after: 0.72, variance: -0.03, trend: 'declining' },
          averageAge: { before: 18.5, after: 17.8, variance: -0.7, trend: 'younger' },
          stageBalance: { before: 0.82, after: 0.85, variance: 0.03, trend: 'improving' }
        }
      },
      calculation_metadata: {
        engine: 'comparison-v1.2',
        calculationTime: 1750,
        dataQuality: 0.94,
        methodology: 'weighted_average_comparison'
      },
      confidence_score: 0.88,
      created_by: 1
    },

    beforeAfterEvent: {
      base_snapshot_id: '', // Pre-investment snapshot
      compare_snapshot_id: '', // Post-investment snapshot
      comparison_name: 'Before/After AI Innovations Investment',
      comparison_type: 'before_after_event' as const,
      event_reference: {
        eventId: 'evt_series_b_001',
        eventType: 'investment',
        eventDate: '2024-11-15T16:30:00Z',
        description: 'Series B investment in AI Innovations Inc'
      },
      value_changes: {
        totalValueChange: 250000.00,
        totalValueChangePct: 0.10,
        deployedCapitalChange: 200000.00,
        portfolioCountChange: 1
      },
      portfolio_changes: {
        newInvestments: [
          {
            companyId: 4,
            companyName: 'AI Innovations Inc',
            investmentAmount: 500000.00,
            ownership: 0.20,
            stage: 'Series B',
            sector: 'Technology'
          }
        ],
        directImpact: {
          sectorRebalancing: {
            'Technology': { change: 0.05, newWeight: 0.40 }
          },
          stageRebalancing: {
            'Series B': { change: 0.05, newWeight: 0.35 }
          }
        }
      },
      insights: {
        investmentImpact: {
          immediate: 'Increased technology sector exposure',
          strategic: 'Enhanced AI/ML portfolio presence',
          risk: 'Increased concentration in early-stage tech'
        },
        performance: {
          projectedIRR: 0.205,
          projectedMultiple: 1.65,
          riskAdjustedReturn: 0.185
        }
      },
      confidence_score: 0.91,
      created_by: 1
    },

    marketRecovery: {
      base_snapshot_id: '', // Emergency snapshot during volatility
      compare_snapshot_id: '', // Recovery snapshot
      comparison_name: 'Market Recovery Analysis',
      comparison_type: 'recovery_analysis' as const,
      comparison_period: '2024-12-01 to 2024-12-31',
      value_changes: {
        totalValueChange: 300000.00,
        totalValueChangePct: 0.136,
        portfolioRecovery: true
      },
      market_analysis: {
        volatilityRecovery: {
          peakVolatility: 0.35,
          endVolatility: 0.18,
          recoveryRate: 0.486
        },
        sectorRecovery: {
          'Technology': { recovery: 0.80, performance: 'strong' },
          'Healthcare': { recovery: 0.65, performance: 'moderate' },
          'Financial Services': { recovery: 0.70, performance: 'moderate' },
          'Consumer': { recovery: 0.45, performance: 'weak' }
        }
      },
      insights: {
        resilience: 'Portfolio showed strong resilience to market volatility',
        drivers: ['Technology sector recovery', 'Defensive positioning', 'Quality of portfolio companies'],
        lessons: ['Diversification strategy effective', 'Emergency procedures worked well']
      },
      confidence_score: 0.85,
      created_by: 1
    }
  },

  // Timeline event fixtures
  events: {
    investmentEvent: {
      fund_id: 1,
      event_type: 'investment' as const,
      event_title: 'Series B Investment - AI Innovations',
      event_description: 'Led $500K Series B round in AI Innovations Inc, bringing our ownership to 20%',
      event_date: '2024-11-15T16:30:00Z',
      severity: 'high' as const,
      event_data: {
        transaction: {
          id: 'TXN-2024-AI-001',
          type: 'equity_investment',
          amount: 500000.00,
          currency: 'USD',
          exchangeRate: 1.0
        },
        company: {
          id: 4,
          name: 'AI Innovations Inc',
          sector: 'Technology',
          subsector: 'Artificial Intelligence',
          stage: 'Series B',
          location: 'San Francisco, CA',
          foundedDate: '2021-03-01',
          employees: 45
        },
        investment: {
          round: 'Series B',
          totalRoundSize: 2500000.00,
          valuation: 10000000.00,
          preMoney: 7500000.00,
          postMoney: 10000000.00,
          ownership: 0.20,
          shares: 200000,
          pricePerShare: 2.50
        },
        terms: {
          liquidationPreference: '1x non-participating preferred',
          dividends: '8% cumulative',
          boardSeats: 1,
          proRataRights: true,
          antiDilution: 'weighted average narrow',
          dragAlong: true,
          tagAlong: true
        },
        coinvestors: [
          { name: 'TechVenture Partners', amount: 1000000.00, ownership: 0.40 },
          { name: 'AI Focus Fund', amount: 750000.00, ownership: 0.30 },
          { name: 'Strategic Corp Ventures', amount: 250000.00, ownership: 0.10 }
        ]
      },
      impact_metrics: {
        portfolioValueIncrease: 500000.00,
        ownershipDilution: 0.001, // Minimal dilution to existing holdings
        sectorRebalancing: {
          'Technology': { from: 0.35, to: 0.40, impact: 'increased_exposure' },
          'AI/ML': { from: 0.08, to: 0.15, impact: 'significant_increase' }
        },
        stageRebalancing: {
          'Series B': { from: 0.30, to: 0.35, impact: 'balanced_growth' }
        },
        riskProfile: {
          overall: 'medium-high',
          concentration: 'manageable',
          diversification: 'adequate'
        },
        expectedReturns: {
          projectedIRR: 0.205,
          projectedMultiple: 1.65,
          timeToExit: '5-7 years',
          exitProbability: 0.75
        }
      },
      related_entities: [
        { type: 'company', id: 4, name: 'AI Innovations Inc', role: 'investee' },
        { type: 'user', id: 1, name: 'Portfolio Manager', role: 'decision_maker' },
        { type: 'user', id: 2, name: 'Investment Committee', role: 'approver' }
      ],
      workflow_status: 'completed',
      approvals: [
        { approver: 'Investment Committee', approved_at: '2024-11-10T14:00:00Z' },
        { approver: 'GP', approved_at: '2024-11-12T10:30:00Z' }
      ],
      documents: [
        'term_sheet_ai_innovations_series_b.pdf',
        'due_diligence_report_ai_innovations.pdf',
        'investment_memo_ai_innovations.pdf'
      ],
      tags: ['series-b', 'ai', 'technology', 'high-growth'],
      created_by: 1
    },

    exitEvent: {
      fund_id: 1,
      event_type: 'exit' as const,
      event_title: 'LegacyCorp Acquisition Exit',
      event_description: 'Successful exit through acquisition by MegaCorp Industries for $450K (1.5x return)',
      event_date: '2024-10-31T15:00:00Z',
      severity: 'high' as const,
      event_data: {
        transaction: {
          id: 'TXN-2024-EXIT-001',
          type: 'acquisition_exit',
          totalProceeds: 450000.00,
          fundProceeds: 450000.00, // 100% ownership
          currency: 'USD'
        },
        company: {
          id: 5,
          name: 'LegacyCorp',
          sector: 'Consumer',
          stage: 'Series A',
          originalInvestment: 300000.00,
          totalInvested: 300000.00,
          ownership: 1.00,
          investmentDate: '2022-08-10T00:00:00Z',
          holdingPeriod: '2 years, 2 months'
        },
        exit: {
          type: 'acquisition',
          buyer: 'MegaCorp Industries',
          buyerType: 'strategic',
          exitMultiple: 1.50,
          irr: 0.20,
          cashReturn: 450000.00,
          stockReturn: 0.00,
          earnoutPotential: 50000.00,
          earnoutTriggers: ['revenue_target_2025', 'integration_milestones']
        },
        process: {
          banker: 'ExitBankers LLC',
          processType: 'auction',
          timelineWeeks: 16,
          competitiveBids: 3,
          winningBidPremium: 0.12
        }
      },
      impact_metrics: {
        portfolioValueChange: -300000.00, // Company removed from portfolio
        portfolioCountChange: -1,
        realizedValue: 450000.00,
        unrealizedValueReduction: 300000.00,
        cashDistribution: 450000.00,
        distributionYield: 0.50, // As percentage of fund size
        irr_impact: 0.015, // Positive impact on fund IRR
        multiple_impact: 0.05, // Positive impact on fund multiple
        dpi_impact: 0.18, // Significant DPI improvement
        sectorRebalancing: {
          'Consumer': { from: 0.10, to: 0.08, impact: 'reduced_exposure' }
        }
      },
      workflow_status: 'completed',
      distribution_details: {
        distributionDate: '2024-11-15T00:00:00Z',
        lpDistribution: 360000.00, // 80% to LPs
        managementFee: 45000.00, // 10% management fee
        carriedInterest: 45000.00, // 10% carried interest
        expenses: 0.00
      },
      tags: ['exit', 'acquisition', 'consumer', 'successful'],
      created_by: 1
    },

    valuationEvent: {
      fund_id: 1,
      event_type: 'valuation' as const,
      event_title: 'TechCorp Alpha Valuation Update',
      event_description: 'Quarterly valuation update shows 25% increase based on strong revenue growth',
      event_date: '2024-12-31T17:00:00Z',
      severity: 'medium' as const,
      event_data: {
        company: {
          id: 1,
          name: 'TechCorp Alpha',
          sector: 'Technology',
          stage: 'Series A'
        },
        valuation: {
          previous: 400000.00,
          current: 500000.00,
          change: 100000.00,
          changePct: 0.25,
          method: 'revenue_multiple',
          multiple: 5.5,
          revenue: 90909.09, // Annual revenue
          revenueGrowth: 0.45
        },
        drivers: [
          'Strong Q4 revenue performance (+45% YoY)',
          'New enterprise customer acquisitions',
          'Product feature expansion',
          'Market expansion into Europe'
        ],
        metrics: {
          arr: 100000.00, // Annual Recurring Revenue
          arrGrowth: 0.50,
          customerCount: 150,
          customerGrowth: 0.30,
          churn: 0.05,
          ltv_cac: 4.2
        }
      },
      impact_metrics: {
        portfolioValueIncrease: 100000.00,
        ownership: 0.15,
        fundValueIncrease: 15000.00, // Our 15% ownership
        unrealizedGain: 115000.00, // Total unrealized gain
        irr_impact: 0.005,
        multiple_impact: 0.02
      },
      validation: {
        methodology: 'Comparable company analysis using SaaS multiples',
        benchmarks: [
          { company: 'PublicTech A', multiple: 6.2, revenue: 150000000 },
          { company: 'PublicTech B', multiple: 5.8, revenue: 95000000 },
          { company: 'PublicTech C', multiple: 4.9, revenue: 75000000 }
        ],
        discounts: {
          illiquidity: 0.15,
          size: 0.10,
          marketRisk: 0.05
        }
      },
      tags: ['valuation', 'technology', 'growth', 'quarterly'],
      created_by: 1
    },

    marketEvent: {
      fund_id: 1,
      event_type: 'market_event' as const,
      event_title: 'Federal Reserve Rate Decision Impact',
      event_description: 'Market volatility following Fed rate announcement affects portfolio valuations',
      event_date: '2024-12-01T14:30:00Z',
      severity: 'critical' as const,
      event_data: {
        marketEvent: {
          type: 'federal_reserve_announcement',
          announcement: '75 basis point rate increase',
          marketReaction: 'negative',
          volatilityIncrease: 0.40
        },
        portfolioImpact: {
          immediateImpact: -0.12, // 12% decline
          recoveryTimeframe: '2-4 weeks',
          affectedSectors: ['Technology', 'Growth Companies'],
          safeSectors: ['Healthcare', 'Defensive']
        },
        companyImpacts: [
          {
            companyId: 1,
            name: 'TechCorp Alpha',
            impact: -0.15,
            reasoning: 'High-growth tech sensitive to rates'
          },
          {
            companyId: 2,
            name: 'HealthTech Beta',
            impact: -0.08,
            reasoning: 'Healthcare more defensive'
          }
        ]
      },
      impact_metrics: {
        portfolioValueChange: -300000.00,
        unrealizedValueChange: -300000.00,
        irrImpact: -0.025,
        multipleImpact: -0.08,
        marketBeta: 1.15, // Portfolio beta to market
        recoveryProbability: 0.75
      },
      response_actions: [
        'Increased monitoring of portfolio companies',
        'Prepared emergency capital deployment',
        'Enhanced LP communication',
        'Reviewed hedging strategies'
      ],
      tags: ['market-event', 'federal-reserve', 'volatility', 'rates'],
      created_by: 1
    }
  },

  // State restoration log fixtures
  restorationLogs: {
    fullRestoration: {
      fund_id: 1,
      restoration_type: 'full' as const,
      reason: 'Board presentation scenario analysis - What if we had not made the AI investment?',
      changes_applied: {
        portfolioChanges: 3,
        metricRecalculations: 5,
        dataUpdates: ['portfolio_state', 'fund_metrics', 'reserve_metrics', 'pacing_metrics'],
        restoredEntities: [
          { type: 'company', id: 4, action: 'removed' },
          { type: 'metrics', category: 'fund_level', action: 'recalculated' },
          { type: 'allocation', category: 'sector', action: 'rebalanced' }
        ]
      },
      before_state: {
        totalValue: 2750000.00,
        portfolioCount: 19,
        deployedCapital: 2200000.00,
        irr: 0.1950,
        multiple: 1.5000,
        sectorAllocation: {
          'Technology': 0.40,
          'Healthcare': 0.25,
          'Financial Services': 0.20,
          'Consumer': 0.10,
          'Other': 0.05
        }
      },
      after_state: {
        totalValue: 2250000.00,
        portfolioCount: 18,
        deployedCapital: 1700000.00,
        irr: 0.1750,
        multiple: 1.4200,
        sectorAllocation: {
          'Technology': 0.35,
          'Healthcare': 0.28,
          'Financial Services': 0.22,
          'Consumer': 0.10,
          'Other': 0.05
        }
      },
      affected_entities: {
        companies: [4], // AI Innovations removed
        metrics: ['irr', 'multiple', 'dpi', 'tvpi', 'sector_allocation'],
        calculations: ['portfolio_value', 'deployment_rate', 'pacing_metrics'],
        dependencies: ['reserve_allocation', 'risk_metrics']
      },
      validation: {
        dataIntegrityChecks: 15,
        checksPasssed: 15,
        checksWwarnings: 0,
        checksErrors: 0,
        recalculationAccuracy: 0.9999
      },
      restoration_duration_ms: 3250,
      success: true,
      status: 'completed' as const,
      initiated_by: 1,
      session_context: {
        sessionId: 'board-scenario-001',
        purpose: 'board_presentation',
        attendees: ['Portfolio Manager', 'GP', 'Board Members'],
        scenarioName: 'Conservative Investment Strategy'
      }
    },

    partialRestoration: {
      fund_id: 1,
      restoration_type: 'partial' as const,
      reason: 'Correct valuation error in Q3 for single company',
      changes_applied: {
        portfolioChanges: 1,
        metricRecalculations: 2,
        dataUpdates: ['company_valuation', 'portfolio_metrics'],
        restoredEntities: [
          { type: 'company', id: 2, action: 'valuation_corrected' },
          { type: 'metrics', category: 'portfolio_level', action: 'recalculated' }
        ]
      },
      before_state: {
        company2Valuation: 380000.00,
        portfolioValue: 2480000.00,
        irr: 0.1820
      },
      after_state: {
        company2Valuation: 400000.00,
        portfolioValue: 2500000.00,
        irr: 0.1850
      },
      affected_entities: {
        companies: [2], // HealthTech Beta
        metrics: ['portfolio_value', 'irr', 'healthcare_allocation'],
        calculations: ['sector_weightings']
      },
      restoration_duration_ms: 850,
      success: true,
      status: 'completed' as const,
      initiated_by: 1
    },

    failedRestoration: {
      fund_id: 1,
      restoration_type: 'full' as const,
      reason: 'Attempt to restore to corrupted snapshot',
      changes_applied: {
        portfolioChanges: 0,
        metricRecalculations: 0,
        dataUpdates: [],
        errors: [
          'Snapshot data integrity check failed',
          'Missing required portfolio state data',
          'Inconsistent fund metrics'
        ]
      },
      before_state: {
        totalValue: 2500000.00,
        portfolioCount: 18
      },
      after_state: {
        totalValue: 2500000.00,
        portfolioCount: 18
      },
      affected_entities: {
        companies: [],
        metrics: [],
        calculations: []
      },
      validation: {
        dataIntegrityChecks: 10,
        checksPasssed: 7,
        checksWwarnings: 2,
        checksErrors: 1,
        errorDetails: [
          'Portfolio state checksum mismatch',
          'Missing company valuation data for company ID 3'
        ]
      },
      restoration_duration_ms: 125,
      success: false,
      status: 'failed' as const,
      error_message: 'Restoration failed due to data integrity issues in target snapshot',
      initiated_by: 1
    }
  },

  // Test scenarios for complex time-travel workflows
  scenarios: {
    quarterlyAnalysis: {
      description: 'Complete quarterly analysis workflow',
      steps: [
        { action: 'create_snapshot', type: 'quarterly', name: 'Q4 2024 Snapshot' },
        { action: 'compare_snapshots', type: 'period_over_period', baseline: 'q3_2024' },
        { action: 'analyze_changes', focus: ['performance', 'portfolio', 'risk'] },
        { action: 'generate_insights', depth: 'comprehensive' }
      ],
      expectedOutcomes: [
        'Quarterly snapshot created',
        'Period comparison completed',
        'Performance insights generated',
        'Risk analysis updated'
      ]
    },

    investmentScenario: {
      description: 'Investment decision scenario analysis',
      steps: [
        { action: 'create_snapshot', type: 'milestone', name: 'Pre-Investment State' },
        { action: 'model_investment', amount: 500000, company: 'NewCorp' },
        { action: 'restore_to_baseline', reason: 'scenario_analysis' },
        { action: 'compare_scenarios', scenarios: ['with_investment', 'without_investment'] }
      ],
      expectedOutcomes: [
        'Pre-investment snapshot captured',
        'Investment impact modeled',
        'Original state restored',
        'Scenario comparison available'
      ]
    },

    emergencyResponse: {
      description: 'Emergency market event response workflow',
      steps: [
        { action: 'trigger_emergency_snapshot', reason: 'market_volatility' },
        { action: 'assess_impact', scope: 'portfolio_wide' },
        { action: 'monitor_recovery', frequency: 'realtime' },
        { action: 'create_recovery_snapshot', condition: 'volatility_normalized' }
      ],
      expectedOutcomes: [
        'Emergency snapshot created',
        'Impact assessment completed',
        'Recovery monitoring active',
        'Recovery snapshot captured'
      ]
    }
  }
};

// Helper functions for time-travel test data generation
export const timeTravelTestHelpers = {
  /**
   * Generate random snapshot data for stress testing
   */
  generateRandomSnapshot(fundId: number, type: string = 'manual', overrides: Partial<any> = {}): any {
    const base = {
      fund_id: fundId,
      snapshot_name: `Random Snapshot ${Date.now()}`,
      snapshot_type: type,
      trigger_event: 'manual',
      captured_at: new Date().toISOString(),
      portfolio_state: {
        totalValue: Math.random() * 5000000 + 1000000,
        deployedCapital: Math.random() * 4000000 + 800000,
        portfolioCount: Math.floor(Math.random() * 30 + 5),
        companies: []
      },
      fund_metrics: {
        irr: Math.random() * 0.3 + 0.05,
        multiple: Math.random() * 2 + 1,
        dpi: Math.random() * 1.5,
        tvpi: Math.random() * 2 + 1
      },
      data_integrity_score: Math.random() * 0.3 + 0.7,
      created_by: 1,
      ...overrides
    };
    return base;
  },

  /**
   * Generate comparison data between two snapshots
   */
  generateComparison(baseSnapshot: any, compareSnapshot: any, type: string = 'period_over_period'): any {
    const baseValue = baseSnapshot.portfolio_state.totalValue;
    const compareValue = compareSnapshot.portfolio_state.totalValue;
    const valueChange = compareValue - baseValue;
    const valueChangePct = valueChange / baseValue;

    return {
      base_snapshot_id: baseSnapshot.id,
      compare_snapshot_id: compareSnapshot.id,
      comparison_name: `Auto-generated comparison ${Date.now()}`,
      comparison_type: type,
      value_changes: {
        totalValueChange: valueChange,
        totalValueChangePct: valueChangePct,
        portfolioCountChange: compareSnapshot.portfolio_state.portfolioCount - baseSnapshot.portfolio_state.portfolioCount
      },
      portfolio_changes: {
        newInvestments: [],
        exits: [],
        valuationChanges: []
      },
      insights: {
        topDrivers: ['Auto-generated insight'],
        concerns: [],
        recommendations: ['Continue monitoring']
      },
      confidence_score: Math.random() * 0.3 + 0.7,
      created_by: 1
    };
  },

  /**
   * Generate timeline event data
   */
  generateTimelineEvent(fundId: number, snapshotId: string, type: string = 'investment'): any {
    const eventTypes = {
      investment: {
        title: 'New Investment',
        description: 'Investment in portfolio company',
        data: { amount: Math.random() * 1000000 + 100000 }
      },
      exit: {
        title: 'Portfolio Exit',
        description: 'Exit from portfolio company',
        data: { proceeds: Math.random() * 2000000 + 500000 }
      },
      valuation: {
        title: 'Valuation Update',
        description: 'Company valuation adjustment',
        data: { newValuation: Math.random() * 1000000 + 200000 }
      }
    };

    const eventData = eventTypes[type as keyof typeof eventTypes] || eventTypes.investment;

    return {
      fund_id: fundId,
      snapshot_id: snapshotId,
      event_type: type,
      event_title: eventData.title,
      event_description: eventData.description,
      event_date: new Date().toISOString(),
      event_data: eventData.data,
      impact_metrics: {
        portfolioValueImpact: Math.random() * 500000,
        riskImpact: Math.random() * 0.1 - 0.05
      },
      created_by: 1
    };
  },

  /**
   * Generate restoration log data
   */
  generateRestorationLog(fundId: number, snapshotId: string, type: string = 'full'): any {
    return {
      fund_id: fundId,
      snapshot_id: snapshotId,
      restoration_type: type,
      reason: 'Test restoration',
      changes_applied: {
        portfolioChanges: Math.floor(Math.random() * 10 + 1),
        metricRecalculations: Math.floor(Math.random() * 5 + 1)
      },
      before_state: {
        totalValue: Math.random() * 5000000 + 1000000
      },
      after_state: {
        totalValue: Math.random() * 5000000 + 1000000
      },
      affected_entities: {
        companies: [1, 2, 3],
        metrics: ['irr', 'multiple']
      },
      restoration_duration_ms: Math.floor(Math.random() * 5000 + 500),
      status: 'completed',
      initiated_by: 1
    };
  }
};