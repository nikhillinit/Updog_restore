import type { ParsedQs } from 'qs';

export type RequestValue = string | string[] | ParsedQs | (string | ParsedQs)[] | undefined;

export type RequestWithOptionalUser = {
  user?: {
    id?: string | number;
  };
};

export function firstString(value: RequestValue): string | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}

export function stringValues(value: RequestValue): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const values = value.flatMap((entry) => (typeof entry === 'string' ? [entry] : []));
    return values.length > 0 ? values : undefined;
  }

  return typeof value === 'string' ? [value] : undefined;
}

export function getUserId(req: RequestWithOptionalUser): number {
  const id = req.user?.id;
  if (!id) {
    return 0;
  }

  const parsed = parseInt(String(id), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
