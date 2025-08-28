/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { cn } from "@/lib/utils"
import type { ChartConfig } from './chart-core'
import { useChart, getPayloadConfigFromPayload } from './chart-core'

// Re-export all Recharts components that are used in the app
export { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
export { Tooltip } from 'recharts/es6/component/Tooltip';
export { Legend } from 'recharts/es6/component/Legend';
export { Cell } from 'recharts/es6/component/Cell';
export { Label } from 'recharts/es6/component/Label';
export { LabelList } from 'recharts/es6/component/LabelList';

// Chart types
export { AreaChart } from 'recharts/es6/chart/AreaChart';
export { BarChart } from 'recharts/es6/chart/BarChart';
export { LineChart } from 'recharts/es6/chart/LineChart';
export { PieChart } from 'recharts/es6/chart/PieChart';
export { RadarChart } from 'recharts/es6/chart/RadarChart';
export { RadialBarChart } from 'recharts/es6/chart/RadialBarChart';
export { ScatterChart } from 'recharts/es6/chart/ScatterChart';
export { ComposedChart } from 'recharts/es6/chart/ComposedChart';
export { Treemap } from 'recharts/es6/chart/Treemap';

// Cartesian components
export { Area } from 'recharts/es6/cartesian/Area';
export { Bar } from 'recharts/es6/cartesian/Bar';
export { Line } from 'recharts/es6/cartesian/Line';
export { Scatter } from 'recharts/es6/cartesian/Scatter';
export { XAxis } from 'recharts/es6/cartesian/XAxis';
export { YAxis } from 'recharts/es6/cartesian/YAxis';
export { ZAxis } from 'recharts/es6/cartesian/ZAxis';
export { Brush } from 'recharts/es6/cartesian/Brush';
export { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
export { ReferenceLine } from 'recharts/es6/cartesian/ReferenceLine';
export { ReferenceDot } from 'recharts/es6/cartesian/ReferenceDot';
export { ReferenceArea } from 'recharts/es6/cartesian/ReferenceArea';
export { ErrorBar } from 'recharts/es6/cartesian/ErrorBar';

// Polar components
export { Pie } from 'recharts/es6/polar/Pie';
export { Radar } from 'recharts/es6/polar/Radar';
export { RadialBar } from 'recharts/es6/polar/RadialBar';
export { PolarGrid } from 'recharts/es6/polar/PolarGrid';
export { PolarAngleAxis } from 'recharts/es6/polar/PolarAngleAxis';
export { PolarRadiusAxis } from 'recharts/es6/polar/PolarRadiusAxis';

// Shapes
export { Cross } from 'recharts/es6/shape/Cross';
export { Curve } from 'recharts/es6/shape/Curve';
export { Dot } from 'recharts/es6/shape/Dot';
export { Polygon } from 'recharts/es6/shape/Polygon';
export { Rectangle } from 'recharts/es6/shape/Rectangle';
export { Sector } from 'recharts/es6/shape/Sector';

// Chart UI components with shadcn/ui styling
export const ChartTooltip = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.fill || item.color

            return formatter && item.value !== null ? (
              <div
                key={item.dataKey}
                className={cn(
                  "[&>svg]:text-muted-foreground",
                  nestLabel && "items-center",
                  "flex w-full items-center justify-between gap-2"
                )}
              >
                {formatter(item.value, item.name, item, index, payload)}
              </div>
            ) : (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full items-center justify-between gap-2",
                  "[&>svg]:text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5",
                    nestLabel && "w-full justify-between"
                  )}
                >
                  {!hideIndicator && (
                    <div
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                        indicator === "dot" && "rounded-full",
                        indicator === "line" && "w-1",
                        indicator === "dashed" && "w-0 border-[1.5px] border-dashed"
                      )}
                      style={
                        {
                          "--color-bg": indicatorColor,
                          "--color-border": indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                  )}
                  <div
                    className={cn(
                      "flex flex-1 items-baseline gap-2 [&>span]:truncate",
                      nestLabel && "justify-between text-right"
                    )}
                  >
                    <span className="text-muted-foreground">
                      {itemConfig?.label || item.name}
                    </span>
                    {nestLabel ? <span className="font-mono font-medium text-foreground">{tooltipLabel}</span> : null}
                  </div>
                </div>
                <span className="font-mono font-medium text-right text-foreground">
                  {item.value?.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof ChartTooltip> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
  }
>((props, ref) => {
  const { config } = useChart()
  const { className, hideLabel, hideIndicator, indicator, nameKey, labelKey, ...rest } = props

  if (!props.active || !props.payload?.length) {
    return null
  }

  return (
    <ChartTooltip
      ref={ref}
      className={className}
      hideLabel={hideLabel}
      hideIndicator={hideIndicator}
      indicator={indicator}
      nameKey={nameKey}
      labelKey={labelKey}
      config={config}
      {...rest}
    />
  )
})

ChartTooltipContent.displayName = "ChartTooltipContent"

export const ChartLegend = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentProps<typeof Legend>, "content"> & {
    content?: React.ComponentType<any> | React.ReactElement;
    className?: string;
    nameKey?: string;
  }
>(({ className, ...props }, ref) => {
  const { config } = useChart()

  return (
    <Legend
      ref={ref}
      className={cn(
        "flex flex-wrap items-center justify-center gap-4 text-xs",
        className
      )}
      {...props}
    />
  )
})

ChartLegend.displayName = "ChartLegend"

export const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<React.ComponentProps<typeof Legend>, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-4 text-xs",
        verticalAlign === "top" && "pb-4",
        verticalAlign === "bottom" && "pt-4",
        className
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)

        return (
          <div key={item.value} className="flex items-center gap-1.5">
            {!hideIcon && (
              <div
                className="h-2 w-2 rounded-[2px] bg-[--color-bg]"
                style={{
                  "--color-bg": item.color || itemConfig?.color,
                } as React.CSSProperties}
              />
            )}
            <span className="max-w-[100px] truncate">
              {itemConfig?.label || item.value}
            </span>
          </div>
        )
      })}
    </div>
  )
})

ChartLegendContent.displayName = "ChartLegendContent"

// Component dispatcher for lazy loading
const componentMap = {
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ResponsiveContainer,
  Tooltip,
  Legend
};

const RechartsDispatcher = React.forwardRef<any, any & { component: string }>((props, ref) => {
  const { component, ...rest } = props;
  const Component = componentMap[component as keyof typeof componentMap];
  
  if (!Component) {
    return null;
  }
  
  return <Component ref={ref} {...rest} />;
});

export default RechartsDispatcher;