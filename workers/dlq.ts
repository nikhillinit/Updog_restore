export const DLQ_UNAVAILABLE_MESSAGE =
  'AI dead-letter queue storage and replay are not implemented for this application.';

export class DlqUnavailableError extends Error {
  constructor() {
    super(DLQ_UNAVAILABLE_MESSAGE);
    this.name = 'DlqUnavailableError';
  }
}

export interface FailedJob {
  id: string;
  operation: string;
  reason: string;
  payload: unknown;
  timestamp: number;
  error?: string;
  retries?: number;
}

function unavailable(): never {
  throw new DlqUnavailableError();
}

export async function enqueueDLQ(_job: FailedJob): Promise<void> {
  unavailable();
}

export async function readDLQ(_count = 100): Promise<Array<{ entryId: string; job: FailedJob }>> {
  unavailable();
}

export async function deleteDLQEntry(_entryId: string): Promise<void> {
  unavailable();
}

export async function getDLQStats(): Promise<{
  totalEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}> {
  unavailable();
}
