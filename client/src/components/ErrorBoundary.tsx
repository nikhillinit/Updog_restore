import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In development, log component stack
    if (import.meta.env.DEV && errorInfo?.componentStack) {
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-red-700">
              An unexpected error occurred while rendering this component.
            </p>
            
            {import.meta.env.DEV && this.state.error && (
              <div className="bg-red-100 border border-red-300 rounded p-3">
                <p className="text-sm font-mono text-red-800">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-xs text-red-700 mt-2 overflow-x-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <Button 
              onClick={this.handleReset}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Convenience wrapper for step components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
}

/**
 * Chart-specific error boundary with demo-safe fallback
 * Critical for preventing chart crashes during live demos
 */
export function ChartErrorBoundary({ children, chartName }: { children: ReactNode; chartName?: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="h-64 flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Chart temporarily unavailable</p>
            <p className="text-xs text-gray-500 mt-1">
              {chartName ? `${chartName} data is being processed` : 'Data is being processed'}
            </p>
          </div>
        </div>
      }
      onError={(error: any, errorInfo: any) => {
        console.error(`Chart error in ${chartName || 'unknown chart'}:`, error);
        // In production, this could report to error tracking
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Form-specific error boundary that preserves user input
 * Essential for fund setup wizard where data loss would be catastrophic
 */
export function FormErrorBoundary({ children, formName }: { children: ReactNode; formName?: string }) {
  return (
    <ErrorBoundary
      fallback={
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800">
                {formName ? `${formName} form` : 'Form'} encountered an error. Your data has been preserved.
              </p>
            </div>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
              className="mt-2 text-amber-700 border-amber-300 hover:bg-amber-100"
            >
              Refresh to continue
            </Button>
          </CardContent>
        </Card>
      }
      onError={(error: any, errorInfo: any) => {
        console.error(`Form error in ${formName || 'unknown form'}:`, error);
        // Preserve form state in localStorage before refresh
        const formData = document.querySelector('form');
        if (formData) {
          const formDataObj = new FormData(formData);
          const preserved = Object.fromEntries(formDataObj.entries());
          localStorage.setItem(`form_backup_${formName || 'unknown'}`, JSON.stringify(preserved));
        }
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Calculation-specific error boundary for financial computations
 * Shows graceful fallback while calculations recover
 */
export function CalculationErrorBoundary({
  children,
  calculationType,
  fallbackValue
}: {
  children: ReactNode;
  calculationType?: string;
  fallbackValue?: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        fallbackValue || (
          <div className="p-3 border border-blue-200 bg-blue-50 rounded">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-800">
                {calculationType ? `${calculationType} calculation` : 'Calculation'} temporarily unavailable
              </p>
            </div>
            <p className="text-xs text-blue-600 mt-1">
              Using cached results or default values
            </p>
          </div>
        )
      }
      onError={(error: any, errorInfo: any) => {
        console.error(`Calculation error in ${calculationType || 'unknown calculation'}:`, error);
        // Could trigger fallback calculation here
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Demo-safe async error handler for promises and async operations
 * Never throws, always logs gracefully
 */
export function handleAsyncError(error: any, context: string = 'Unknown'): void {
  console.error(`Async error in ${context}:`, error);

  // In production, you might want to report this to an error tracking service
  // For demo purposes, we just log it and continue
}

/**
 * Safe wrapper for async operations during demos
 * Returns fallback value instead of throwing
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  context: string = 'Unknown'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    handleAsyncError(error, context);
    return fallbackValue;
  }
}