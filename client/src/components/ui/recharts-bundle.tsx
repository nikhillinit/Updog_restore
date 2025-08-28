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

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

interface RechartsWrapperProps {
  config: ChartConfig
  children: React.ReactNode
}

// Main wrapper component that includes Recharts
export default function RechartsBundle({ config, children }: RechartsWrapperProps) {
  const uniqueId = React.useId()
  const chartId = `chart-${uniqueId.replace(/:/g, "")}`

  return (
    <>
      <ChartStyle id={chartId} config={config} />
      <ResponsiveContainer>
        {children}
      </ResponsiveContainer>
    </>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

// Chart components that depend on Recharts
export const ChartTooltip = Tooltip

// Define a custom type for the tooltip payload
interface TooltipPayloadItem {
  name: string;
  value: number;
  payload?: any;
  dataKey?: string;
  fill?: string;
  stroke?: string;
  [key: string]: any;
}

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentProps<typeof Tooltip>, 'payload'> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
      payload?: TooltipPayloadItem[]
      label?: string
    }
>(
  (
    {
      active,
      payload = [],
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label = '',
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
      const key = `${labelKey || item?.dataKey || item?.name || "value"}`
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
          {payload.map((item: TooltipPayloadItem, index: number) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item['color']

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltip"

export const ChartLegend = Legend

// Define a custom type for the legend payload
interface LegendPayloadItem {
  value: string;
  type?: string;
  id?: string;
  color?: string;
  payload?: any;
  [key: string]: any;
}

export const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
      payload?: LegendPayloadItem[];
      verticalAlign?: "top" | "middle" | "bottom";
      hideIcon?: boolean;
      nameKey?: string;
    }
>(
  (
    { className, hideIcon = false, payload = [], verticalAlign = "bottom", nameKey },
    ref
  ) => {
    const { config } = useChart()

    if (!payload.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className
        )}
      >
        {payload.map((item: LegendPayloadItem) => {
          const key = `${nameKey || item['dataKey'] || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegend"