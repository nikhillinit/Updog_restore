/**
 * LP Reporting -- Single-event ledger dry-run form.
 *
 * Posts a one-row CSV payload to the existing protected route
 * `POST /api/funds/:fundId/imports/ledger/dry-run`. The dry-run service
 * decodes the base64 CSV, parses it with the same path the bulk import
 * uses, and returns an `ImportDryRunResponse` whose `preview` array we
 * surface back to the parent so the table can render it.
 *
 * Validation is enforced by `zodResolver` on the form schema mirrored
 * from the server's CSV contract:
 *   - `eventType` constrained to the 7 documented values from the
 *     `cash_flow_events` migration.
 *   - `amount` must match the decimal-string regex (NUMERIC(20,6)).
 *   - `eventDate` must be ISO-8601 (date or datetime).
 *   - `perspective` constrained to the 4 documented values.
 *   - `currency` is locked to `USD` (server rejects others).
 *
 * Per-field errors render under each input. Mutation-level errors
 * (401 / 403 / 429 / 500) are surfaced via the parent's `onError`
 * callback so the page can render a single error envelope above the
 * form.
 *
 * No JS-number arithmetic anywhere on the amount string.
 *
 * @module client/components/lp-reporting/LedgerEventForm
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLedgerImportDryRun } from '@/hooks/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';
import {
  CashFlowEventTypeSchema,
  CashFlowPerspectiveSchema,
  type ImportPreviewRow,
} from '@shared/contracts/lp-reporting';

const DECIMAL_STRING_REGEX = /^-?\d+(\.\d{1,6})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form schema mirrors the CSV column contract enforced server-side
 * in `parseLedgerCsv`. Strings only -- no numeric coercion on money.
 */
export const LedgerEventFormSchema = z
  .object({
    eventDate: z.string().regex(ISO_DATE_REGEX, 'Event date must be YYYY-MM-DD.'),
    eventType: CashFlowEventTypeSchema,
    amount: z
      .string()
      .min(1, 'Amount is required.')
      .regex(DECIMAL_STRING_REGEX, 'Amount must be a decimal string (e.g. 1000000.000000).'),
    currency: z.literal('USD'),
    perspective: CashFlowPerspectiveSchema,
    sourceRef: z.string().max(255).optional(),
  })
  .strict();

export type LedgerEventFormValues = z.infer<typeof LedgerEventFormSchema>;

const EVENT_TYPE_OPTIONS: ReadonlyArray<{
  value: LedgerEventFormValues['eventType'];
  label: string;
}> = [
  { value: 'lp_capital_call', label: 'LP capital call' },
  { value: 'lp_distribution', label: 'LP distribution' },
  { value: 'fund_expense', label: 'Fund expense' },
  { value: 'portfolio_investment', label: 'Portfolio investment' },
  { value: 'realized_proceeds', label: 'Realized proceeds' },
  { value: 'recallable_distribution', label: 'Recallable distribution' },
  { value: 'reversal', label: 'Reversal' },
];

const PERSPECTIVE_OPTIONS: ReadonlyArray<{
  value: LedgerEventFormValues['perspective'];
  label: string;
}> = [
  { value: 'fund_gross', label: 'Fund (gross)' },
  { value: 'lp_net', label: 'LP (net)' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'company', label: 'Company' },
];

/**
 * Build a one-row CSV from a validated form payload. Header row is
 * snake_case to match the server's normalized header parser. We do NOT
 * include `company_id` / `lp_id` etc. when empty; the parser treats
 * missing optional columns as `undefined`.
 *
 * Exported so tests can assert the wire shape independently of
 * fetch stubbing.
 */
export function buildLedgerCsv(values: LedgerEventFormValues): string {
  const escape = (raw: string): string => {
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const header = ['event_type', 'amount', 'currency', 'event_date', 'perspective', 'description'];
  const row = [
    values.eventType,
    values.amount,
    values.currency,
    values.eventDate,
    values.perspective,
    values.sourceRef ?? '',
  ].map(escape);

  return `${header.join(',')}\n${row.join(',')}\n`;
}

/**
 * Base64-encode a UTF-8 CSV string in a browser-safe way. We avoid
 * `Buffer` (Node-only) and use `TextEncoder` + `btoa` over a binary
 * string built from the encoded bytes.
 */
function csvToBase64(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export interface LedgerEventFormProps {
  fundId: number | null;
  onPreview: (rows: ImportPreviewRow[]) => void;
  onError?: (error: LpReportingHookError) => void;
}

export function LedgerEventForm({ fundId, onPreview, onError }: LedgerEventFormProps) {
  const mutation = useLedgerImportDryRun(fundId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LedgerEventFormValues>({
    resolver: zodResolver(LedgerEventFormSchema),
    defaultValues: {
      eventDate: '',
      eventType: 'lp_capital_call',
      amount: '',
      currency: 'USD',
      perspective: 'fund_gross',
      sourceRef: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const csv = buildLedgerCsv(values);
    const payload = csvToBase64(csv);
    try {
      const result = await mutation.mutateAsync({ sourceType: 'csv', payload });
      onPreview(result.preview);
    } catch (err) {
      if (onError && err && typeof err === 'object') {
        onError(err as LpReportingHookError);
      }
    }
  });

  const disabled = fundId === null || isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Ledger event dry-run form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ledger-event-date">Event date</Label>
          <Input
            id="ledger-event-date"
            type="date"
            placeholder="YYYY-MM-DD"
            aria-invalid={errors.eventDate ? true : undefined}
            {...register('eventDate')}
          />
          {errors.eventDate?.message ? (
            <p data-testid="error-eventDate" className="text-sm text-destructive font-poppins">
              {errors.eventDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-event-type">Event type</Label>
          <select
            id="ledger-event-type"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.eventType ? true : undefined}
            {...register('eventType')}
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.eventType?.message ? (
            <p data-testid="error-eventType" className="text-sm text-destructive font-poppins">
              {errors.eventType.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-amount">Amount (decimal string)</Label>
          <Input
            id="ledger-amount"
            type="text"
            inputMode="decimal"
            placeholder="1000000.000000"
            aria-invalid={errors.amount ? true : undefined}
            {...register('amount')}
          />
          {errors.amount?.message ? (
            <p data-testid="error-amount" className="text-sm text-destructive font-poppins">
              {errors.amount.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-currency">Currency</Label>
          <Input
            id="ledger-currency"
            type="text"
            readOnly
            aria-invalid={errors.currency ? true : undefined}
            {...register('currency')}
          />
          {errors.currency?.message ? (
            <p data-testid="error-currency" className="text-sm text-destructive font-poppins">
              {errors.currency.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-perspective">Perspective</Label>
          <select
            id="ledger-perspective"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.perspective ? true : undefined}
            {...register('perspective')}
          >
            {PERSPECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.perspective?.message ? (
            <p data-testid="error-perspective" className="text-sm text-destructive font-poppins">
              {errors.perspective.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-source-ref">Source reference (optional)</Label>
          <Input
            id="ledger-source-ref"
            type="text"
            placeholder="e.g. Capital call notice 2026-Q1"
            {...register('sourceRef')}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending ? 'Validating...' : 'Preview event'}
        </Button>
      </div>
    </form>
  );
}

export default LedgerEventForm;
