/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { Suspense, useState, useEffect } from 'react';
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FundProvider, useFundContext } from "@/contexts/FundContext";
import { ErrorBoundary } from "./components/ui/error-boundary";

// Layout components
import Sidebar from "@/components/layout/sidebar";
// import Header from "@/components/layout/header"; // Unused - removed
import DynamicFundHeader from "@/components/layout/dynamic-fund-header";

// Page components - Heavy routes lazy loaded for bundle optimization
const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const Portfolio = React.lazy(() => import("@/pages/portfolio"));
const Investments = React.lazy(() => import("@/pages/investments"));
const Planning = React.lazy(() => import("@/pages/planning"));
// Lazy load non-critical routes for bundle optimization
const FundSetup = React.lazy(() => import("@/pages/fund-setup"));
const DesignSystem = React.lazy(() => import("@/pages/design-system"));
const InvestmentDetail = React.lazy(() => import("@/pages/investment-detail"));
const KPIManager = React.lazy(() => import("@/pages/kpi-manager"));
const KPISubmission = React.lazy(() => import("@/pages/kpi-submission"));
const ForecastingPage = React.lazy(() => import("@/pages/forecasting"));
const ScenarioBuilderPage = React.lazy(() => import("@/pages/scenario-builder"));
const ReservesDemo = React.lazy(() => import("@/pages/reserves-demo"));
const MOICAnalysisPage = React.lazy(() => import("@/pages/moic-analysis"));
const ReturnTheFundPage = React.lazy(() => import("@/pages/return-the-fund"));
const PartialSalesPage = React.lazy(() => import("@/pages/partial-sales"));
const FinancialModeling = React.lazy(() => import("@/pages/financial-modeling"));
const Performance = React.lazy(() => import("@/pages/performance"));
const Analytics = React.lazy(() => import("@/pages/analytics"));
const Reports = React.lazy(() => import("@/pages/reports"));
const AllocationManagerPage = React.lazy(() => import("@/pages/allocation-manager"));
const NotFound = React.lazy(() => import("@/pages/not-found"));
const EnhancedPortfolioAnalytics = React.lazy(() => import("@/components/portfolio/enhanced-portfolio-analytics"));
const CustomFields = React.lazy(() => import("@/pages/CustomFields"));
const InvestmentsTable = React.lazy(() => import("@/pages/investments-table"));
const CapTables = React.lazy(() => import("@/pages/CapTables"));
const CashManagement = React.lazy(() => import("@/pages/cash-management"));
const SensitivityAnalysisPage = React.lazy(() => import("@/pages/sensitivity-analysis"));
// New analytics features
const TimeTravelPage = React.lazy(() => import("@/pages/time-travel"));
const VarianceTrackingPage = React.lazy(() => import("@/pages/variance-tracking"));
const PortfolioConstructor = React.lazy(() => import("@/pages/portfolio-constructor"));
// Development dashboard for solo developer productivity
const DevDashboardPage = React.lazy(() => import("@/pages/DevDashboardPage"));
// Agent 2: Mobile Executive Dashboard
const MobileExecutiveDashboardPage = React.lazy(() => import("@/pages/mobile-executive-dashboard"));
const EnhancedDesignSystemDemo = React.lazy(() => import("@/components/demo/enhanced-design-system-demo"));

const moduleConfig = {
  dashboard: {
    title: "Fund Dashboard",
    description: "Comprehensive overview of fund performance and metrics"
  },
  'fund-setup': {
    title: "Fund Setup",
    description: "Configure fund parameters and investment strategy"
  },
  portfolio: {
    title: "Portfolio Management", 
    description: "Manage portfolio companies and track performance"
  },
  investments: {
    title: "Investment Tracking",
    description: "Add and manage individual investments with performance modeling"
  },
  'kpi-manager': {
    title: "KPI Manager",
    description: "Monitor and track portfolio company performance metrics"
  },
  'allocation-manager': {
    title: "Allocation Manager",
    description: "Configure fund allocations with automatic reserve calculation"
  },
  'financial-modeling': {
    title: "Financial Modeling",
    description: "Cohort analysis and financial projections"
  },
  performance: {
    title: "Performance Analysis",
    description: "IRR analysis and realized returns tracking"
  },
  analytics: {
    title: "Analytics & Insights",
    description: "Advanced analytics and performance insights"
  },
  'portfolio-analytics': {
    title: "Portfolio Analytics",
    description: "Drag-and-drop data visualization with saved views"
  },
  reports: {
    title: "Reports & Documentation", 
    description: "Generate comprehensive fund reports"
  },
  'tear-sheets': {
    title: "Tear Sheets",
    description: "Mobile-optimized portfolio company tear sheets with versioned commentary"
  },
  'time-travel': {
    title: "Time-Travel Analytics",
    description: "Historical fund state analysis, snapshots, and restoration capabilities"
  },
  'variance-tracking': {
    title: "Variance Tracking",
    description: "Performance variance monitoring, baseline management, and automated alerts"
  },
  'portfolio-constructor': {
    title: "Portfolio Constructor",
    description: "Build and optimize fund portfolio strategies with scenario modeling and real-time calculations"
  },
  'dev-dashboard': {
    title: "Development Dashboard",
    description: "Real-time visibility into system health for solo developer productivity"
  },
  'mobile-executive-dashboard': {
    title: "Mobile Executive Dashboard",
    description: "Mobile-first executive dashboard with AI insights and touch-optimized navigation"
  },
  'enhanced-design-system-demo': {
    title: "Enhanced Design System",
    description: "Professional micro-interactions and AI confidence levels (Agent 3)"
  }
};

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [activeModule, setActiveModule] = useState('fund-setup');

  // Update active module based on current route
  useEffect(() => {
    const path = location.replace('/', '') || 'fund-setup';
    setActiveModule(path);
  }, [location]);

  // const currentModule = moduleConfig[activeModule as keyof typeof moduleConfig] || moduleConfig['fund-setup'];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-poppins text-charcoal">
      <DynamicFundHeader />
      <div className="flex flex-1">
        <Sidebar
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
        <main className="flex-1 overflow-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}

function HomeRoute() {
  const { needsSetup, isLoading } = useFundContext();
  
  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  return needsSetup ? <Redirect to="/fund-setup" /> : <Redirect to="/dashboard" />;
}

function ProtectedRoute({ component: Component, ...props }: any) {
  const { needsSetup, isLoading } = useFundContext();
  
  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  if (needsSetup) {
    return <Redirect to="/fund-setup" />;
  }
  
  return <Component {...props} />;
}

function Router() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading page...</p>
        </div>
      </div>
    }>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/fund-setup" component={FundSetup} />
        <Route path="/design-system" component={DesignSystem} />
        <Route path="/dashboard" component={(props: any) => <ProtectedRoute component={Dashboard} {...props} />} />
        <Route path="/portfolio" component={(props: any) => <ProtectedRoute component={Portfolio} {...props} />} />
        <Route path="/investments" component={(props: any) => <ProtectedRoute component={Investments} {...props} />} />
        <Route path="/investments/:id" component={(props: any) => <ProtectedRoute component={InvestmentDetail} {...props} />} />
        <Route path="/custom-fields" component={(props: any) => <ProtectedRoute component={CustomFields} {...props} />} />
        <Route path="/investments-table" component={(props: any) => <ProtectedRoute component={InvestmentsTable} {...props} />} />
        <Route path="/investments/company/:id" component={(props: any) => <ProtectedRoute component={Investments} {...props} />} />
        <Route path="/cap-tables" component={(props: any) => <ProtectedRoute component={CapTables} {...props} />} />
        <Route path="/kpi-manager" component={(props: any) => <ProtectedRoute component={KPIManager} {...props} />} />
        <Route path="/kpi-submission" component={KPISubmission} />
        <Route path="/allocation-manager" component={() => <AllocationManagerPage />} />
        <Route path="/planning" component={(props: any) => <ProtectedRoute component={Planning} {...props} />} />
        <Route path="/forecasting" component={(props: any) => <ProtectedRoute component={ForecastingPage} {...props} />} />
        <Route path="/scenario-builder" component={(props: any) => <ProtectedRoute component={ScenarioBuilderPage} {...props} />} />
        <Route path="/reserves-demo" component={(props: any) => <ProtectedRoute component={ReservesDemo} {...props} />} />
        <Route path="/moic-analysis" component={(props: any) => <ProtectedRoute component={MOICAnalysisPage} {...props} />} />
        <Route path="/return-the-fund" component={(props: any) => <ProtectedRoute component={ReturnTheFundPage} {...props} />} />
        <Route path="/partial-sales" component={(props: any) => <ProtectedRoute component={PartialSalesPage} {...props} />} />
        <Route path="/financial-modeling" component={(props: any) => <ProtectedRoute component={FinancialModeling} {...props} />} />
        <Route path="/performance" component={(props: any) => <ProtectedRoute component={Performance} {...props} />} />
        <Route path="/analytics" component={(props: any) => <ProtectedRoute component={Analytics} {...props} />} />
        <Route path="/portfolio-analytics" component={(props: any) => <ProtectedRoute component={EnhancedPortfolioAnalytics} {...props} />} />
        <Route path="/cash-management" component={(props: any) => <ProtectedRoute component={CashManagement} {...props} />} />
        <Route path="/sensitivity-analysis" component={(props: any) => <ProtectedRoute component={SensitivityAnalysisPage} {...props} />} />
        <Route path="/time-travel" component={(props: any) => <ProtectedRoute component={TimeTravelPage} {...props} />} />
        <Route path="/variance-tracking" component={(props: any) => <ProtectedRoute component={VarianceTrackingPage} {...props} />} />
        <Route path="/portfolio-constructor" component={(props: any) => <ProtectedRoute component={PortfolioConstructor} {...props} />} />
        <Route path="/dev-dashboard" component={DevDashboardPage} />
        <Route path="/mobile-executive-dashboard" component={(props: any) => <ProtectedRoute component={MobileExecutiveDashboardPage} {...props} />} />
        <Route path="/enhanced-design-system-demo" component={(props: any) => <ProtectedRoute component={EnhancedDesignSystemDemo} {...props} />} />
        <Route path="/reports" component={(props: any) => <ProtectedRoute component={Reports} {...props} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FundProvider>
          <TooltipProvider>
            <Toaster />
            <AppLayout>
              <Router />
            </AppLayout>
          </TooltipProvider>
        </FundProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

