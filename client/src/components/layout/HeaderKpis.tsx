 
 
 
 
 
import { useFundContext } from "@/contexts/FundContext";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, DollarSign } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface KPIMetrics {
  dpi: number;
  tvpi: number;
  nav: number;
}

export default function HeaderKpis() {
  const { currentFund } = useFundContext();
  const [selectedKPI, setSelectedKPI] = useState<'dpi' | 'tvpi' | 'nav'>('dpi');

  const { data: metrics, isLoading } = useQuery<KPIMetrics>({
    queryKey: ['/api/funds', currentFund?.id, 'kpi-metrics'],
    enabled: !!currentFund?.id,
    refetchInterval: 15000, // Refresh every 15s
    placeholderData: {
      dpi: 0.85,
      tvpi: 2.88,
      nav: 187500000
    }
  });

  const kpiConfig = {
    dpi: {
      label: 'DPI',
      icon: DollarSign,
      value: metrics?.dpi ?? 0.85,
      color: 'text-green-600',
      description: 'Distributions to Paid-In',
      isCurrency: false
    },
    tvpi: {
      label: 'TVPI',
      icon: TrendingUp,
      value: metrics?.tvpi ?? 2.88,
      color: 'text-blue-600',
      description: 'Total Value to Paid-In',
      isCurrency: false
    },
    nav: {
      label: 'NAV',
      icon: Target,
      value: metrics?.nav ?? 187500000,
      color: 'text-purple-600',
      isCurrency: true,
      description: 'Net Asset Value'
    }
  };

  const selected = kpiConfig[selectedKPI];
  const Icon = selected.icon;

  if (!currentFund) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-gradient-to-r from-slate-50 to-white border-b">
      {/* KPI Selector */}
      <div className="flex gap-2">
        {(Object.keys(kpiConfig) as Array<keyof typeof kpiConfig>).map(key => (
          <button
            key={key}
            onClick={() => setSelectedKPI(key)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
              selectedKPI === key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
            title={kpiConfig[key].description}
          >
            {kpiConfig[key].label}
          </button>
        ))}
      </div>

      {/* Selected KPI Display */}
      <div className="flex items-center gap-2 ml-4 px-4 py-2 bg-white rounded-lg shadow-sm border border-slate-200">
        <Icon className={`h-5 w-5 ${selected.color}`} />
        <span className="text-sm text-slate-600">{selected.label}:</span>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <span className={`text-xl font-bold ${selected.color} live-pulse-kpi`}>
            {selected.isCurrency
              ? `$${(selected.value / 1_000_000).toFixed(1)}M`
              : selected.value.toFixed(2)
            }
          </span>
        )}
      </div>

      {/* Fund Name */}
      <div className="ml-auto text-sm text-slate-600">
        {currentFund.name}
      </div>
    </div>
  );
}
