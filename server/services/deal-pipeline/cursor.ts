export interface CursorData {
  createdAt: string;
  id: number;
}

export function encodeCursor(createdAt: Date, id: number): string {
  const data: CursorData = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const data = JSON.parse(decoded) as CursorData;

    if (!data.createdAt || typeof data.id !== 'number') {
      return null;
    }

    const createdAt = new Date(data.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
