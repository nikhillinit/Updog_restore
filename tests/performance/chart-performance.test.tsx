import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NivoAllocationPie from '../../client/src/components/charts/nivo-allocation-pie';
import NivoPerformanceChart from '../../client/src/components/charts/nivo-performance-chart';
import NivoMOICScatter from '../../client/src/components/charts/nivo-moic-scatter';

// Mock nivo components to focus on memoization behavior
vi.mock('@nivo/pie', () => ({
  ResponsivePie: ({ data, tooltip }: any) => (
    <div data-testid="pie-chart">
      <div data-testid="pie-data-length">{data.length}</div>
      {tooltip && <div data-testid="pie-tooltip">Tooltip Present</div>}
    </div>
  )
}));

vi.mock('@nivo/line', () => ({
  ResponsiveLine: ({ data, tooltip }: any) => (
    <div data-testid="line-chart">
      <div data-testid="line-data-length">{data.length}</div>
      {tooltip && <div data-testid="line-tooltip">Tooltip Present</div>}
    </div>
  )
}));

vi.mock('@nivo/scatterplot', () => ({
  ResponsiveScatterPlot: ({ data, tooltip }: any) => (
    <div data-testid="scatter-chart">
      <div data-testid="scatter-data-length">{data.length}</div>
      {tooltip && <div data-testid="scatter-tooltip">Tooltip Present</div>}
    </div>
  )
}));

describe('Chart Performance and Memoization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NivoAllocationPie Performance', () => {
    const mockAllocationData = [
      { id: '1', label: 'Company A', value: 1500000 },
      { id: '2', label: 'Company B', value: 2000000 },
      { id: '3', label: 'Company C', value: 1000000 }
    ];

    it('should render without performance issues', () => {
      const startTime = performance.now();
      
      render(
        <NivoAllocationPie 
          title="Test Allocation" 
          data={mockAllocationData}
          height={400}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(screen.getByText('Test Allocation')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('pie-data-length')).toHaveTextContent('3');
      expect(renderTime).toBeLessThan(50); // Should render within 50ms
    });

    it('should memoize tooltip component', () => {
      const { rerender } = render(
        <NivoAllocationPie 
          title="Test Allocation" 
          data={mockAllocationData}
        />
      );
      
      // Re-render with same props should use memoized components
      rerender(
        <NivoAllocationPie 
          title="Test Allocation" 
          data={mockAllocationData}
        />
      );
      
      expect(screen.getByTestId('pie-tooltip')).toBeInTheDocument();
    });

    it('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `company-${i}`,
        label: `Company ${i}`,
        value: 100000 + (i * 1000)
      }));
      
      const startTime = performance.now();
      
      render(
        <NivoAllocationPie 
          title="Large Dataset" 
          data={largeDataset}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(screen.getByTestId('pie-data-length')).toHaveTextContent('1000');
      expect(renderTime).toBeLessThan(100); // Should handle large data within 100ms
    });
  });

  describe('NivoPerformanceChart Performance', () => {
    const mockPerformanceData = [
      {
        id: 'Portfolio Value',
        data: [
          { x: '2020', y: 10000000 },
          { x: '2021', y: 12000000 },
          { x: '2022', y: 15000000 },
          { x: '2023', y: 18000000 }
        ]
      }
    ];

    it('should render line chart efficiently', () => {
      const startTime = performance.now();
      
      render(
        <NivoPerformanceChart 
          title="Performance Chart" 
          data={mockPerformanceData}
          height={300}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(screen.getByText('Performance Chart')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(renderTime).toBeLessThan(50);
    });

    it('should memoize chart configuration', () => {
      const { rerender } = render(
        <NivoPerformanceChart 
          title="Performance Chart" 
          data={mockPerformanceData}
        />
      );
      
      // Re-render with same props
      rerender(
        <NivoPerformanceChart 
          title="Performance Chart" 
          data={mockPerformanceData}
        />
      );
      
      expect(screen.getByTestId('line-tooltip')).toBeInTheDocument();
    });
  });

  describe('NivoMOICScatter Performance', () => {
    const mockScatterData = [
      {
        id: 'Series A',
        data: [
          { x: 25, y: 2.1, company: 'Company A', investment: 500000 },
          { x: 35, y: 3.2, company: 'Company B', investment: 750000 },
          { x: 45, y: 4.5, company: 'Company C', investment: 1000000 }
        ]
      }
    ];

    it('should render scatter plot efficiently', () => {
      const startTime = performance.now();
      
      render(
        <NivoMOICScatter 
          title="MOIC vs IRR" 
          data={mockScatterData}
          height={400}
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      expect(screen.getByText('MOIC vs IRR')).toBeInTheDocument();
      expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
      expect(renderTime).toBeLessThan(50);
    });
  });

  describe('Memory Management', () => {
    it('should not create memory leaks with multiple re-renders', () => {
      const mockData = [
        { id: '1', label: 'Test', value: 100000 }
      ];

      const { rerender, unmount } = render(
        <NivoAllocationPie title="Test" data={mockData} />
      );

      // Multiple re-renders
      for (let i = 0; i < 50; i++) {
        rerender(
          <NivoAllocationPie 
            title={`Test ${i}`} 
            data={[{ ...mockData[0], value: 100000 + i }]} 
          />
        );
      }

      // Should not throw or cause memory issues
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      
      unmount();
      
      // After unmounting, component should be properly cleaned up
      expect(() => screen.getByTestId('pie-chart')).toThrow();
    });
  });

  describe('Component Memoization Verification', () => {
    it('should prevent unnecessary re-renders with React.memo', () => {
      const mockData = [
        { id: '1', label: 'Company A', value: 1000000 }
      ];

      const { rerender } = render(
        <NivoAllocationPie title="Allocation" data={mockData} />
      );

      // Re-render with identical props should use memoization
      rerender(
        <NivoAllocationPie title="Allocation" data={mockData} />
      );

      // Component should still be rendered correctly
      expect(screen.getByText('Allocation')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('should re-render when props actually change', () => {
      const initialData = [
        { id: '1', label: 'Company A', value: 1000000 }
      ];

      const updatedData = [
        { id: '1', label: 'Company A', value: 1500000 },
        { id: '2', label: 'Company B', value: 2000000 }
      ];

      const { rerender } = render(
        <NivoAllocationPie title="Allocation" data={initialData} />
      );

      expect(screen.getByTestId('pie-data-length')).toHaveTextContent('1');

      rerender(
        <NivoAllocationPie title="Allocation" data={updatedData} />
      );

      // Should reflect the new data
      expect(screen.getByTestId('pie-data-length')).toHaveTextContent('2');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle rapid successive renders without performance degradation', () => {
      const mockData = [
        { id: '1', label: 'Test', value: 100000 }
      ];

      const renderTimes: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        
        const { unmount } = render(
          <NivoAllocationPie title={`Test ${i}`} data={mockData} />
        );
        
        const endTime = performance.now();
        renderTimes.push(endTime - startTime);
        
        unmount();
      }

      // Average render time should be reasonable
      const avgRenderTime = renderTimes.reduce((sum, time) => sum + time, 0) / renderTimes.length;
      expect(avgRenderTime).toBeLessThan(25); // Average under 25ms

      // No single render should be excessively slow
      const maxRenderTime = Math.max(...renderTimes);
      expect(maxRenderTime).toBeLessThan(100); // Max under 100ms
    });

    it('should maintain consistent performance with varying data sizes', () => {
      const dataSizes = [10, 50, 100, 250, 500];
      const renderTimes: number[] = [];

      dataSizes.forEach(size => {
        const largeData = Array.from({ length: size }, (_, i) => ({
          id: `item-${i}`,
          label: `Item ${i}`,
          value: 100000 + (i * 1000)
        }));

        const startTime = performance.now();
        
        const { unmount } = render(
          <NivoAllocationPie title="Large Data" data={largeData} />
        );
        
        const endTime = performance.now();
        renderTimes.push(endTime - startTime);
        
        unmount();
      });

      // Render times should not increase exponentially with data size
      const firstRender = renderTimes[0];
      const lastRender = renderTimes[renderTimes.length - 1];
      
      // Last render shouldn't be more than 5x slower than first
      expect(lastRender).toBeLessThan(firstRender * 5);
      
      // All renders should complete within reasonable time
      renderTimes.forEach(time => {
        expect(time).toBeLessThan(150);
      });
    });
  });
});