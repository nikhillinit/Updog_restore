/**
 * Vendor Type Declarations
 * Temporary shims for chart libraries while we implement typed facades
 */

declare module '@nivo/line' {
  export interface LineChartProps {
    data: any[];
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    [key: string]: any;
  }
  
  export const ResponsiveLine: React.ComponentType<LineChartProps>;
  export default ResponsiveLine;
}

declare module '@nivo/scatterplot' {
  export interface ScatterPlotProps {
    data: any[];
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    [key: string]: any;
  }
  
  export const ResponsiveScatterPlot: React.ComponentType<ScatterPlotProps>;
  export default ResponsiveScatterPlot;
}

declare module '@nivo/bar' {
  export interface BarChartProps {
    data: any[];
    width?: number;
    height?: number;
    keys: string[];
    indexBy: string;
    [key: string]: any;
  }
  
  export const ResponsiveBar: React.ComponentType<BarChartProps>;
  export default ResponsiveBar;
}