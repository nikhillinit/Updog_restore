/* eslint-disable @typescript-eslint/no-explicit-any */ // Pipeline seeding utilities
 
 
 
 
import { db } from './db';
import { dealOpportunities, dueDiligenceItems, scoringModels, pipelineActivities, marketResearch, financialProjections } from '@shared/schema';

async function seedPipelineData() {
  console.log('🌱 Seeding pipeline data...');

  // Sample deal opportunities
  const sampleOpportunities = [
    {
      fundId: 1,
      companyName: 'QuantumAI Labs',
      sector: 'Artificial Intelligence',
      stage: 'Series A',
      sourceType: 'Referral',
      dealSize: '3500000',
      valuation: '18000000',
      status: 'qualified',
      priority: 'high',
      foundedYear: 2021,
      employeeCount: 24,
      revenue: '850000',
      description: 'AI-powered quantum computing optimization platform',
      website: 'https://quantumai-labs.com',
      contactName: 'Dr. Sarah Chen',
      contactEmail: 'sarah@quantumai-labs.com',
      sourceNotes: 'Introduced by portfolio company CTO',
      nextAction: 'Schedule technical deep dive',
      nextActionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
    {
      fundId: 1,
      companyName: 'GreenGrid Energy',
      sector: 'CleanTech',
      stage: 'Seed',
      sourceType: 'Inbound',
      dealSize: '2000000',
      valuation: '12000000',
      status: 'pitch',
      priority: 'medium',
      foundedYear: 2022,
      employeeCount: 18,
      revenue: '320000',
      description: 'Smart grid optimization for renewable energy',
      website: 'https://greengrid.energy',
      contactName: 'Alex Rodriguez',
      contactEmail: 'alex@greengrid.energy',
      sourceNotes: 'Applied through our website',
      nextAction: 'Investment committee presentation',
      nextActionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    },
    {
      fundId: 1,
      companyName: 'MedFlow Diagnostics',
      sector: 'Healthcare',
      stage: 'Series B',
      sourceType: 'Event',
      dealSize: '8000000',
      valuation: '45000000',
      status: 'dd',
      priority: 'high',
      foundedYear: 2019,
      employeeCount: 67,
      revenue: '4200000',
      description: 'Point-of-care diagnostic testing platform',
      website: 'https://medflow.diagnostics',
      contactName: 'Dr. Michael Park',
      contactEmail: 'michael@medflow.diagnostics',
      sourceNotes: 'Met at HealthTech Summit 2024',
      nextAction: 'Financial model review',
      nextActionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    }
  ];

  // Insert opportunities and get IDs
  const insertedOpportunities = await db
    .insert(dealOpportunities)
    .values(sampleOpportunities)
    .returning();

  console.log(`✅ Inserted ${insertedOpportunities.length} deal opportunities`);

  // Sample due diligence items for the first opportunity
  const sampleDDItems = [
    {
      opportunityId: insertedOpportunities[0]!.id,
      category: 'Financial',
      item: 'Review audited financials (last 3 years)',
      description: 'Analyze revenue growth, burn rate, and cash flow',
      status: 'completed',
      priority: 'high',
      assignedTo: 'Finance Team',
      completedDate: new Date(),
      notes: 'Strong revenue growth, healthy margins'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      category: 'Technical',
      item: 'Technical architecture review',
      description: 'Assess scalability and security of quantum algorithms',
      status: 'in_progress',
      priority: 'high',
      assignedTo: 'Tech Advisory Board',
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      category: 'Market',
      item: 'Competitive landscape analysis',
      description: 'Map key competitors and differentiation',
      status: 'pending',
      priority: 'medium',
      assignedTo: 'Investment Team',
      dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    }
  ];

  await db.insert(dueDiligenceItems).values(sampleDDItems);
  console.log(`✅ Inserted ${sampleDDItems.length} due diligence items`);

  // Sample scoring models
  const sampleScores = [
    {
      opportunityId: insertedOpportunities[0]!.id,
      criteriaName: 'Team',
      score: 9,
      weight: "0.25",
      notes: 'Exceptional founding team with deep domain expertise',
      scoredBy: 'Investment Partner'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      criteriaName: 'Market',
      score: 8,
      weight: "0.20",
      notes: 'Large addressable market with growing demand',
      scoredBy: 'Investment Partner'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      criteriaName: 'Product',
      score: 9,
      weight: "0.25",
      notes: 'Breakthrough technology with strong IP position',
      scoredBy: 'Technical Advisor'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      criteriaName: 'Traction',
      score: 7,
      weight: "0.20",
      notes: 'Good early customer validation, need more enterprise deals',
      scoredBy: 'Investment Associate'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      criteriaName: 'Financials',
      score: 8,
      weight: "0.10",
      notes: 'Strong unit economics and capital efficiency',
      scoredBy: 'Finance Team'
    }
  ];

  await db.insert(scoringModels).values(sampleScores);
  console.log(`✅ Inserted ${sampleScores.length} scoring model entries`);

  // Sample pipeline activities
  const sampleActivities = [
    {
      opportunityId: insertedOpportunities[0]!.id,
      type: 'meeting',
      title: 'Initial Partner Meeting',
      description: 'First meeting with founding team',
      outcome: 'Positive impression, moving to next stage',
      participants: [
        { name: 'Sarah Chen', role: 'CEO' },
        { name: 'Investment Partner', role: 'Partner' }
      ],
      completedDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      createdBy: 'Investment Partner'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      type: 'call',
      title: 'Customer Reference Call',
      description: 'Call with Fortune 500 customer',
      outcome: 'Strong validation of product-market fit',
      participants: [
        { name: 'Enterprise Customer CTO', role: 'Reference' },
        { name: 'Investment Associate', role: 'VC Team' }
      ],
      completedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      followUpRequired: true,
      followUpDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: 'Investment Associate'
    }
  ];

  await db.insert(pipelineActivities).values(sampleActivities);
  console.log(`✅ Inserted ${sampleActivities.length} pipeline activities`);

  // Sample market research
  const sampleResearch = {
    opportunityId: insertedOpportunities[0]!.id,
    sector: 'Artificial Intelligence',
    marketSize: '156000000000',
    growthRate: '38.1',
    competitorAnalysis: {
      direct: ['IBM Quantum', 'Google Quantum AI', 'Rigetti Computing'],
      indirect: ['AWS Braket', 'Microsoft Azure Quantum'],
      differentiation: 'Focus on optimization algorithms for specific industries'
    },
    marketTrends: 'Quantum computing moving from research to commercial applications',
    riskFactors: 'Technology still early, regulatory uncertainty',
    opportunities: 'First-mover advantage in quantum optimization',
    researchedBy: 'Investment Team',
    sources: [
      { type: 'report', title: 'McKinsey Quantum Computing Report 2024' },
      { type: 'interview', title: 'Customer interviews (5)' }
    ]
  };

  await db.insert(marketResearch).values([sampleResearch]);
  console.log(`✅ Inserted market research`);

  // Sample financial projections
  const sampleProjections = [
    {
      opportunityId: insertedOpportunities[0]!.id,
      year: 2025,
      revenue: '2500000',
      revenueGrowth: '180',
      grossMargin: '72',
      burnRate: '450000',
      runwayMonths: 18,
      customerCount: 12,
      arr: '2200000',
      ltv: '890000',
      cac: '45000',
      projectionType: 'management',
      assumptions: 'Assumes successful Series A and 3 major enterprise deals'
    },
    {
      opportunityId: insertedOpportunities[0]!.id,
      year: 2026,
      revenue: '8500000',
      revenueGrowth: '240',
      grossMargin: '75',
      burnRate: '650000',
      runwayMonths: 24,
      customerCount: 35,
      arr: '7800000',
      ltv: '1200000',
      cac: '52000',
      projectionType: 'management',
      assumptions: 'Market expansion and product line diversification'
    }
  ];

  await db.insert(financialProjections).values(sampleProjections);
  console.log(`✅ Inserted ${sampleProjections.length} financial projections`);

  console.log('🎉 Pipeline data seeding completed successfully!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]!}`) {
  seedPipelineData()
    .then(() => process.exit(0))
    .catch((error: any) => {
      console.error('❌ Error seeding pipeline data:', error);
      process.exit(1);
    });
}

export { seedPipelineData };
