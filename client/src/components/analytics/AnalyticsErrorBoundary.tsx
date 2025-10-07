import type { ReactNode } from 'react';
import React, { Component } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class AnalyticsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to external service
    console.error('Analytics Error Boundary caught an error:', error, errorInfo);

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // You could also send error to monitoring service here
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  override render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <AnalyticsErrorFallback error={this.state.error} onRetry={() => this.handleRetry()} />;
    }

    return this.props.children;
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };
}

interface AnalyticsErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

function AnalyticsErrorFallback({ error, onRetry }: AnalyticsErrorFallbackProps) {
  const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('network');
  const isAuthError = error?.message?.includes('401') || error?.message?.includes('unauthorized');
  const isDataError = error?.message?.includes('data') || error?.message?.includes('parse');

  let title = "Analytics Error";
  let message = "Something went wrong while loading the analytics feature.";
  let suggestions: string[] = [];

  if (isNetworkError) {
    title = "Connection Error";
    message = "Unable to connect to the analytics service.";
    suggestions = [
      "Check your internet connection",
      "Verify the API service is running",
      "Try refreshing the page"
    ];
  } else if (isAuthError) {
    title = "Authentication Error";
    message = "You don't have permission to access this analytics feature.";
    suggestions = [
      "Log out and log back in",
      "Contact your administrator for access",
      "Check your fund permissions"
    ];
  } else if (isDataError) {
    title = "Data Processing Error";
    message = "There was an issue processing the analytics data.";
    suggestions = [
      "Try selecting a different time range",
      "Check if the fund data is valid",
      "Contact support if the issue persists"
    ];
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-gray-600">{message}</p>

          {error && (
            <details className="bg-gray-50 p-4 rounded-lg">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                Technical Details
              </summary>
              <pre className="text-xs text-gray-600 bg-white p-3 rounded border overflow-auto">
                {error.message}
                {error.stack && (
                  <div className="mt-2 pt-2 border-t">
                    {error.stack}
                  </div>
                )}
              </pre>
            </details>
          )}

          {suggestions.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Try these solutions:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                {suggestions.map((suggestion: any, index: any) => (
                  <li key={index} className="flex items-start">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center space-x-4">
            {onRetry && (
              <Button onClick={onRetry} className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.location.href = '/dashboard'}
              className="flex items-center space-x-2"
            >
              <Home className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Higher-order component for wrapping analytics pages
export function withAnalyticsErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }
) {
  return function WrappedComponent(props: P) {
    return (
      <AnalyticsErrorBoundary fallback={options?.fallback} onError={options?.onError}>
        <Component {...props} />
      </AnalyticsErrorBoundary>
    );
  };
}

// Hook for handling analytics errors in components
export function useAnalyticsErrorHandler() {
  const handleError = React.useCallback((error: Error, context?: string) => {
    console.error(`Analytics Error${context ? ` in ${context}` : ''}:`, error);

    // You could also send to monitoring service here
    // Example: Sentry.captureException(error, { tags: { component: context } });
  }, []);

  return { handleError };
}