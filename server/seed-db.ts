import { db } from "./db";
import { funds, portfolioCompanies, investments, fundMetrics, activities } from "@shared/schema";

// Self-executing script when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log("Database seeding completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Database seeding failed:", error);
      process.exit(1);
    });
}

export async function seedDatabase() {
  console.log("🌱 Seeding database with sample data...");
  
  try {
    // Insert sample fund
    const [fund] = await db.insert(funds).values({
      name: "Press On Ventures Fund I",
      size: "100000000",
      deployedCapital: "67500000",
      managementFee: "0.02",
      carryPercentage: "0.20",
      vintageYear: 2020,
      status: "active"
    }).returning();

    console.log("✅ Created fund:", fund.name);

    // Insert sample portfolio companies
    const portfolioData = [
      {
        fundId: fund.id,
        name: "FinTech Innovations",
        sector: "Fintech",
        stage: "Series A",
        investmentAmount: "2500000",
        currentValuation: "15000000",
        foundedYear: 2019,
        status: "active",
        description: "Digital banking platform for SMEs"
      },
      {
        fundId: fund.id,
        name: "HealthTech Solutions",
        sector: "Healthcare",
        stage: "Seed",
        investmentAmount: "1500000",
        currentValuation: "8000000",
        foundedYear: 2020,
        status: "active",
        description: "AI-powered diagnostic platform"
      },
      {
        fundId: fund.id,
        name: "EcoTech Dynamics",
        sector: "CleanTech",
        stage: "Series B",
        investmentAmount: "5000000",
        currentValuation: "25000000",
        foundedYear: 2018,
        status: "active",
        description: "Sustainable energy storage solutions"
      }
    ];

    const companies = await db.insert(portfolioCompanies).values(portfolioData).returning();
    console.log("✅ Created portfolio companies:", companies.length);

    // Insert sample investments
    const investmentData = [
      {
        fundId: fund.id,
        companyId: companies[0].id,
        investmentDate: new Date("2021-03-15"),
        amount: "2500000",
        round: "Series A",
        ownershipPercentage: "0.15",
        valuationAtInvestment: "16666667"
      },
      {
        fundId: fund.id,
        companyId: companies[1].id,
        investmentDate: new Date("2021-06-20"),
        amount: "1500000",
        round: "Seed",
        ownershipPercentage: "0.20",
        valuationAtInvestment: "7500000"
      },
      {
        fundId: fund.id,
        companyId: companies[2].id,
        investmentDate: new Date("2021-09-10"),
        amount: "5000000",
        round: "Series B",
        ownershipPercentage: "0.12",
        valuationAtInvestment: "41666667"
      }
    ];

    const investmentRecords = await db.insert(investments).values(investmentData).returning();
    console.log("✅ Created investments:", investmentRecords.length);

    // Insert sample fund metrics
    const metricsData = [
      {
        fundId: fund.id,
        metricDate: new Date("2023-12-31"),
        totalValue: "48000000",
        irr: "0.284",
        multiple: "1.42",
        dpi: "0.18",
        tvpi: "1.24"
      },
      {
        fundId: fund.id,
        metricDate: new Date("2024-06-30"),
        totalValue: "52000000",
        irr: "0.295",
        multiple: "1.54",
        dpi: "0.22",
        tvpi: "1.32"
      }
    ];

    const metrics = await db.insert(fundMetrics).values(metricsData).returning();
    console.log("✅ Created fund metrics:", metrics.length);

    // Insert sample activities
    const activitiesData = [
      {
        fundId: fund.id,
        companyId: companies[0].id,
        title: "Investment Completed",
        type: "investment",
        activityDate: new Date("2021-03-15"),
        description: "Series A investment of $2.5M in FinTech Innovations",
        amount: "2500000"
      },
      {
        fundId: fund.id,
        companyId: companies[1].id,
        title: "Due Diligence Started",
        type: "milestone",
        activityDate: new Date("2021-05-10"),
        description: "Commenced due diligence process for HealthTech Solutions"
      },
      {
        fundId: fund.id,
        title: "Fund Closing",
        type: "fund_milestone",
        activityDate: new Date("2020-12-01"),
        description: "Successfully closed Press On Ventures Fund I at $100M"
      },
      {
        fundId: fund.id,
        companyId: companies[2].id,
        title: "Board Meeting",
        type: "governance",
        activityDate: new Date("2024-01-15"),
        description: "Quarterly board meeting with EcoTech Dynamics"
      }
    ];

    const activityRecords = await db.insert(activities).values(activitiesData).returning();
    console.log("✅ Created activities:", activityRecords.length);

    console.log("🎉 Database seeding completed successfully!");
    
    return {
      fund,
      companies,
      investments: investmentRecords,
      metrics,
      activities: activityRecords
    };
    
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}