'use client';

import * as React from 'react';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import type { LegendPayload } from 'recharts/types/component/DefaultLegendContent';
import type {
  NameType,
  Payload as RechartsTooltipPayload,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import type { TooltipProps } from 'recharts/types/component/Tooltip';
import { cn } from '@/lib/utils';
import type { ChartConfig } from './chart-core';
import { getPayloadConfigFromPayload, useChart } from './chart-core';
import { isRecord } from '@shared/utils/type-guards';

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

type TooltipItem = RechartsTooltipPayload<ValueType, NameType>;
type TooltipPayloadList = ReadonlyArray<TooltipItem>;
type LegendPayloadList = ReadonlyArray<LegendPayload>;
type ChartTooltipProps = Omit<TooltipProps<ValueType, NameType>, 'payload' | 'label'> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    nameKey?: string;
    labelKey?: string;
    payload?: TooltipPayloadList;
    label?: React.ReactNode;
  };
type ChartLegendProps = Omit<React.ComponentProps<typeof Legend>, 'content'> & {
  className?: string;
  nameKey?: string;
};
type ChartLegendContentProps = React.ComponentProps<'div'> & {
  payload?: LegendPayloadList;
  verticalAlign?: 'top' | 'bottom';
  hideIcon?: boolean;
  nameKey?: string;
};

function isTooltipPayloadList(payload: unknown): payload is TooltipPayloadList {
  return Array.isArray(payload) && payload.every(isRecord);
}

function isLegendPayloadList(payload: unknown): payload is LegendPayloadList {
  return Array.isArray(payload) && payload.every(isRecord);
}

function isTooltipValue(value: unknown): value is ValueType {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    (Array.isArray(value) &&
      value.every((entry) => typeof entry === 'number' || typeof entry === 'string'))
  );
}

function isNameType(value: unknown): value is NameType {
  return typeof value === 'number' || typeof value === 'string';
}

function dataKeyToString(dataKey: unknown): string | undefined {
  if (typeof dataKey === 'number' || typeof dataKey === 'string') {
    return `${dataKey}`;
  }

  return undefined;
}

function getTooltipItemKey(item: TooltipItem, fallback: string): string {
  return dataKeyToString(item.dataKey) ?? (isNameType(item.name) ? `${item.name}` : fallback);
}

function getTooltipLabelValue(config: ChartConfig, label: React.ReactNode): React.ReactNode {
  if (typeof label === 'number' || typeof label === 'string') {
    return config[`${label}`]?.label ?? label;
  }

  return label;
}

function formatTooltipValue(value: ValueType | undefined): string {
  if (value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  return String(value);
}

// Chart UI components with shadcn/ui styling
export const ChartTooltip = React.forwardRef<HTMLDivElement, ChartTooltipProps>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
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
    const { config } = useChart();
    const tooltipPayload = isTooltipPayloadList(payload) ? payload : undefined;

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !tooltipPayload || tooltipPayload.length === 0) {
        return null;
      }

      const [item] = tooltipPayload;
      if (!item) {
        return null;
      }

      const key = labelKey ?? getTooltipItemKey(item, 'value');
      const itemConfig = getPayloadConfigFromPayload(config, item, key);
      const value = !labelKey ? getTooltipLabelValue(config, label) : itemConfig?.label;

      if (labelFormatter) {
        return (
          <div className={cn('font-medium', labelClassName)}>
            {labelFormatter(value, Array.from(tooltipPayload))}
          </div>
        );
      }

      if (!value) {
        return null;
      }

      return <div className={cn('font-medium', labelClassName)}>{value}</div>;
    }, [config, hideLabel, label, labelClassName, labelFormatter, labelKey, tooltipPayload]);

    if (!active || !tooltipPayload || tooltipPayload.length === 0) {
      return null;
    }

    const nestLabel = tooltipPayload.length === 1 && indicator !== 'dot';

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {tooltipPayload.map((item, index) => {
            const itemKey = getTooltipItemKey(item, `${index}`);
            const key = nameKey ?? itemKey;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color || item.fill || item.color;

            return formatter && isTooltipValue(item.value) ? (
              <div
                key={itemKey}
                className={cn(
                  '[&>svg]:text-muted-foreground',
                  nestLabel && 'items-center',
                  'flex w-full items-center justify-between gap-2'
                )}
              >
                {formatter(
                  item.value,
                  isNameType(item.name) ? item.name : itemKey,
                  item,
                  index,
                  Array.from(tooltipPayload)
                )}
              </div>
            ) : (
              <div
                key={itemKey}
                className={cn(
                  'flex w-full items-center justify-between gap-2',
                  '[&>svg]:text-muted-foreground'
                )}
              >
                <div
                  className={cn('flex items-center gap-1.5', nestLabel && 'w-full justify-between')}
                >
                  {!hideIndicator && (
                    <div
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]',
                        indicator === 'dot' && 'rounded-full',
                        indicator === 'line' && 'w-1',
                        indicator === 'dashed' && 'w-0 border-[1.5px] border-dashed'
                      )}
                      style={
                        {
                          '--color-bg': indicatorColor,
                          '--color-border': indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                  )}
                  <div
                    className={cn(
                      'flex flex-1 items-baseline gap-2 [&>span]:truncate',
                      nestLabel && 'justify-between text-right'
                    )}
                  >
                    <span className="text-muted-foreground">
                      {itemConfig?.label || item.name || itemKey}
                    </span>
                    {nestLabel ? (
                      <span className="font-mono font-medium text-foreground">{tooltipLabel}</span>
                    ) : null}
                  </div>
                </div>
                <span className="font-mono font-medium text-right text-foreground">
                  {formatTooltipValue(item.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

ChartTooltip.displayName = 'ChartTooltip';

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof ChartTooltip> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    nameKey?: string;
    labelKey?: string;
    config?: ChartConfig;
  }
>(
  (
    { className, hideLabel, hideIndicator, indicator, nameKey, labelKey, config: _config, ...rest },
    ref
  ) => {
    if (!rest.active || !isTooltipPayloadList(rest.payload) || rest.payload.length === 0) {
      return null;
    }

    return (
      <ChartTooltip
        ref={ref}
        {...(className !== undefined ? { className } : {})}
        {...(hideLabel !== undefined ? { hideLabel } : {})}
        {...(hideIndicator !== undefined ? { hideIndicator } : {})}
        {...(indicator !== undefined ? { indicator } : {})}
        {...(nameKey ? { nameKey } : {})}
        {...(labelKey ? { labelKey } : {})}
        {...rest}
      />
    );
  }
);

ChartTooltipContent.displayName = 'ChartTooltipContent';

export const ChartLegend = React.forwardRef<HTMLDivElement, ChartLegendProps>(
  ({ className, nameKey, ...props }, _ref) => {
    const filteredProps: Record<string, unknown> = Object.fromEntries(
      Object.entries(props).filter(([_, value]) => value !== undefined)
    );

    if (nameKey) {
      filteredProps['nameKey'] = nameKey;
    }

    return (
      <Legend
        className={cn('flex flex-wrap items-center justify-center gap-4 text-xs', className)}
        content={ChartLegendContent as never}
        {...(filteredProps as Omit<React.ComponentProps<typeof Legend>, 'className' | 'content'>)}
      />
    );
  }
);

ChartLegend.displayName = 'ChartLegend';

export const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
    const { config } = useChart();
    const legendPayload = isLegendPayloadList(payload) ? payload : undefined;

    if (!legendPayload || legendPayload.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4 text-xs',
          verticalAlign === 'top' && 'pb-4',
          verticalAlign === 'bottom' && 'pt-4',
          className
        )}
      >
        {legendPayload.map((item, index) => {
          const key = nameKey ?? dataKeyToString(item.dataKey) ?? 'value';
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const itemKey = item.value ?? dataKeyToString(item.dataKey) ?? `${index}`;

          return (
            <div key={itemKey} className="flex items-center gap-1.5">
              {!hideIcon && (
                <div
                  className="h-2 w-2 rounded-[2px] bg-[--color-bg]"
                  style={
                    {
                      '--color-bg': item.color || itemConfig?.color,
                    } as React.CSSProperties
                  }
                />
              )}
              <span className="max-w-[100px] truncate">
                {itemConfig?.label || item.value || itemKey}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
);

ChartLegendContent.displayName = 'ChartLegendContent';

// Component dispatcher for lazy loading
const componentMap = {
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ResponsiveContainer,
  Tooltip,
  Legend,
} as const;

type RechartsComponentName = keyof typeof componentMap;
type RechartsDispatcherProps = {
  component?: RechartsComponentName;
  children?: React.ReactNode;
} & Record<string, unknown>;
type RechartsDispatcherComponent = React.ElementType<
  {
    children?: React.ReactNode;
    ref?: React.Ref<HTMLDivElement>;
  } & Record<string, unknown>
>;

const RechartsDispatcher = React.forwardRef<HTMLDivElement, RechartsDispatcherProps>(
  ({ component, children, ...rest }, ref) => {
    if (!component) {
      return <>{children}</>;
    }

    const Component = componentMap[
      component as RechartsComponentName
    ] as unknown as RechartsDispatcherComponent;

    if (!Component) {
      return null;
    }

    // Keep the dispatcher boundary narrow and explicit; each routed component
    // still owns its own prop validation.

    return (
      <Component ref={ref} {...rest}>
        {children as React.ReactNode}
      </Component>
    );
  }
);

RechartsDispatcher.displayName = 'RechartsDispatcher';

export default RechartsDispatcher;
