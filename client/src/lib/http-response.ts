import { isRecord } from '@shared/utils/type-guards';

/**
 * Extract an error message string from an unknown payload
 * @param payload The unknown response payload
 * @returns The message string if present, undefined otherwise
 */
export function getErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const message = payload['message'];
  return typeof message === 'string' ? message : undefined;
}

/**
 * Read and parse JSON from a fetch Response
 * @param response The fetch Response object
 * @returns Parsed JSON or null for empty bodies
 */
export async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.trim() === '' ? null : (JSON.parse(text) as unknown);
}

/**
 * Read a failed fetch response and preserve the hook-level fallback message.
 * @param response The failed fetch Response object
 * @param fallbackMessage Message to use when the response body has no message field
 * @returns API message payload or an HTTP status fallback
 */
export async function readHttpErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const errorData = await readJsonResponse(response).catch(() => null);
  return getErrorMessage(errorData) || `HTTP ${response.status}: ${fallbackMessage}`;
}
