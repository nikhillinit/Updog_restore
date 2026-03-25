// Simple runtime detection for demo mode
function isStubModeResponse(value: unknown): value is { stubMode?: boolean } {
  return typeof value === 'object' && value !== null && 'stubMode' in value;
}

export async function isStubMode(): Promise<boolean> {
  try {
    const response = await fetch('/api/stub-status');
    if (!response.ok) return false;
    const data: unknown = await response.json();
    return isStubModeResponse(data) && data.stubMode === true;
  } catch {
    // Default to off if API fails
    return false;
  }
}
