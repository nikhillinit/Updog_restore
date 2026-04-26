interface ApiErrorBody {
  message?: string;
  error?: string;
}

function getContentType(response: Response) {
  return response.headers?.get?.('content-type') ?? '';
}

export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = getContentType(response);
  if (contentType && !contentType.toLowerCase().includes('json')) {
    throw new Error(`${fallbackMessage}: expected JSON but received ${contentType}`);
  }

  return response.json() as Promise<T>;
}

export async function readApiErrorBody(
  response: Response,
  fallbackMessage: string
): Promise<ApiErrorBody | null> {
  return readJsonResponse<ApiErrorBody>(response, fallbackMessage).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('expected JSON')) {
      throw error;
    }

    return null;
  });
}

export function buildErrorMessage(errorData: ApiErrorBody | null, fallback: string) {
  return errorData?.message || errorData?.error || fallback;
}
