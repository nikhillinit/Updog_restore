/**
 * LP Reporting -- Single-mark valuation dry-run form.
 *
 * Posts a one-row CSV payload to the existing protected route
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 *
 * Validation mirrors the server's CSV column contract enforced in
 * `parseValuationMarksCsv`:
 *   - `companyId` positive integer
 *   - `markDate` / `asOfDate` ISO-8601 (YYYY-MM-DD)
 *   - `fairValue` decimal-string up to 6 fractional digits
 *   - `currency` locked to USD
 *   - `markSource` constrained to the 10 documented values
 *   - `confidenceLevel` enum -- defaults to `low` per design 8.6
 *     (imported marks are always low confidence)
 *
 * Per-field errors render under each input. Mutation-level errors
 * (401 / 403 / 429 / 500 / CONTRACT_PARSE_ERROR) are surfaced via the
 * parent's `onError` callback.
 *
 * No JS-number arithmetic on `fairValue`.
 *
 * @module client/components/lp-reporting/ValuationMarkForm
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useValuationMarkImportDryRun } from '@/hooks/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';
import {
  ConfidenceLevelSchema,
  MarkSourceSchema,
  type ImportPreviewRow,
} from '@shared/contracts/lp-reporting';

const DECIMAL_STRING_REGEX = /^-?\d+(\.\d{1,6})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form schema mirrors the CSV column contract enforced server-side
 * in `parseValuationMarksCsv`. Strings only -- no numeric coercion on
 * `fairValue`. `companyId` is captured as a string so we can validate
 * an explicit positive-integer regex without coercing through `Number`.
 */
export const ValuationMarkFormSchema = z
  .object({
    markDate: z.string().regex(ISO_DATE_REGEX, 'Mark date must be YYYY-MM-DD.'),
    asOfDate: z.string().regex(ISO_DATE_REGEX, 'As-of date must be YYYY-MM-DD.'),
    companyId: z
      .string()
      .min(1, 'Company ID is required.')
      .regex(/^[1-9]\d*$/, 'Company ID must be a positive integer.'),
    fairValue: z
      .string()
      .min(1, 'NAV is required.')
      .regex(DECIMAL_STRING_REGEX, 'NAV must be a decimal string (e.g. 1000000.000000).'),
    currency: z.literal('USD'),
    markSource: MarkSourceSchema,
    confidenceLevel: ConfidenceLevelSchema,
    valuationMethod: z.string().min(1, 'Valuation method is required.').max(64),
  })
  .strict();

export type ValuationMarkFormValues = z.infer<typeof ValuationMarkFormSchema>;

const MARK_SOURCE_OPTIONS: ReadonlyArray<{
  value: ValuationMarkFormValues['markSource'];
  label: string;
}> = [
  { value: 'financing_round', label: 'Financing round' },
  { value: 'signed_loi', label: 'Signed LOI' },
  { value: 'revenue_milestone', label: 'Revenue milestone' },
  { value: 'strategic_partnership', label: 'Strategic partnership' },
  { value: 'audited_financials', label: 'Audited financials' },
  { value: 'board_update', label: 'Board update' },
  { value: 'gp_estimate', label: 'GP estimate' },
  { value: 'third_party_priced', label: 'Third-party priced' },
  { value: 'secondary_transaction', label: 'Secondary transaction' },
  { value: 'impairment', label: 'Impairment' },
];

const CONFIDENCE_OPTIONS: ReadonlyArray<{
  value: ValuationMarkFormValues['confidenceLevel'];
  label: string;
}> = [
  { value: 'low', label: 'Low (default for imports)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/**
 * Build a one-row CSV from a validated form payload. Header is
 * snake_case to match the server's normalized header parser. We do
 * not include `vehicle_id` / `cost_basis` here; both are optional
 * server-side and the single-mark surface keeps the field set minimal.
 *
 * Exported so tests can assert the wire shape independently of fetch
 * stubbing.
 */
export function buildValuationMarkCsv(values: ValuationMarkFormValues): string {
  const escape = (raw: string): string => {
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const header = [
    'company_id',
    'mark_date',
    'as_of_date',
    'fair_value',
    'currency',
    'mark_source',
    'valuation_method',
    'confidence_level',
  ];
  const row = [
    values.companyId,
    values.markDate,
    values.asOfDate,
    values.fairValue,
    values.currency,
    values.markSource,
    values.valuationMethod,
    values.confidenceLevel,
  ].map(escape);

  return `${header.join(',')}\n${row.join(',')}\n`;
}

/**
 * Base64-encode a UTF-8 CSV string in a browser-safe way. Avoids the
 * Node-only `Buffer`; uses `TextEncoder` + `btoa` over a binary string.
 */
function csvToBase64(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export interface ValuationMarkFormProps {
  fundId: number | null;
  onPreview: (rows: ImportPreviewRow[]) => void;
  onError?: (error: LpReportingHookError) => void;
}

export function ValuationMarkForm({ fundId, onPreview, onError }: ValuationMarkFormProps) {
  const mutation = useValuationMarkImportDryRun(fundId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ValuationMarkFormValues>({
    resolver: zodResolver(ValuationMarkFormSchema),
    defaultValues: {
      markDate: '',
      asOfDate: '',
      companyId: '',
      fairValue: '',
      currency: 'USD',
      markSource: 'gp_estimate',
      // Imported marks default to LOW confidence per design 8.6.
      confidenceLevel: 'low',
      valuationMethod: 'unspecified',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const csv = buildValuationMarkCsv(values);
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
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Valuation mark dry-run form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="valuation-mark-date">Mark date</Label>
          <Input
            id="valuation-mark-date"
            type="date"
            placeholder="YYYY-MM-DD"
            aria-invalid={errors.markDate ? true : undefined}
            {...register('markDate')}
          />
          {errors.markDate?.message ? (
            <p data-testid="error-markDate" className="text-sm text-destructive font-poppins">
              {errors.markDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-as-of-date">As-of date</Label>
          <Input
            id="valuation-as-of-date"
            type="date"
            placeholder="YYYY-MM-DD"
            aria-invalid={errors.asOfDate ? true : undefined}
            {...register('asOfDate')}
          />
          {errors.asOfDate?.message ? (
            <p data-testid="error-asOfDate" className="text-sm text-destructive font-poppins">
              {errors.asOfDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-company-id">Company ID</Label>
          <Input
            id="valuation-company-id"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 42"
            aria-invalid={errors.companyId ? true : undefined}
            {...register('companyId')}
          />
          {errors.companyId?.message ? (
            <p data-testid="error-companyId" className="text-sm text-destructive font-poppins">
              {errors.companyId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-fair-value">NAV (decimal string)</Label>
          <Input
            id="valuation-fair-value"
            type="text"
            inputMode="decimal"
            placeholder="1000000.000000"
            aria-invalid={errors.fairValue ? true : undefined}
            {...register('fairValue')}
          />
          {errors.fairValue?.message ? (
            <p data-testid="error-fairValue" className="text-sm text-destructive font-poppins">
              {errors.fairValue.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-currency">Currency</Label>
          <Input
            id="valuation-currency"
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
          <Label htmlFor="valuation-mark-source">Mark source</Label>
          <select
            id="valuation-mark-source"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.markSource ? true : undefined}
            {...register('markSource')}
          >
            {MARK_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.markSource?.message ? (
            <p data-testid="error-markSource" className="text-sm text-destructive font-poppins">
              {errors.markSource.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-confidence-level">Confidence</Label>
          <select
            id="valuation-confidence-level"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.confidenceLevel ? true : undefined}
            {...register('confidenceLevel')}
          >
            {CONFIDENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.confidenceLevel?.message ? (
            <p
              data-testid="error-confidenceLevel"
              className="text-sm text-destructive font-poppins"
            >
              {errors.confidenceLevel.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valuation-method">Valuation method</Label>
          <Input
            id="valuation-method"
            type="text"
            placeholder="e.g. dcf, recent_round, unspecified"
            aria-invalid={errors.valuationMethod ? true : undefined}
            {...register('valuationMethod')}
          />
          {errors.valuationMethod?.message ? (
            <p
              data-testid="error-valuationMethod"
              className="text-sm text-destructive font-poppins"
            >
              {errors.valuationMethod.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending ? 'Validating...' : 'Preview mark'}
        </Button>
      </div>
    </form>
  );
}

export default ValuationMarkForm;
