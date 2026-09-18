import { z } from 'zod';
import {
  ActualsDraftIdempotencyKeySchema,
  ActualsDraftIfMatchSchema,
  ActualsDraftLedgerFileV1Schema,
  ActualsDraftSaveRequestV1Schema,
  ActualsDraftValuationFileV1Schema,
  type ActualsDraftRevisionV1,
  type ActualsDraftSaveRequestV1,
} from '@shared/contracts/lp-reporting/actuals-draft.contract';
import { sha256Bytes, sha256Hash } from '@/lib/hash';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = { payloadSha256: digest, byteCount: z.number().int().nonnegative() };
const storedBody = ActualsDraftSaveRequestV1Schema.omit({ ledger: true, valuation: true }).extend({
  ledger: ActualsDraftLedgerFileV1Schema.omit({ payload: true }).extend(metadata),
  valuation: ActualsDraftValuationFileV1Schema.omit({ payload: true }).extend(metadata).nullable(),
});
const storedSchema = z
  .object({
    version: z.literal(1),
    fundId: z.number().int().positive(),
    key: ActualsDraftIdempotencyKeySchema,
    ifMatch: ActualsDraftIfMatchSchema,
    body: storedBody,
    identityHash: digest,
  })
  .strict();

export class DraftRecoveryMetadataError extends Error {}

export interface FrozenDraftSave {
  stored: z.infer<typeof storedSchema>;
  body: ActualsDraftSaveRequestV1 | null;
  serializedBody: string | null;
}

const storageKey = (fundId: number) => `actuals-draft-save:v1:${fundId}`;
export const decodeDraftPayload = (payload: string) =>
  Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));

async function bodyMetadata(body: ActualsDraftSaveRequestV1) {
  const describeFile = async (
    file: ActualsDraftSaveRequestV1['ledger'] | NonNullable<ActualsDraftSaveRequestV1['valuation']>
  ) => {
    const bytes = decodeDraftPayload(file.payload);
    return {
      templateVersion: file.templateVersion,
      fileName: file.fileName,
      payloadSha256: await sha256Bytes(bytes),
      byteCount: bytes.byteLength,
    };
  };
  return storedBody.parse({
    ...body,
    ledger: await describeFile(body.ledger),
    valuation: body.valuation ? await describeFile(body.valuation) : null,
  });
}

export function recoverDraftCommand(fundId: number): {
  command: FrozenDraftSave | null;
  corrupt: boolean;
} {
  try {
    const raw = sessionStorage.getItem(storageKey(fundId));
    if (raw === null) return { command: null, corrupt: false };
    const stored = storedSchema.parse(JSON.parse(raw));
    if (stored.fundId !== fundId) throw new Error('Wrong fund in draft recovery record.');
    return { command: { stored, body: null, serializedBody: null }, corrupt: false };
  } catch {
    return { command: null, corrupt: true };
  }
}

export function clearDraftCommand(fundId: number): void {
  sessionStorage.removeItem(storageKey(fundId));
}

export async function freezeDraftCommand(
  fundId: number,
  body: ActualsDraftSaveRequestV1,
  ifMatch: string
): Promise<FrozenDraftSave> {
  const fields = {
    version: 1 as const,
    fundId,
    key: crypto.randomUUID().toLowerCase(),
    ifMatch,
    body: await bodyMetadata(body),
  };
  const stored = storedSchema.parse({ ...fields, identityHash: await sha256Hash(fields) });
  // Write recovery metadata before POST. Raw file contents stay out of browser storage.
  sessionStorage.setItem(storageKey(fundId), JSON.stringify(stored));
  return { stored, body, serializedBody: JSON.stringify(body) };
}

export async function reconstructDraftCommand(
  command: FrozenDraftSave,
  files: Pick<ActualsDraftSaveRequestV1, 'ledger' | 'valuation'>
): Promise<FrozenDraftSave> {
  const { identityHash, ...fields } = command.stored;
  if ((await sha256Hash(fields)) !== identityHash)
    throw new DraftRecoveryMetadataError('Draft recovery metadata checksum is invalid.');
  const body = ActualsDraftSaveRequestV1Schema.parse({ ...fields.body, ...files });
  if ((await sha256Hash(await bodyMetadata(body))) !== (await sha256Hash(fields.body))) {
    throw new Error(
      'Reselect the original files: names, sizes and source hashes must match the pending save.'
    );
  }
  return { stored: command.stored, body, serializedBody: JSON.stringify(body) };
}

export async function confirmDraftReceipt(
  command: FrozenDraftSave,
  row: ActualsDraftRevisionV1
): Promise<void> {
  const stored = command.stored;
  const previous = /^"actuals-draft:([1-9][0-9]*):([1-9][0-9]*):([a-f0-9]{64})"$/.exec(
    stored.ifMatch
  );
  const priorRevision = previous ? Number(previous[2]) : null;
  const fileMatches = (
    actual: ActualsDraftRevisionV1['ledger'] | ActualsDraftRevisionV1['valuation'],
    expected: typeof stored.body.ledger | typeof stored.body.valuation
  ) =>
    expected === null
      ? actual === null
      : actual !== null &&
        actual.templateVersion === expected.templateVersion &&
        actual.fileName === expected.fileName &&
        actual.payloadSha256 === expected.payloadSha256 &&
        actual.byteCount === expected.byteCount;
  if (
    row.fundId !== stored.fundId ||
    (!previous && stored.ifMatch !== `"actuals-draft:${stored.fundId}:none"`) ||
    (previous && Number(previous[1]) !== stored.fundId) ||
    row.revision !== (priorRevision ?? 0) + 1 ||
    row.priorRevision !== priorRevision ||
    row.priorRevisionHash !== (previous?.[3] ?? null) ||
    row.etag !== `"actuals-draft:${stored.fundId}:${row.revision}:${row.revisionHash}"` ||
    row.classification !== stored.body.classification ||
    row.asOfDate !== stored.body.asOfDate ||
    row.sourceNote !== stored.body.sourceNote ||
    row.correctionReason !== stored.body.correctionReason ||
    !fileMatches(row.ledger, stored.body.ledger) ||
    !fileMatches(row.valuation, stored.body.valuation)
  )
    throw new Error(
      'Saved draft does not match this command and predecessor. Retry the same save.'
    );
}
