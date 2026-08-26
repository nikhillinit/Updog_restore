import type { Response } from 'express';
import { NumberParseError } from '@shared/number';
import type { ApiError } from '@shared/types';

type ErrorLabel = string | ((_error: NumberParseError) => string);

function resolveErrorLabel(error: NumberParseError, label: ErrorLabel): string {
  return typeof label === 'function' ? label(error) : label;
}

export function handleNumberParseError(error: unknown, res: Response, label: ErrorLabel): boolean {
  if (!(error instanceof NumberParseError)) {
    return false;
  }

  const apiError: ApiError = {
    error: resolveErrorLabel(error, label),
    message: error.message,
  };
  res.status(400).json(apiError);
  return true;
}
