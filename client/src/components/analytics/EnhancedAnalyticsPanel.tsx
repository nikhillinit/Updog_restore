import React, { useEffect, useState } from 'react';
import { useWorkerAnalytics } from '@/hooks/useWorkerAnalytics';
import { nanoid } from 'nanoid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, DollarSign, BarChart3, Calculator } from 'lucide-react';

export function EnhancedAnalyticsPanel({ cashFlows, wConfig, contributions, exits }:{
  cashFlows: Array<{ date: string; amount: number }>;
  wConfig: unknown; contributions: unknown[]; exits: unknown[];
}) {
  const { calculateXIRR, runMonteCarlo, calculateWaterfall, progress, cancel } = useWorkerAnalytics();
  const [metrics, setMetrics] = useState<{ irr: unknown; mc: unknown; wf: unknown }>({ irr: null, mc: null, wf: null });
  const [activeCalculations, setActiveCalculations] = useState<Set<string>>(new Set());

  // XIRR
  useEffect(() => {
    const id = nanoid(); 
    let cancelled = false;
    setActiveCalculations(prev => new Set(prev).add(id));
    
    calculateXIRR(cashFlows, id).then(res => {
      if (!cancelled) {
        setMetrics((m) => ({ ...m, irr: res }));
        setActiveCalculations(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
    return () => { cancelled = true; cancel(id); };
  }, [cashFlows]);

  // Monte Carlo (debounced)
  useEffect(() => {
    const id = nanoid(); 
    const t = setTimeout(() => {
      setActiveCalculations(prev => new Set(prev).add(id));
      runMonteCarlo(cashFlows, id, 0.2, 500).then(res => {
        setMetrics((m)=>({ ...m, mc: res }));
        setActiveCalculations(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }, 600);
    return () => { clearTimeout(t); cancel(id); };
  }, [cashFlows]);

  // Waterfall preview
  useEffect(() => {
    const id = nanoid(); 
    let cancelled = false;
    setActiveCalculations(prev => new Set(prev).add(id));
    
    calculateWaterfall(wConfig, contributions, exits, id).then(res => {
      if (!cancelled) {
        setMetrics((m)=>({ ...m, wf: res }));
        setActiveCalculations(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
    return () => { cancelled = true; cancel(id); };
  }, [wConfig, contributions, exits]);

  const isCalculating = activeCalculations.size > 0;

  return (
    <div className="space-y-4">
      <Card className="border-charcoal-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-inter flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-pov-charcoal" />
            Real-time Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* IRR Metric */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-charcoal-500" />
                <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-widest">IRR (Annualized)</span>
              </div>
              {metrics.irr?.converged && (
                <span className="text-xs text-green-600 font-medium">✓ Converged</span>
              )}
            </div>
            <div className="text-2xl font-bold font-inter text-pov-charcoal">
              {metrics.irr?.irr !== null && metrics.irr?.irr !== undefined ? 
                `${(metrics.irr.irr * 100).toFixed(2)}%` : 
                isCalculating ? 'Calculating...' : '—'
              }
            </div>
            {metrics.irr?.method && (
              <p className="text-xs text-charcoal-500">Method: {metrics.irr.method}</p>
            )}
          </div>

          {/* Monte Carlo Progress/Results */}
          {Object.entries(progress).map(([id, pct]) => (
            <div key={id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-poppins text-charcoal-600">Running simulations...</span>
                <span className="text-xs text-charcoal-500">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          ))}

          {/* Monte Carlo Results */}
          {metrics.mc && (
            <div className="space-y-2 pt-2 border-t border-charcoal-100">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-charcoal-500" />
                <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-widest">Monte Carlo Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-charcoal-500">P50 (Median):</span>
                  <div className="font-semibold">{metrics.mc.p50 ? `${(metrics.mc.p50 * 100).toFixed(1)}%` : '—'}</div>
                </div>
                <div>
                  <span className="text-xs text-charcoal-500">Mean:</span>
                  <div className="font-semibold">{metrics.mc.mean ? `${(metrics.mc.mean * 100).toFixed(1)}%` : '—'}</div>
                </div>
                <div>
                  <span className="text-xs text-charcoal-500">P10:</span>
                  <div className="font-semibold">{metrics.mc.p10 ? `${(metrics.mc.p10 * 100).toFixed(1)}%` : '—'}</div>
                </div>
                <div>
                  <span className="text-xs text-charcoal-500">P90:</span>
                  <div className="font-semibold">{metrics.mc.p90 ? `${(metrics.mc.p90 * 100).toFixed(1)}%` : '—'}</div>
                </div>
              </div>
              <p className="text-xs text-charcoal-500">{metrics.mc.runs} simulations completed</p>
            </div>
          )}

          {/* Waterfall Metrics */}
          {metrics.wf && (
            <div className="space-y-2 pt-2 border-t border-charcoal-100">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-charcoal-500" />
                <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-widest">Waterfall (American)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-charcoal-500">DPI:</span>
                  <div className="text-lg font-semibold text-pov-charcoal">
                    {metrics.wf.totals.paidIn > 0 ? 
                      `${(metrics.wf.totals.distributed / metrics.wf.totals.paidIn).toFixed(2)}x` : 
                      '—'
                    }
                  </div>
                </div>
                <div>
                  <span className="text-xs text-charcoal-500">TVPI:</span>
                  <div className="text-lg font-semibold text-pov-charcoal">
                    {metrics.wf.totals.tvpi ? `${metrics.wf.totals.tvpi.toFixed(2)}x` : '—'}
                  </div>
                </div>
              </div>
              {metrics.wf.totals.gpCarryTotal > 0 && (
                <div className="pt-2">
                  <span className="text-xs text-charcoal-500">Total GP Carry:</span>
                  <div className="text-sm font-semibold">
                    ${(metrics.wf.totals.gpCarryTotal / 1000000).toFixed(2)}M
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Indicator */}
          {isCalculating && !Object.keys(progress).length && (
            <div className="flex items-center gap-2 pt-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-pov-charcoal"></div>
              <span className="text-xs text-charcoal-500">Updating analytics...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}