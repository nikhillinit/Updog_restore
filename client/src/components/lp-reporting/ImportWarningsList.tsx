/**
 * LP Reporting -- import warnings list.
 *
 * Renders an `ImportWarning[]` from the dry-run response as a stack
 * of shadcn `<Alert>` cards. The contract's `ImportWarningSchema`
 * does NOT carry a severity field on warnings (only `ImportError`
 * does), so we render every warning with the default tone and tag
 * each card with `data-warning-code` for testability.
 *
 * For symmetry with the spec we also accept `ImportError[]` and
 * render those with the destructive tone -- callers may pass either
 * collection. The component default is warnings-only.
 *
 * @module client/components/lp-reporting/ImportWarningsList
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ImportWarning, ImportError } from '@shared/contracts/lp-reporting';

export interface ImportWarningsListProps {
  warnings: ImportWarning[];
  errors?: ImportError[];
}

function severityVariant(severity: 'error' | 'warning' | 'info'): 'default' | 'destructive' {
  return severity === 'error' ? 'destructive' : 'default';
}

export function ImportWarningsList({ warnings, errors = [] }: ImportWarningsListProps) {
  const total = warnings.length + errors.length;
  if (total === 0) {
    return (
      <div data-testid="import-warnings-empty" className="rounded-md border border-dashed p-6">
        <p className="text-sm text-charcoal/70 font-poppins text-center">No warnings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="import-warnings-list">
      {errors.map((error, idx) => (
        <Alert
          key={`error-${error.row}-${idx}`}
          variant={severityVariant(error.severity)}
          data-warning-code={error.code}
          data-warning-severity={error.severity}
          data-row={error.row}
        >
          <AlertTitle>
            Row {error.row}
            {error.column ? ` -- ${error.column}` : ''} ({error.code})
          </AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ))}
      {warnings.map((warning, idx) => (
        <Alert
          key={`warning-${warning.row}-${idx}`}
          variant="default"
          data-warning-code={warning.code}
          data-warning-severity="warning"
          data-row={warning.row}
        >
          <AlertTitle>
            Row {warning.row}
            {warning.column ? ` -- ${warning.column}` : ''} ({warning.code})
          </AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export default ImportWarningsList;
