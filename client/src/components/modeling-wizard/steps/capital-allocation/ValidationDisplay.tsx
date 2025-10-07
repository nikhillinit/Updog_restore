/**
 * ValidationDisplay Component
 *
 * Displays validation results with color-coded alerts:
 * - Red alerts for errors (blocking issues)
 * - Yellow alerts for warnings (recommendations)
 * - Green alerts for success (all validations passed)
 */

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ValidationMessage {
  type: 'error' | 'warning' | 'success';
  title: string;
  message: string;
  field?: string;
}

export interface ValidationDisplayProps {
  messages: ValidationMessage[];
  className?: string;
}

export function ValidationDisplay({ messages, className }: ValidationDisplayProps) {
  if (messages.length === 0) {
    return null;
  }

  // Group messages by type
  const errors = messages.filter(m => m.type === 'error');
  const warnings = messages.filter(m => m.type === 'warning');
  const successes = messages.filter(m => m.type === 'success');

  return (
    <div className={cn('space-y-3', className)}>
      {/* Error Alerts - Red */}
      {errors.map((msg, idx) => (
        <Alert
          key={`error-${idx}`}
          variant="destructive"
          className="border-error bg-error/10"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-inter font-bold text-error">
            {msg.title}
          </AlertTitle>
          <AlertDescription className="text-error/90 font-poppins">
            {msg.message}
            {msg.field && (
              <span className="block mt-1 text-sm font-medium">
                Field: {msg.field}
              </span>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {/* Warning Alerts - Yellow */}
      {warnings.map((msg, idx) => (
        <Alert
          key={`warning-${idx}`}
          className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
        >
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="font-inter font-bold text-yellow-800 dark:text-yellow-200">
            {msg.title}
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300 font-poppins">
            {msg.message}
            {msg.field && (
              <span className="block mt-1 text-sm font-medium">
                Field: {msg.field}
              </span>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {/* Success Alerts - Green */}
      {successes.map((msg, idx) => (
        <Alert
          key={`success-${idx}`}
          className="border-green-500 bg-green-50 dark:bg-green-900/20"
        >
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="font-inter font-bold text-green-800 dark:text-green-200">
            {msg.title}
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300 font-poppins">
            {msg.message}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

/**
 * Validation Summary Badge
 * Shows a count badge for each validation type
 */
export interface ValidationSummaryProps {
  messages: ValidationMessage[];
  className?: string;
}

export function ValidationSummary({ messages, className }: ValidationSummaryProps) {
  const counts = {
    error: messages.filter(m => m.type === 'error').length,
    warning: messages.filter(m => m.type === 'warning').length,
    success: messages.filter(m => m.type === 'success').length,
  };

  if (counts.error === 0 && counts.warning === 0 && counts.success === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {counts.error > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-error/10 border border-error">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <span className="text-sm font-medium text-error">
            {counts.error} {counts.error === 1 ? 'Error' : 'Errors'}
          </span>
        </div>
      )}

      {counts.warning > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 border border-yellow-500">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
          <span className="text-sm font-medium text-yellow-700">
            {counts.warning} {counts.warning === 1 ? 'Warning' : 'Warnings'}
          </span>
        </div>
      )}

      {counts.success > 0 && counts.error === 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            All Validations Passed
          </span>
        </div>
      )}
    </div>
  );
}
