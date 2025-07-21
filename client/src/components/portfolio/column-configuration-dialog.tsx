import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings, Search, RefreshCw } from "lucide-react";

type MetricCategory = {
  id: string;
  name: string;
  metrics: {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
  }[];
};

const availableMetrics: MetricCategory[] = [
  {
    id: "company",
    name: "Company",
    metrics: [
      { id: "name", name: "Name", description: "The name of the portfolio company", enabled: true },
      { id: "fundName", name: "Fund Name", description: "The name of the fund vehicle that invested", enabled: false },
      { id: "status", name: "Status", description: "Active, Write-Offs, Realized or Planned", enabled: true },
      { id: "investmentDate", name: "Investment Date", description: "The date of the first round", enabled: true },
      { id: "geography", name: "Geography", description: "The country or region associated with the investment", enabled: false },
      { id: "sector", name: "Sector", description: "The sector associated with this company", enabled: true }
    ]
  },
  {
    id: "qualitative",
    name: "Qualitative",
    metrics: [
      { id: "commentary", name: "Commentary", description: "Latest partner commentary", enabled: false },
      { id: "caseDescription", name: "Case Description", description: "The description of the case defined for this company", enabled: false },
      { id: "dealTags", name: "Deal Tags", description: "Any tags associated with this investment", enabled: true },
      { id: "partners", name: "Partners", description: "Sourcing or managing partners associated with the investment", enabled: false },
      { id: "boardMembers", name: "Board Members", description: "Any board member seats granted to the fund", enabled: false },
      { id: "coInvestors", name: "Co-Investors", description: "Any co-investors tracked for this investment", enabled: false }
    ]
  },
  {
    id: "rounds",
    name: "Rounds",
    metrics: [
      { id: "entryStage", name: "Entry Stage", description: "The name of the round that the fund made its initial investment", enabled: true },
      { id: "currentStage", name: "Current Stage", description: "The last financing round of the company", enabled: false },
      { id: "lastRoundDate", name: "Last Round Date", description: "The date of the last financing round", enabled: false },
      { id: "exitStage", name: "Exit Stage", description: "The stage of the last financing round prior to exit", enabled: false }
    ]
  },
  {
    id: "capital",
    name: "Capital",
    metrics: [
      { id: "investedToDate", name: "Invested to Date", description: "The total capital invested to date by the fund", enabled: true },
      { id: "initialInvestment", name: "Initial Investment", description: "The amount invested in the first round by the fund", enabled: false },
      { id: "reservesDeployed", name: "Reserves Deployed", description: "The amount invested in subsequent rounds", enabled: false },
      { id: "reservesRemaining", name: "Reserves Remaining", description: "The amount reserved for future follow-on investments", enabled: false },
      { id: "totalExpectedInvestment", name: "Total Expected Investment", description: "The total capital expected to be invested in the company", enabled: false },
      { id: "entryRoundSize", name: "Entry Round Size", description: "The amount raised by the company in the first round", enabled: false },
      { id: "cumeCapitalRaised", name: "Cume Capital Raised", description: "The total amount raised by the company to date", enabled: false },
      { id: "cumeCapitalRaisedSinceInitial", name: "Cume Capital Raised Since Initial", description: "Total amount raised excluding the initial round", enabled: false }
    ]
  },
  {
    id: "valuation",
    name: "Valuation",
    metrics: [
      { id: "entryPreMoneyValuation", name: "Entry Pre-Money Valuation", description: "Pre-money valuation at entry", enabled: false },
      { id: "entryPostMoneyValuation", name: "Entry Post-Money Valuation", description: "Post-money valuation at entry", enabled: false },
      { id: "currentPostMoneyValuation", name: "Current Post-Money Valuation", description: "Current post-money valuation", enabled: false },
      { id: "entryOwnership", name: "Entry Ownership", description: "Ownership percentage at entry", enabled: false },
      { id: "currentOwnership", name: "Current Ownership", description: "Current ownership percentage", enabled: true },
      { id: "currentSharePrice", name: "Current Share Price", description: "Applicable only if data has been entered in share mode", enabled: false },
      { id: "currentSharesOwned", name: "Current Shares Owned", description: "Applicable only if data has been entered in share mode", enabled: false },
      { id: "unrealizedFMV", name: "Unrealized FMV", description: "Value of unrealized stake in the company", enabled: true },
      { id: "currentReturnTheFund", name: "Current Return the Fund", description: "Current RTF based on current ownership", enabled: false }
    ]
  },
  {
    id: "exit",
    name: "Exit",
    metrics: [
      { id: "exitDate", name: "Exit Date", description: "Actual or expected exit date", enabled: false },
      { id: "exitOwnership", name: "Exit Ownership", description: "Ownership % at Exit", enabled: false },
      { id: "realizedProceeds", name: "Realized Proceeds", description: "Realized proceeds to date including dividends and distributions", enabled: false },
      { id: "percentRealized", name: "% Realized", description: "Percentage of investment that has been realized to date", enabled: false },
      { id: "totalExitProceeds", name: "Total Exit Proceeds", description: "Total exit proceeds to be realized", enabled: false },
      { id: "exitAggregateValuation", name: "Exit Aggregate Valuation", description: "Expected or actual aggregate valuation at exit", enabled: false },
      { id: "exitReturnTheFund", name: "Exit Return the Fund", description: "RTF based on ownership at exit", enabled: false },
      { id: "currentLossRatio", name: "Current Loss Ratio", description: "Loss ratio on invested capital today", enabled: false },
      { id: "lossRatioAtExit", name: "Loss Ratio at Exit", description: "Loss ratio on invested capital by exit", enabled: false }
    ]
  },
  {
    id: "multiple",
    name: "Multiple",
    metrics: [
      { id: "currentMOIC", name: "Current MOIC", description: "Current return on $1 of invested capital to date", enabled: true },
      { id: "currentMOICOnInitial", name: "Current MOIC on Initial", description: "Current return on $1 of initial investment only", enabled: false },
      { id: "currentMOICOnDeployedReserves", name: "Current MOIC on Deployed Reserves", description: "Current return on $1 of deployed reserves only", enabled: false },
      { id: "exitMOIC", name: "Exit MOIC", description: "Expected return on $1 of total invested capital", enabled: false },
      { id: "exitMOICOnFollowOns", name: "Exit MOIC on Follow-Ons", description: "Expected return at exit for every $1 of follow-on investment only", enabled: false },
      { id: "exitMOICOnPlannedReserves", name: "Exit MOIC on Planned Reserves", description: "Expected return on $1 of future planned reserves", enabled: false },
      { id: "currentOrRealizedIRR", name: "Current or Realized IRR", description: "Represents the IRR return on the investment", enabled: true }
    ]
  },
  {
    id: "composition",
    name: "Composition",
    metrics: [
      { id: "initialToCommittedCapitalRatio", name: "Initial to Committed Capital Ratio", description: "Initial investment divided by total fund committed capital", enabled: false },
      { id: "totalToCommittedCapitalRatio", name: "Total to Committed Capital Ratio", description: "Total investment divided by total fund committed capital", enabled: false },
      { id: "deployedToTotalInvestedRatio", name: "Deployed to Total Invested Ratio", description: "Total invested to date divided by total invested capital by fund", enabled: false },
      { id: "totalInvestmentToTotalExpectedInvestmentRatio", name: "Total Investment to Total Expected Investment Ratio", description: "Total expected investment divided by total expected investment by fund", enabled: false },
      { id: "fmvRatio", name: "FMV Ratio", description: "FMV of investment divided by total FMV across all active investments", enabled: false }
    ]
  },
  {
    id: "other",
    name: "Other",
    metrics: [
      { id: "caseProbability", name: "Case Probability", description: "The probability of the performance case", enabled: false },
      { id: "failureRate", name: "Failure Rate", description: "The probability of a write-off", enabled: false },
      { id: "dealReserveRatio", name: "Deal Reserve Ratio", description: "Reserve ratio calculated as Total Follow-Ons / Total Expected Invested Capital", enabled: false }
    ]
  }
];

type ColumnConfigurationDialogProps = {
  selectedColumns: string[];
  onColumnsChange: (columns: string[]) => void;
};

export default function ColumnConfigurationDialog({ selectedColumns, onColumnsChange }: ColumnConfigurationDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [localMetrics, setLocalMetrics] = useState(availableMetrics);
  const [activeCategory, setActiveCategory] = useState("company");

  const handleMetricToggle = (categoryId: string, metricId: string, enabled: boolean) => {
    setLocalMetrics(prev => prev.map(category => 
      category.id === categoryId 
        ? {
            ...category,
            metrics: category.metrics.map(metric =>
              metric.id === metricId ? { ...metric, enabled } : metric
            )
          }
        : category
    ));
  };

  const handleApplyChanges = () => {
    const enabledMetrics = localMetrics.flatMap(category => 
      category.metrics.filter(metric => metric.enabled).map(metric => metric.id)
    );
    onColumnsChange(enabledMetrics);
  };

  const getEnabledCount = (categoryId: string) => {
    const category = localMetrics.find(c => c.id === categoryId);
    return category?.metrics.filter(m => m.enabled).length || 0;
  };

  const getTotalCount = (categoryId: string) => {
    const category = localMetrics.find(c => c.id === categoryId);
    return category?.metrics.length || 0;
  };

  const filteredMetrics = localMetrics.map(category => ({
    ...category,
    metrics: category.metrics.filter(metric =>
      metric.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      metric.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => category.metrics.length > 0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings className="w-4 h-4 mr-2" />
          Edit Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Configure Investment Reporting Metrics</DialogTitle>
          <p className="text-sm text-gray-600">
            Choose from 65+ available metrics to customize your investments table view
          </p>
        </DialogHeader>

        <div className="flex flex-col space-y-4 h-full">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search metrics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Tabs */}
          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="company" className="text-xs">
                Company ({getEnabledCount("company")}/{getTotalCount("company")})
              </TabsTrigger>
              <TabsTrigger value="capital" className="text-xs">
                Capital ({getEnabledCount("capital")}/{getTotalCount("capital")})
              </TabsTrigger>
              <TabsTrigger value="valuation" className="text-xs">
                Valuation ({getEnabledCount("valuation")}/{getTotalCount("valuation")})
              </TabsTrigger>
              <TabsTrigger value="multiple" className="text-xs">
                Multiple ({getEnabledCount("multiple")}/{getTotalCount("multiple")})
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <TabsTrigger value="qualitative" className="text-xs">
                Qualitative ({getEnabledCount("qualitative")}/{getTotalCount("qualitative")})
              </TabsTrigger>
              <TabsTrigger value="rounds" className="text-xs">
                Rounds ({getEnabledCount("rounds")}/{getTotalCount("rounds")})
              </TabsTrigger>
              <TabsTrigger value="exit" className="text-xs">
                Exit ({getEnabledCount("exit")}/{getTotalCount("exit")})
              </TabsTrigger>
              <TabsTrigger value="composition" className="text-xs">
                Composition ({getEnabledCount("composition")}/{getTotalCount("composition")})
              </TabsTrigger>
            </div>

            {/* Metrics Content */}
            <div className="mt-4 flex-1 overflow-y-auto">
              {filteredMetrics.map((category) => (
                <TabsContent key={category.id} value={category.id} className="mt-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">{category.name} Metrics</h3>
                    <Badge variant="outline">
                      {getEnabledCount(category.id)} of {getTotalCount(category.id)} selected
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {category.metrics.map((metric) => (
                      <div key={metric.id} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg">
                        <Checkbox
                          checked={metric.enabled}
                          onCheckedChange={(checked) => handleMetricToggle(category.id, metric.id, checked as boolean)}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{metric.name}</div>
                          <div className="text-sm text-gray-600 mt-1">{metric.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}

              {/* Other category */}
              <TabsContent value="other" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Other Metrics</h3>
                  <Badge variant="outline">
                    {getEnabledCount("other")} of {getTotalCount("other")} selected
                  </Badge>
                </div>

                <div className="space-y-3">
                  {localMetrics.find(c => c.id === "other")?.metrics.map((metric) => (
                    <div key={metric.id} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg">
                      <Checkbox
                        checked={metric.enabled}
                        onCheckedChange={(checked) => handleMetricToggle("other", metric.id, checked as boolean)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{metric.name}</div>
                        <div className="text-sm text-gray-600 mt-1">{metric.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-1" />
                Reset to Default
              </Button>
              <span className="text-sm text-gray-600">
                {localMetrics.flatMap(c => c.metrics).filter(m => m.enabled).length} metrics selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline">Cancel</Button>
              <Button onClick={handleApplyChanges}>Apply Changes</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}