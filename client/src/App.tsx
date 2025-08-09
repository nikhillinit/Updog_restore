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
import Header from "@/components/layout/header";
import DynamicFundHeader from "@/components/layout/dynamic-fund-header";

// Page components
import Dashboard from "@/pages/dashboard";
import FundSetup from "@/pages/fund-setup";
import DesignSystem from "@/pages/design-system";
import Portfolio from "@/pages/portfolio";
import Investments from "@/pages/investments";
import InvestmentDetail from "@/pages/investment-detail";
import Planning from "@/pages/planning";
import KPIManager from "@/pages/kpi-manager";
import KPISubmission from "@/pages/kpi-submission";
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
import AllocationManagerPage from "@/pages/allocation-manager";
import NotFound from "@/pages/not-found";
import EnhancedPortfolioAnalytics from "@/components/portfolio/enhanced-portfolio-analytics";
import CustomFields from "@/pages/CustomFields";
import InvestmentsTable from "@/pages/investments-table";
import CapTables from "@/pages/CapTables";
import CashManagement from "@/pages/cash-management";
import SensitivityAnalysisPage from "@/pages/sensitivity-analysis";

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

  const currentModule = moduleConfig[activeModule as keyof typeof moduleConfig] || moduleConfig['fund-setup'];

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
    <Suspense fallback={<div>Loading…</div>}>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/fund-setup" component={FundSetup} />
        <Route path="/design-system" component={DesignSystem} />
        <Route path="/dashboard" component={(props) => <ProtectedRoute component={Dashboard} {...props} />} />
        <Route path="/portfolio" component={(props) => <ProtectedRoute component={Portfolio} {...props} />} />
        <Route path="/investments" component={(props) => <ProtectedRoute component={Investments} {...props} />} />
        <Route path="/investments/:id" component={(props) => <ProtectedRoute component={InvestmentDetail} {...props} />} />
        <Route path="/custom-fields" component={(props) => <ProtectedRoute component={CustomFields} {...props} />} />
        <Route path="/investments-table" component={(props) => <ProtectedRoute component={InvestmentsTable} {...props} />} />
        <Route path="/investments/company/:id" component={(props) => <ProtectedRoute component={Investments} {...props} />} />
        <Route path="/cap-tables" component={(props) => <ProtectedRoute component={CapTables} {...props} />} />
        <Route path="/kpi-manager" component={(props) => <ProtectedRoute component={KPIManager} {...props} />} />
        <Route path="/kpi-submission" component={KPISubmission} />
        <Route path="/allocation-manager" component={() => <AllocationManagerPage />} />
        <Route path="/planning" component={(props) => <ProtectedRoute component={Planning} {...props} />} />
        <Route path="/forecasting" component={(props) => <ProtectedRoute component={ForecastingPage} {...props} />} />
        <Route path="/scenario-builder" component={(props) => <ProtectedRoute component={ScenarioBuilderPage} {...props} />} />
        <Route path="/reserves-demo" component={(props) => <ProtectedRoute component={ReservesDemo} {...props} />} />
        <Route path="/moic-analysis" component={(props) => <ProtectedRoute component={MOICAnalysisPage} {...props} />} />
        <Route path="/return-the-fund" component={(props) => <ProtectedRoute component={ReturnTheFundPage} {...props} />} />
        <Route path="/partial-sales" component={(props) => <ProtectedRoute component={PartialSalesPage} {...props} />} />
        <Route path="/financial-modeling" component={(props) => <ProtectedRoute component={FinancialModeling} {...props} />} />
        <Route path="/performance" component={(props) => <ProtectedRoute component={Performance} {...props} />} />
        <Route path="/analytics" component={(props) => <ProtectedRoute component={Analytics} {...props} />} />
        <Route path="/portfolio-analytics" component={(props) => <ProtectedRoute component={EnhancedPortfolioAnalytics} {...props} />} />
        <Route path="/cash-management" component={(props) => <ProtectedRoute component={CashManagement} {...props} />} />
        <Route path="/sensitivity-analysis" component={(props) => <ProtectedRoute component={SensitivityAnalysisPage} {...props} />} />
        <Route path="/reports" component={(props) => <ProtectedRoute component={Reports} {...props} />} />
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
