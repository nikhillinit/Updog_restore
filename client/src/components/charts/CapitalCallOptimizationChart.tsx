import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, TrendingUp, DollarSign, Clock, Target } from "lucide-react";
import type { OptimizedCapitalCallSchedule } from '@/core/LiquidityEngine';

interface CapitalCallOptimizationChartProps {
  schedule: OptimizedCapitalCallSchedule | null;
  onOptimize?: () => void;
  isOptimizing?: boolean;
  className?: string;
}

export default function CapitalCallOptimizationChart({
  schedule,
  onOptimize,
  isOptimizing = false,
  className = ''
}: CapitalCallOptimizationChartProps) {

  // Prepare timeline data for visualization
  const timelineData = useMemo(() => {
    if (!schedule?.calls) return [];

    return schedule.calls.map((call, index) => ({
      id: call.id,
      callNumber: index + 1,
      amount: call.amount / 1000000, // Convert to millions
      noticeDate: call.noticeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dueDate: call.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      noticeDateTimestamp: call.noticeDate.getTime(),
      dueDateTimestamp: call.dueDate.getTime(),
      utilization: call.utilization,
      priority: call.priority,
      investmentCount: call.investments.length,
    }));
  }, [schedule]);

  // Prepare cumulative utilization data
  const utilizationData = useMemo(() => {
    if (!timelineData.length) return [];

    let cumulative = 0;
    return timelineData.map(call => {
      cumulative += call.amount;
      return {
        callNumber: call.callNumber,
        amount: call.amount,
        cumulative,
        utilizationRate: call.utilization,
      };
    });
  }, [timelineData]);

  // Prepare cashflow impact data
  const cashflowImpactData = useMemo(() => {
    if (!schedule?.calls) return [];

    const data = [];
    let currentCash = 50; // Assume starting with $50M

    // Add data point for current position
    data.push({
      date: 'Current',
      cash: currentCash,
      committed: schedule.totalAmount / 1000000,
      type: 'current'
    });

    schedule.calls.forEach((call, index) => {
      // Add cash from capital call
      currentCash += call.amount / 1000000;

      data.push({
        date: call.dueDate.toLocaleDateString('en-US', { month: 'short' }),
        cash: currentCash,
        committed: (schedule.totalAmount - (call.amount + schedule.calls.slice(0, index).reduce((sum, c) => sum + c.amount, 0))) / 1000000,
        type: 'call',
        callAmount: call.amount / 1000000
      });

      // Assume deployment of ~80% of called capital over the next month
      if (index < schedule.calls.length - 1) {
        currentCash -= (call.amount / 1000000) * 0.8;
        data.push({
          date: `${call.dueDate.toLocaleDateString('en-US', { month: 'short' })}+`,
          cash: currentCash,
          committed: (schedule.totalAmount - (call.amount + schedule.calls.slice(0, index).reduce((sum, c) => sum + c.amount, 0))) / 1000000,
          type: 'deployment'
        });
      }
    });

    return data;
  }, [schedule]);

  const formatCurrency = (value: number) => `$${value.toFixed(1)}M`;
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  if (!schedule) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Capital Call Optimization
          </CardTitle>
          <CardDescription>
            Optimize your capital call schedule for maximum efficiency
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-muted-foreground">
              No optimization schedule available
            </div>
            {onOptimize && (
              <Button onClick={onOptimize} disabled={isOptimizing}>
                {isOptimizing ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Generate Optimal Schedule
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Calls</p>
                <p className="text-2xl font-bold">{schedule.calls.length}</p>
              </div>
              <CalendarDays className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">{formatCurrency(schedule.totalAmount / 1000000)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Call Size</p>
                <p className="text-2xl font-bold">{formatCurrency(schedule.averageCallSize / 1000000)}</p>
              </div>
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Efficiency Score</p>
                <p className="text-2xl font-bold">{schedule.efficiency.toFixed(0)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <Badge variant={schedule.efficiency >= 90 ? 'default' : schedule.efficiency >= 75 ? 'secondary' : 'destructive'}>
                {schedule.efficiency >= 90 ? 'Excellent' : schedule.efficiency >= 75 ? 'Good' : 'Needs Improvement'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capital Call Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Capital Call Timeline</CardTitle>
          <CardDescription>
            Optimized schedule showing call amounts and timing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={utilizationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="callNumber"
                label={{ value: 'Capital Call #', position: 'insideBottom', offset: -5 }}
              />
              <YAxis
                label={{ value: 'Amount ($M)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value: number | undefined, name: string | undefined) => [
                  name === 'amount' ? formatCurrency(value ?? 0) : formatPercent(value ?? 0),
                  name === 'amount' ? 'Call Amount' : 'Utilization Rate'
                ]}
                labelFormatter={(label) => `Capital Call #${label}`}
              />
              <Bar dataKey="amount" fill="#3b82f6" name="amount" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Liquidity Impact Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Liquidity Impact Analysis</CardTitle>
          <CardDescription>
            Projected cash position and commitment utilization over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={cashflowImpactData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis label={{ value: 'Amount ($M)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
              />
              <Area
                type="monotone"
                dataKey="committed"
                fill="#8b5cf6"
                fillOpacity={0.3}
                stroke="#8b5cf6"
                name="Remaining Commitments"
              />
              <Line
                type="monotone"
                dataKey="cash"
                stroke="#10b981"
                strokeWidth={3}
                name="Available Cash"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Call Schedule</CardTitle>
          <CardDescription>
            Complete breakdown of optimized capital calls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schedule.calls.map((call, index) => (
              <div key={call.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Call #{index + 1}</Badge>
                    <div>
                      <h4 className="font-medium">{call.purpose}</h4>
                      <p className="text-sm text-muted-foreground">
                        {call.investments.length} investment{call.investments.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{formatCurrency(call.amount / 1000000)}</p>
                    <p className="text-muted-foreground">Amount</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{call.noticeDate.toLocaleDateString()}</p>
                    <p className="text-muted-foreground">Notice Date</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{call.dueDate.toLocaleDateString()}</p>
                    <p className="text-muted-foreground">Due Date</p>
                  </div>
                </div>

                <div className="text-right">
                  <Badge variant={call.priority <= 1 ? 'default' : call.priority <= 3 ? 'secondary' : 'outline'}>
                    Priority {call.priority}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Optimization Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Optimization Insights</CardTitle>
          <CardDescription>
            Key findings and recommendations from the optimization analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Schedule Metrics</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilization Rate:</span>
                  <span className="font-medium">{formatPercent(schedule.utilizationRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timeline Duration:</span>
                  <span className="font-medium">
                    {Math.ceil((schedule.timeline.lastCall.getTime() - schedule.timeline.firstCall.getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average Time Between Calls:</span>
                  <span className="font-medium">
                    {schedule.calls.length > 1 ?
                      Math.ceil((schedule.timeline.lastCall.getTime() - schedule.timeline.firstCall.getTime()) /
                               (1000 * 60 * 60 * 24 * (schedule.calls.length - 1))) :
                      0} days
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">Recommendations</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                {schedule.efficiency >= 90 && (
                  <p>[PASS] Excellent optimization - schedule is highly efficient</p>
                )}
                {schedule.efficiency < 75 && (
                  <p>[WARN] Consider consolidating smaller calls to improve efficiency</p>
                )}
                {schedule.calls.length > 6 && (
                  <p>[INFO] High call frequency may increase administrative overhead</p>
                )}
                {schedule.utilizationRate > 80 && (
                  <p>[GOAL] High utilization rate maximizes capital efficiency</p>
                )}
                <p>[TREND] Regular review recommended as investment pipeline evolves</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}