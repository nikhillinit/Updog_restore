 
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  getWarningIcon,
  getWarningBadgeVariant,
  groupWarningsBySeverity,
} from '@/lib/reallocation-utils';
import type { ReallocationWarning } from '@/types/reallocation';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface WarningsPanelProps {
  warnings: ReallocationWarning[];
}

function WarningItem({ warning }: { warning: ReallocationWarning }) {
  const [isOpen, setIsOpen] = useState(false);
  const icon = getWarningIcon(warning.severity);
  const variant = getWarningBadgeVariant(warning.severity);

  const hasDetails = warning.company_name || warning.company_id;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-md border p-3 hover:bg-gray-50 transition-colors">
        <CollapsibleTrigger className="flex items-start gap-3 w-full text-left">
          <span className="text-lg mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={variant} className="text-xs">
                {warning.severity.toUpperCase()}
              </Badge>
              {hasDetails && (
                <span className="text-xs text-gray-500">
                  {warning.company_name || `Company #${warning.company_id}`}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-900">{warning.message}</p>
          </div>
          {hasDetails && (
            <div className="mt-1">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </div>
          )}
        </CollapsibleTrigger>

        {hasDetails && (
          <CollapsibleContent className="mt-3 pl-9">
            <div className="rounded-md bg-gray-100 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Type:</span>
                <span className="text-gray-900">{warning.type}</span>
              </div>
              {warning.company_id && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">
                    Company ID:
                  </span>
                  <span className="text-gray-900">{warning.company_id}</span>
                </div>
              )}
              {warning.company_name && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">
                    Company Name:
                  </span>
                  <span className="text-gray-900">{warning.company_name}</span>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

export function WarningsPanel({ warnings }: WarningsPanelProps) {
  const { errors, warnings: nonBlockingWarnings } =
    groupWarningsBySeverity(warnings);

  if (warnings.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div>
              <p className="font-medium text-green-800">All Checks Passed</p>
              <p className="text-sm text-green-600">
                No warnings or errors detected
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Validation Results</CardTitle>
          <div className="flex items-center gap-2">
            {errors.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {errors.length} Error{errors.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {nonBlockingWarnings.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {nonBlockingWarnings.length} Warning
                {nonBlockingWarnings.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Blocking Errors */}
        {errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <span>Blocking Errors</span>
              <span className="text-xs text-red-600">
                (Must be resolved before commit)
              </span>
            </h4>
            <div className="space-y-2">
              {errors.map((warning, index) => (
                <WarningItem key={`error-${index}`} warning={warning} />
              ))}
            </div>
          </div>
        )}

        {/* Non-Blocking Warnings */}
        {nonBlockingWarnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-yellow-700 flex items-center gap-2">
              <span>Warnings</span>
              <span className="text-xs text-yellow-600">
                (Can proceed with caution)
              </span>
            </h4>
            <div className="space-y-2">
              {nonBlockingWarnings.map((warning, index) => (
                <WarningItem key={`warning-${index}`} warning={warning} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
