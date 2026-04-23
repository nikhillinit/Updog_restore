import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Response } from 'express';

import {
  sendBodyValidationError,
  sendQueryValidationError,
} from '../../../server/lib/validation-response';

function createResponseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function getValidationError() {
  const result = z.object({ name: z.string() }).safeParse({ name: 123 });
  if (result.success) {
    throw new Error('Expected invalid payload for validation test');
  }
  return result.error;
}

describe('validation-response helpers', () => {
  it('sends the standard invalid request body payload', () => {
    const response = createResponseDouble();
    const error = getValidationError();

    sendBodyValidationError(response, error);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_request_body',
      message: 'Invalid request body',
      details: error.format(),
    });
  });

  it('sends the standard invalid query parameters payload', () => {
    const response = createResponseDouble();
    const error = getValidationError();

    sendQueryValidationError(response, error);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: error.format(),
    });
  });
});
