import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFundSchema, insertPortfolioCompanySchema, insertActivitySchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Fund routes
  app.get("/api/funds", async (req, res) => {
    try {
      const funds = await storage.getAllFunds();
      res.json(funds);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch funds" });
    }
  });

  app.get("/api/funds/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const fund = await storage.getFund(id);
      if (!fund) {
        return res.status(404).json({ message: "Fund not found" });
      }
      res.json(fund);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch fund" });
    }
  });

  app.post("/api/funds", async (req, res) => {
    try {
      const result = insertFundSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid fund data", errors: result.error.issues });
      }
      const fund = await storage.createFund(result.data);
      res.status(201).json(fund);
    } catch (error) {
      res.status(500).json({ message: "Failed to create fund" });
    }
  });

  // Portfolio company routes
  app.get("/api/portfolio-companies", async (req, res) => {
    try {
      const fundId = req.query.fundId ? parseInt(req.query.fundId as string) : undefined;
      const companies = await storage.getPortfolioCompanies(fundId);
      res.json(companies);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio companies" });
    }
  });

  app.get("/api/portfolio-companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getPortfolioCompany(id);
      if (!company) {
        return res.status(404).json({ message: "Portfolio company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio company" });
    }
  });

  app.post("/api/portfolio-companies", async (req, res) => {
    try {
      const result = insertPortfolioCompanySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid company data", errors: result.error.issues });
      }
      const company = await storage.createPortfolioCompany(result.data);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ message: "Failed to create portfolio company" });
    }
  });

  // Fund metrics routes
  app.get("/api/fund-metrics/:fundId", async (req, res) => {
    try {
      const fundId = parseInt(req.params.fundId);
      const metrics = await storage.getFundMetrics(fundId);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch fund metrics" });
    }
  });

  // Activity routes
  app.get("/api/activities", async (req, res) => {
    try {
      const fundId = req.query.fundId ? parseInt(req.query.fundId as string) : undefined;
      const activities = await storage.getActivities(fundId);
      res.json(activities.sort((a, b) => b.activityDate.getTime() - a.activityDate.getTime()));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const result = insertActivitySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid activity data", errors: result.error.issues });
      }
      const activity = await storage.createActivity(result.data);
      res.status(201).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to create activity" });
    }
  });

  // Dashboard summary route
  app.get("/api/dashboard-summary/:fundId", async (req, res) => {
    try {
      const fundId = parseInt(req.params.fundId);
      
      const [fund, portfolioCompanies, activities, metrics] = await Promise.all([
        storage.getFund(fundId),
        storage.getPortfolioCompanies(fundId),
        storage.getActivities(fundId),
        storage.getFundMetrics(fundId),
      ]);

      if (!fund) {
        return res.status(404).json({ message: "Fund not found" });
      }

      const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;
      const recentActivities = activities.slice(0, 5);

      res.json({
        fund,
        portfolioCompanies,
        recentActivities,
        metrics: latestMetrics,
        summary: {
          totalCompanies: portfolioCompanies.length,
          deploymentRate: fund.size !== "0" ? (parseFloat(fund.deployedCapital || "0") / parseFloat(fund.size)) * 100 : 0,
          currentIRR: latestMetrics ? parseFloat(latestMetrics.irr || "0") * 100 : 0,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard summary" });
    }
  });

  // Investment routes
  app.get("/api/investments", async (req, res) => {
    try {
      const fundId = req.query.fundId ? parseInt(req.query.fundId as string) : undefined;
      const investments = await storage.getInvestments(fundId);
      res.json(investments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch investments" });
    }
  });

  app.get("/api/investments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const investment = await storage.getInvestment(id);
      if (!investment) {
        return res.status(404).json({ message: "Investment not found" });
      }
      res.json(investment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch investment" });
    }
  });

  app.post("/api/investments", async (req, res) => {
    try {
      const investment = await storage.createInvestment(req.body);
      res.status(201).json(investment);
    } catch (error) {
      res.status(500).json({ message: "Failed to create investment" });
    }
  });

  // Investment rounds routes
  app.post("/api/investments/:id/rounds", async (req, res) => {
    try {
      const investmentId = parseInt(req.params.id);
      const round = await storage.addInvestmentRound(investmentId, req.body);
      res.status(201).json(round);
    } catch (error) {
      res.status(500).json({ message: "Failed to add investment round" });
    }
  });

  // Performance cases routes
  app.post("/api/investments/:id/cases", async (req, res) => {
    try {
      const investmentId = parseInt(req.params.id);
      const performanceCase = await storage.addPerformanceCase(investmentId, req.body);
      res.status(201).json(performanceCase);
    } catch (error) {
      res.status(500).json({ message: "Failed to add performance case" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
