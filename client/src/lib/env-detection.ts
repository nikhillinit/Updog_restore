// Simple runtime detection for demo mode
export async function isStubMode(): Promise<boolean> {
  try {
    const response = await fetch('/api/stub-status');
    if (!response.ok) return false;
    const data = await response.json();
    return !!data.stubMode;
  } catch {
    // Default to off if API fails
    return false;
  }
}