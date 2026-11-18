import { useEffect, useRef, useState } from 'react';
import {
  VEHICLE_COMMITMENT_ATTESTATION,
  VEHICLE_ONBOARDING_MAX_SOURCE_BYTES,
  VEHICLE_ONBOARDING_VERSION,
  VehicleOnboardingRequestSchema,
  type VehicleOnboardingReceipt,
  type VehicleOnboardingRequest,
} from '@shared/contracts/lp-reporting/vehicle-onboarding.contract';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFinancialFactsLatestReference } from '@/hooks/lp-reporting/useFinancialFactsLatestReference';
import {
  useVehicleOnboarding,
  type VehicleOnboardingCommand,
} from '@/hooks/lp-reporting/useVehicleOnboarding';
import { useIdempotencyKey, type IdempotencyKeyScope } from '@/hooks/useIdempotencyKey';
import { useAuthSession } from '@/lib/auth-session';
import { sha256Bytes, sha256Hash } from '@/lib/hash';

async function fileBytes(file: File): Promise<Uint8Array> {
  if (file.size > VEHICLE_ONBOARDING_MAX_SOURCE_BYTES) {
    throw new Error('The source must be 120 KiB or smaller.');
  }
  const buffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(new Error('The source file could not be read.'));
          reader.readAsArrayBuffer(file);
        });
  return new Uint8Array(buffer);
}

function sourceBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function outcomeUnknown(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const candidate = error as { status?: number; code?: string };
  return (
    candidate.status === undefined ||
    candidate.status < 400 ||
    candidate.status === 408 ||
    candidate.status >= 500 ||
    candidate.code === 'REQUEST_IN_PROGRESS' ||
    candidate.code === 'IDEMPOTENCY_RACE_UNRESOLVED'
  );
}

// These codes are emitted only after a replay miss under the fund lock.
export const DEFINITIVE_REFUSAL_CODES = new Set([
  'IDEMPOTENCY_KEY_REUSE',
  'SOURCE_IDENTITY_CONFLICT',
  'VEHICLE_IDENTITY_CONFLICT',
  'VEHICLE_DECLARATION_CONFLICT',
]);

export function MainFundOnboardingPanel({ fundId }: { fundId: number }) {
  const session = useAuthSession();
  const user = session.data?.user;
  const eligible = !session.isError && user?.role === 'admin';
  const availability = useFinancialFactsLatestReference(eligible ? fundId : null);
  if (!eligible) return null;
  if (availability.isError && availability.error?.status === 404) return null;
  if (!availability.data || availability.isError) {
    return (
      <p className="text-sm text-charcoal/70" role="status">
        {availability.isError
          ? 'Main-fund onboarding is unavailable for this fund. Pilot access must be verified.'
          : 'Checking main-fund onboarding access…'}
      </p>
    );
  }
  return <DeclarationForm key={`${user.id}:${fundId}`} fundId={fundId} actorId={user.id} />;
}

function DeclarationForm({ fundId, actorId }: { fundId: number; actorId: string }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [commitment, setCommitment] = useState('');
  const [sourceMode, setSourceMode] = useState<'manual' | 'structured_paste' | 'file'>('manual');
  const [sourceText, setSourceText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceLocator, setSourceLocator] = useState('');
  const [attested, setAttested] = useState(false);
  const [frozen, setFrozen] = useState<
    | (Omit<VehicleOnboardingCommand, 'idempotencyKey'> & {
        fingerprint: string;
        idempotencyKey: string | null;
      })
    | null
  >(null);
  const [receipt, setReceipt] = useState<VehicleOnboardingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const mutation = useVehicleOnboarding();
  const scope: IdempotencyKeyScope = { fundId, actorId, operation: 'vehicle_onboarding' };
  const keys = useIdempotencyKey(scope);
  const locked = frozen !== null || busy || receipt !== null;
  const canDiscard = (unknown || keys.restored) && !receipt;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function finishAction() {
    running.current = false;
    if (alive.current) setBusy(false);
  }

  async function review() {
    if (running.current || frozen || !attested) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      let bytes: Uint8Array;
      let source: VehicleOnboardingRequest['source'];
      if (sourceMode !== 'file') {
        bytes = new TextEncoder().encode(sourceText);
        source = { sourceType: sourceMode, content: sourceText };
      } else {
        if (!sourceFile) throw new Error('Choose a CSV or XLSX source file.');
        const extension = sourceFile.name.toLowerCase().split('.').pop();
        if (extension !== 'csv' && extension !== 'xlsx') {
          throw new Error('Choose a CSV or XLSX source file.');
        }
        bytes = await fileBytes(sourceFile);
        source = {
          sourceType: extension,
          fileName: sourceFile.name,
          payloadBase64: sourceBase64(bytes),
        };
      }
      if (bytes.byteLength === 0 || bytes.byteLength > VEHICLE_ONBOARDING_MAX_SOURCE_BYTES) {
        throw new Error('The source must contain evidence and be 120 KiB or smaller.');
      }
      const parsed = VehicleOnboardingRequestSchema.safeParse({
        contractVersion: VEHICLE_ONBOARDING_VERSION,
        vehicleSlug: slug,
        name,
        committedCapital: commitment,
        source,
        sourceLocator,
        attestation: VEHICLE_COMMITMENT_ATTESTATION,
      });
      if (!parsed.success) {
        throw new Error(
          `Review ${parsed.error.issues[0]?.path.join(' ') || 'declaration'}: ${parsed.error.issues[0]?.message || 'Invalid value.'}`
        );
      }
      const [fingerprint, sourceSha256] = await Promise.all([
        sha256Hash(parsed.data),
        sha256Bytes(bytes),
      ]);
      if (!alive.current) return;
      const idempotencyKey = keys.restored ? keys.keyFor(fingerprint, scope, false) : null;
      setFrozen({
        fingerprint,
        fundId,
        actorId,
        body: parsed.data,
        serializedBody: JSON.stringify(parsed.data),
        idempotencyKey,
        sourceSha256,
      });
      setUnknown(keys.restored);
      setRefused(false);
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : 'Declaration could not be prepared.');
    } finally {
      finishAction();
    }
  }

  async function submit() {
    if (!frozen || running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    let command: (VehicleOnboardingCommand & { fingerprint: string }) | null = null;
    try {
      // An unsent review is disposable. Persist recovery metadata only at dispatch.
      command = {
        ...frozen,
        idempotencyKey: frozen.idempotencyKey ?? keys.keyFor(frozen.fingerprint, scope, false),
      };
      setFrozen(command);
      const result = await mutation.mutateAsync(command);
      if (!alive.current) return;
      keys.reset({
        fundId: command.fundId,
        actorId: command.actorId,
        operation: 'vehicle_onboarding',
      });
      setReceipt(result);
      setFrozen(null);
      setUnknown(false);
    } catch (failure) {
      if (!alive.current) return;
      const code =
        typeof failure === 'object' &&
        failure !== null &&
        'code' in failure &&
        typeof failure.code === 'string'
          ? failure.code
          : '';
      const definitive =
        !outcomeUnknown(failure) && (!unknown || DEFINITIVE_REFUSAL_CODES.has(code));
      if (definitive) {
        const resetScope = command ?? frozen;
        keys.reset({
          fundId: resetScope.fundId,
          actorId: resetScope.actorId,
          operation: 'vehicle_onboarding',
        });
        setUnknown(false);
        setRefused(true);
        setError(failure instanceof Error ? failure.message : 'The declaration was refused.');
      } else {
        setUnknown(true);
        setRefused(false);
        setError(
          'The outcome is uncertain. Retry this unchanged declaration; do not submit another one.'
        );
      }
    } finally {
      finishAction();
    }
  }

  function edit() {
    if (busy || unknown) return;
    keys.reset(scope);
    setFrozen(null);
    setReceipt(null);
    setError(null);
    setRefused(false);
  }

  function discard() {
    if (busy) return;
    keys.reset(scope);
    setFrozen(null);
    setUnknown(false);
    setRefused(false);
    setError(null);
  }

  return (
    <section
      className="space-y-4 rounded-presson-md border border-presson-borderSubtle bg-presson-surface p-6"
      aria-labelledby="main-fund-onboarding-title"
      data-testid="main-fund-onboarding"
    >
      <header>
        <h2
          id="main-fund-onboarding-title"
          className="font-inter text-balance text-lg font-semibold text-charcoal"
        >
          Declare the main fund
        </h2>
        <p className="mt-1 text-sm text-charcoal/70">
          Fund {fundId}. Declare one active USD main-fund vehicle and its source-backed commitment
          before previewing actuals. Existing mismatches are refused.
        </p>
      </header>
      {keys.restored && !receipt && (
        <Alert>
          <AlertTitle>Pending declaration</AlertTitle>
          <AlertDescription>
            Reselect the exact source and declaration details to recover this attempt. Source
            contents are not saved in this browser.
          </AlertDescription>
        </Alert>
      )}
      <fieldset disabled={locked} className="space-y-4">
        <legend className="sr-only">Main-fund declaration</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onboarding-slug">Main fund slug</Label>
            <Input
              id="onboarding-slug"
              className="min-h-11"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              maxLength={64}
              aria-describedby="onboarding-slug-help"
            />
            <p id="onboarding-slug-help" className="text-xs text-charcoal/70">
              Lowercase letters, numbers and single hyphens.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-name">Vehicle display name</Label>
            <Input
              id="onboarding-name"
              className="min-h-11"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={128}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-commitment">Committed capital (USD)</Label>
            <Input
              id="onboarding-commitment"
              value={commitment}
              onChange={(event) => setCommitment(event.target.value)}
              inputMode="decimal"
              className="min-h-11 tabular-nums"
              aria-describedby="onboarding-commitment-help"
            />
            <p id="onboarding-commitment-help" className="text-xs text-charcoal/70">
              Enter the source-backed amount, without commas. This does not change the fund model.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-source-mode">Evidence format</Label>
            <select
              id="onboarding-source-mode"
              className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent"
              value={sourceMode}
              onChange={(event) => setSourceMode(event.target.value as typeof sourceMode)}
            >
              <option value="manual">Manual source text</option>
              <option value="structured_paste">Structured paste</option>
              <option value="file">CSV or XLSX file</option>
            </select>
          </div>
        </div>
        <p id="onboarding-source-help" className="text-xs text-charcoal/70">
          Maximum source size: 120 KiB. The declaration records your attestation; it does not
          independently verify the document.
        </p>
        {sourceMode !== 'file' ? (
          <div className="space-y-2">
            <Label htmlFor="onboarding-source-text">Commitment source text</Label>
            <Textarea
              id="onboarding-source-text"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              aria-describedby="onboarding-source-help"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="onboarding-source-file">Commitment source file</Label>
            <Input
              id="onboarding-source-file"
              className="min-h-11"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
              aria-describedby="onboarding-source-help"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="onboarding-source-locator">Location in source</Label>
          <Input
            id="onboarding-source-locator"
            className="min-h-11"
            value={sourceLocator}
            onChange={(event) => setSourceLocator(event.target.value)}
            maxLength={1024}
            placeholder="Sheet and cell, or section and paragraph"
          />
        </div>
        <label className="flex min-h-11 items-start gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            className="mt-1 accent-charcoal"
            checked={attested}
            onChange={(event) => setAttested(event.target.checked)}
          />
          I attest that this source supports the declared USD commitment.
        </label>
      </fieldset>
      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="text-sm text-presson-negative">
          {error}
        </div>
      )}
      {frozen && (
        <div className="space-y-2 border-t border-presson-borderSubtle pt-4 text-sm" role="status">
          <p>
            Review: {frozen.body.name} ({frozen.body.vehicleSlug}), USD{' '}
            {frozen.body.committedCapital}; source location: {frozen.body.sourceLocator}.
          </p>
          <p className="text-charcoal/70">
            This saves a vehicle declaration and evidence together. It does not publish actuals.
          </p>
        </div>
      )}
      {receipt && (
        <Alert>
          <AlertTitle>
            {receipt.outcome === 'created' ? 'Main fund declared' : 'Existing main fund confirmed'}
          </AlertTitle>
          <AlertDescription>
            Declaration {receipt.commandId}, vehicle {receipt.vehicleId}, recorded{' '}
            {receipt.declaredAt}. This is a historical declaration. Continue with actuals preview
            below; publication remains a separate action.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        {!frozen && !receipt && (
          <Button
            className="min-h-11"
            type="button"
            disabled={busy || !attested}
            onClick={() => void review()}
          >
            {busy ? 'Preparing declaration…' : 'Review declaration'}
          </Button>
        )}
        {frozen && (
          <Button
            className="min-h-11"
            type="button"
            disabled={busy || refused}
            onClick={() => void submit()}
          >
            {busy
              ? 'Saving declaration…'
              : unknown
                ? 'Retry unchanged declaration'
                : 'Declare main fund'}
          </Button>
        )}
        {(receipt || frozen) && !unknown && (
          <Button
            className="min-h-11"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={edit}
          >
            {receipt ? 'Review another declaration' : 'Edit declaration'}
          </Button>
        )}
        {canDiscard && (
          <Button
            className="min-h-11"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={discard}
          >
            Discard pending attempt
          </Button>
        )}
      </div>
      {canDiscard && (
        <p className="text-xs text-charcoal/70">
          If the discarded attempt was saved, declaring the same details confirms the existing main
          fund; different details are refused.
        </p>
      )}
      {!attested && !locked && (
        <p className="text-xs text-charcoal/70">
          Attest to the commitment source before reviewing the declaration.
        </p>
      )}
    </section>
  );
}
