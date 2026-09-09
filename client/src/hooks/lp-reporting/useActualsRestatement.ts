import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  FinancialFactsBasisRefSchema,
  type FinancialFactsBasisRef,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import { ActualsPublishFileV1Schema } from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ActualsRestatementHistoryResponseV1Schema,
  ActualsRestatementPreviewRequestV1Schema,
  ActualsRestatementPreviewResponseV1Schema,
  ActualsRestatementPublishRequestV1Schema,
  ActualsRestatementReadRequestV1Schema,
  ActualsRestatementReceiptV1Schema,
  ActualsRestatementTargetsResponseV1Schema,
  type ActualsRestatementPreviewRequestV1,
  type ActualsRestatementPublishRequestV1,
  type ActualsRestatementReceiptV1,
} from '@shared/contracts/lp-reporting/actuals-restatement.contract';
import { sha256Bytes, sha256Hash } from '@/lib/hash';
import {
  contractFetch,
  readContractResponse,
  type ContractResponseSchema,
  type LpReportingHookError,
} from './contract-fetch';

export const restatementBasisKey = (basis: FinancialFactsBasisRef) =>
  JSON.stringify(FinancialFactsBasisRefSchema.parse(basis));

function responseError(message: string, status = 200): LpReportingHookError {
  return Object.assign(new Error(message), { code: 'CONTRACT_PARSE_ERROR', status });
}

function useRestatementRead<T extends { basisRef: FinancialFactsBasisRef }>(
  fundId: number,
  basis: FinancialFactsBasisRef | null,
  scope: 'targets' | 'history',
  cursor: string | null,
  enabled: boolean,
  schema: ContractResponseSchema<T>
) {
  return useQuery<T, LpReportingHookError>({
    queryKey: ['lp-reporting', 'actuals-restatements', fundId, scope, basis, cursor],
    enabled: enabled && basis !== null,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const request = ActualsRestatementReadRequestV1Schema.parse({
        expectedBasis: basis,
        limit: 50,
        cursor,
      });
      if (request.expectedBasis.fundId !== fundId) throw responseError('Fund basis mismatch.');
      const query = new URLSearchParams({
        expectedBasis: restatementBasisKey(request.expectedBasis),
        limit: String(request.limit),
      });
      if (request.cursor !== null) query.set('cursor', request.cursor);
      const response = await contractFetch(
        `/api/funds/${fundId}/imports/actuals/restatements/${scope}?${query}`,
        { method: 'GET', credentials: 'same-origin', cache: 'no-store' },
        schema,
        'Correction records did not match the required contract.'
      );
      if (restatementBasisKey(response.basisRef) !== restatementBasisKey(request.expectedBasis)) {
        throw Object.assign(
          new Error('Correction records belong to a different published basis.'),
          {
            code: 'STALE_BASIS',
            status: 409,
          }
        );
      }
      return response;
    },
  });
}

export function useActualsRestatementTargets(
  fundId: number,
  basis: FinancialFactsBasisRef | null,
  cursor: string | null,
  enabled: boolean
) {
  return useRestatementRead(
    fundId,
    basis,
    'targets',
    cursor,
    enabled,
    ActualsRestatementTargetsResponseV1Schema
  );
}

export function useActualsRestatementHistory(
  fundId: number,
  basis: FinancialFactsBasisRef | null,
  cursor: string | null,
  enabled: boolean
) {
  return useRestatementRead(
    fundId,
    basis,
    'history',
    cursor,
    enabled,
    ActualsRestatementHistoryResponseV1Schema
  );
}

export function useActualsRestatementPreview(fundId: number) {
  return useMutation({
    mutationFn: async (input: ActualsRestatementPreviewRequestV1) => {
      const request = ActualsRestatementPreviewRequestV1Schema.parse(input);
      const response = await contractFetch(
        `/api/funds/${fundId}/imports/actuals/restatements/dry-run`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'If-Match': request.expectedETag },
          body: JSON.stringify(request),
        },
        ActualsRestatementPreviewResponseV1Schema,
        'Correction preview did not match the required contract.'
      );
      if (restatementBasisKey(response.basisRef) !== restatementBasisKey(request.expectedBasis)) {
        throw responseError('Correction preview belongs to a different published basis.');
      }
      if (
        response.items.length !== request.items.length ||
        response.items.some(
          (item) =>
            !request.items.some(
              (expected) =>
                JSON.stringify(item.original.identity) === JSON.stringify(expected.target) &&
                JSON.stringify(item.original.originalPublication) ===
                  JSON.stringify(expected.originalPublication) &&
                item.replacementExternalRef === expected.replacementExternalRef &&
                item.replacementContentHash === expected.expectedReplacementContentHash
            )
        )
      )
        throw responseError('Correction preview does not match the selected replacement.');
      return response;
    },
  });
}

const storedBodySchema = ActualsRestatementPublishRequestV1Schema.innerType()
  .omit({ ledger: true, valuation: true })
  .extend({
    ledger: ActualsPublishFileV1Schema.omit({ payload: true }).nullable(),
    valuation: ActualsPublishFileV1Schema.omit({ payload: true }).nullable(),
  })
  .strict();
const storedCommandSchema = z
  .object({
    version: z.literal(1),
    fundId: z.number().int().positive(),
    key: z
      .string()
      .uuid()
      .regex(/^[a-f0-9-]+$/),
    identityHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['ready', 'uncertain', 'refused']),
    body: storedBodySchema,
  })
  .strict();

export interface FrozenRestatementCommand {
  stored: z.infer<typeof storedCommandSchema>;
  body: ActualsRestatementPublishRequestV1 | null;
  serializedBody: string | null;
}

const storageKey = (fundId: number) => `actuals-restatement:v1:${fundId}`;
const metadataFor = (body: ActualsRestatementPublishRequestV1) => {
  const omitPayload = (
    file: NonNullable<
      ActualsRestatementPublishRequestV1['ledger'] | ActualsRestatementPublishRequestV1['valuation']
    >
  ) => {
    const { payload: _payload, ...metadata } = file;
    return metadata;
  };
  return storedBodySchema.parse({
    ...body,
    ledger: body.ledger === null ? null : omitPayload(body.ledger),
    valuation: body.valuation === null ? null : omitPayload(body.valuation),
  });
};

export function recoverRestatementCommand(fundId: number): {
  command: FrozenRestatementCommand | null;
  corrupt: boolean;
} {
  try {
    const raw = sessionStorage.getItem(storageKey(fundId));
    if (raw === null) return { command: null, corrupt: false };
    const stored = storedCommandSchema.parse(JSON.parse(raw));
    if (stored.fundId !== fundId || stored.body.expectedBasis.fundId !== fundId) {
      throw new Error('Stored correction belongs to a different fund.');
    }
    return { command: { stored, body: null, serializedBody: null }, corrupt: false };
  } catch {
    return { command: null, corrupt: true };
  }
}

export const clearRestatementCommand = (fundId: number) =>
  sessionStorage.removeItem(storageKey(fundId));

export function persistRestatementCommand(command: FrozenRestatementCommand) {
  const stored = storedCommandSchema.parse(command.stored);
  sessionStorage.setItem(storageKey(stored.fundId), JSON.stringify(stored));
}

export async function prepareActualsFile(file: File, maxBytes: number) {
  if (file.size > maxBytes)
    throw new Error(`${file.name} exceeds ${Math.floor(maxBytes / 1024)} KB.`);
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(file);
        });
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { file, payload: btoa(binary), payloadSha256: await sha256Bytes(bytes) };
}

export async function freezeRestatementCommand(
  fundId: number,
  request: ActualsRestatementPublishRequestV1
): Promise<FrozenRestatementCommand> {
  const body = ActualsRestatementPublishRequestV1Schema.parse(request);
  if (body.expectedBasis.fundId !== fundId) throw new Error('Correction fund mismatch.');
  const metadata = metadataFor(body);
  const command: FrozenRestatementCommand = {
    stored: storedCommandSchema.parse({
      version: 1,
      fundId,
      key: crypto.randomUUID().toLowerCase(),
      identityHash: await sha256Hash(metadata),
      status: 'ready',
      body: metadata,
    }),
    body,
    serializedBody: JSON.stringify(body),
  };
  persistRestatementCommand(command);
  return command;
}

export async function restoreRestatementFile(
  command: FrozenRestatementCommand,
  file: File
): Promise<FrozenRestatementCommand> {
  const metadata = command.stored.body;
  const expected = metadata.ledger ?? metadata.valuation;
  if (expected === null || (metadata.ledger !== null && metadata.valuation !== null)) {
    throw new Error('This correction requires its original replacement files.');
  }
  const prepared = await prepareActualsFile(file, 122_880);
  if (prepared.payloadSha256 !== expected.expectedPayloadSha256) {
    throw new Error('Replacement file bytes differ from the frozen correction.');
  }
  const restored = { ...expected, payload: prepared.payload };
  const body = ActualsRestatementPublishRequestV1Schema.parse({
    ...metadata,
    ledger: metadata.ledger === null ? null : restored,
    valuation: metadata.valuation === null ? null : restored,
  });
  if ((await sha256Hash(metadataFor(body))) !== command.stored.identityHash) {
    throw new Error('Stored correction identity cannot be verified.');
  }
  return { ...command, body, serializedBody: JSON.stringify(body) };
}

export function isRestatementOutcomeUncertain(error: LpReportingHookError) {
  return (
    error.code === 'MUTATION_OUTCOME_UNKNOWN' ||
    error.status === undefined ||
    (error.status >= 200 && error.status < 300) ||
    (error.status >= 500 &&
      !['TRANSACTION_UNSUPPORTED', 'PUBLISH_RETRY_EXHAUSTED'].includes(error.code ?? ''))
  );
}

export function useActualsRestatementPublish(fundId: number) {
  const queryClient = useQueryClient();
  return useMutation<
    ActualsRestatementReceiptV1,
    LpReportingHookError & { retryAfterSeconds?: number },
    FrozenRestatementCommand
  >({
    mutationFn: async (command) => {
      const body = ActualsRestatementPublishRequestV1Schema.parse(command.body);
      if (
        command.stored.fundId !== fundId ||
        command.serializedBody !== JSON.stringify(body) ||
        (await sha256Hash(metadataFor(body))) !== command.stored.identityHash
      ) {
        throw new Error('Frozen correction identity cannot be verified.');
      }
      const response = await fetch(`/api/funds/${fundId}/imports/actuals/restatements/publish`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': body.expectedETag,
          'Idempotency-Key': command.stored.key,
        },
        body: command.serializedBody,
      });
      let receipt: ActualsRestatementReceiptV1;
      try {
        receipt = await readContractResponse(
          response,
          ActualsRestatementReceiptV1Schema,
          'Correction receipt did not match the required contract.'
        );
      } catch (error) {
        if (error instanceof SyntaxError)
          throw responseError('Correction receipt was not valid JSON.', response.status);
        const retryAfter = response.headers.get('Retry-After');
        if (error instanceof Error && retryAfter !== null && /^\d+$/.test(retryAfter)) {
          Object.assign(error, { retryAfterSeconds: Number(retryAfter) });
        }
        throw error;
      }
      if (
        receipt.fundId !== fundId ||
        receipt.asOfDate !== body.expectedBasis.asOfDate ||
        receipt.basisRef.fundId !== fundId ||
        receipt.basisRef.snapshotId !== receipt.facts.snapshotId ||
        receipt.basisRef.snapshotInputHash !== receipt.facts.snapshotInputHash ||
        receipt.basisRef.asOfDate !== receipt.asOfDate ||
        receipt.basisRef.knowledgeCutoff !== receipt.facts.knowledgeCutoff ||
        receipt.basisRef.policyVersion !== receipt.facts.policyVersion ||
        receipt.facts.etag !==
          `"financial-facts:${receipt.facts.snapshotId}:${receipt.facts.snapshotInputHash}"` ||
        receipt.facts.supersedesSnapshotId !== body.expectedBasis.snapshotId ||
        receipt.coverage.priorFactsSnapshotId !== body.expectedBasis.snapshotId ||
        receipt.effectiveBasis.predecessorSnapshotInputHash !==
          body.expectedBasis.snapshotInputHash ||
        receipt.restatement.asOfDate !== body.expectedBasis.asOfDate ||
        receipt.restatement.reason !== body.reason ||
        receipt.restatement.items.length !== body.items.length ||
        receipt.restatement.items.some(
          (item) =>
            !body.items.some(
              (expected) =>
                JSON.stringify(item.target) === JSON.stringify(expected.target) &&
                JSON.stringify(item.originalPublication) ===
                  JSON.stringify(expected.originalPublication) &&
                item.replacement.contentHash === expected.expectedReplacementContentHash
            )
        ) ||
        (['ledger', 'valuation'] as const).some((kind) => {
          const supplied = body[kind];
          const admitted = receipt.admitted[kind];
          if (supplied === null || admitted === null) return supplied !== admitted;
          const recordIds =
            'approvedRowIds' in admitted ? admitted.approvedRowIds : admitted.approvedMarkIds;
          const replacements = receipt.restatement.items.filter(
            (item) => item.target.kind === kind
          );
          const effectiveIds =
            kind === 'ledger'
              ? receipt.effectiveBasis.ledgerRecordIds
              : receipt.effectiveBasis.valuationRecordIds;
          return (
            admitted.payloadSha256 !== supplied.expectedPayloadSha256 ||
            admitted.canonicalRowsHash !== supplied.expectedCanonicalRowsHash ||
            admitted.previewHash !== supplied.expectedPreviewHash ||
            admitted.approvedCount !== replacements.length ||
            recordIds.length !== replacements.length ||
            replacements.some(
              (item) =>
                !recordIds.includes(item.replacement.recordId) ||
                !effectiveIds.includes(item.replacement.recordId) ||
                effectiveIds.includes(item.target.recordId)
            )
          );
        })
      ) {
        throw responseError(
          'Correction receipt does not match the frozen command.',
          response.status
        );
      }
      return receipt;
    },
    onSuccess: (receipt) => {
      void queryClient.invalidateQueries({
        queryKey: ['lp-reporting', 'financial-facts-latest-reference', fundId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['lp-reporting', 'actuals-restatements', fundId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['lp-reporting', 'actuals-metrics', fundId, receipt.facts.snapshotId],
      });
    },
  });
}
