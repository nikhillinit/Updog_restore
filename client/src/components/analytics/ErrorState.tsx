import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | string;
  onRetry?: () => void;
  onGoHome?: () => void;
  className?: string;
  showDetails?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We encountered an error while loading this data.",
  error,
  onRetry,
  onGoHome,
  className = "",
  showDetails = false
}: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  return (
    <Card className={className}>
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <CardTitle className="text-lg font-semibold text-gray-900">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-gray-600">{message}</p>

        {showDetails && errorMessage && (
          <Alert variant="destructive" className="text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-mono text-sm">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-center space-x-4">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </Button>
          )}
          {onGoHome && (
            <Button onClick={onGoHome} variant="default" className="flex items-center space-x-2">
              <Home className="w-4 h-4" />
              <span>Go Home</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiErrorState({
  error,
  onRetry,
  className = ""
}: {
  error: Error | string;
  onRetry?: () => void;
  className?: string;
}) {
  const errorMessage = error instanceof Error ? error.message : error;

  // Check for common API error patterns
  const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network');
  const isAuthError = errorMessage.includes('401') || errorMessage.includes('unauthorized');
  const isNotFoundError = errorMessage.includes('404') || errorMessage.includes('not found');

  let title = "API Error";
  let message = "There was a problem communicating with the server.";

  if (isNetworkError) {
    title = "Connection Error";
    message = "Please check your internet connection and try again.";
  } else if (isAuthError) {
    title = "Authentication Required";
    message = "Please log in to access this resource.";
  } else if (isNotFoundError) {
    title = "Data Not Found";
    message = "The requested data could not be found.";
  }

  return (
    <ErrorState
      title={title}
      message={message}
      error={error}
      onRetry={onRetry}
      className={className}
      showDetails={true}
    />
  );
}

export function EmptyState({
  title = "No data available",
  message = "There's no data to display at the moment.",
  actionLabel,
  onAction,
  className = ""
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="text-center py-12">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>

        {actionLabel && onAction && (
          <Button onClick={onAction} variant="default">
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}