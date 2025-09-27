import { z } from 'zod';

const Funds = z.array(z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  createdAt: z.string(),
}));

describe('API Funds Contract', () => {
  test('GET /api/funds matches contract & includes UI edge-cases', async () => {
    // Set stub mode for testing
    process.env.ENABLE_API_STUB = 'true';
    
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:4173';
    const res = await fetch(`${baseUrl}/api/funds`);
    
    // When stub is enabled, expect 200
    if (process.env.ENABLE_API_STUB === 'true') {
      expect(res.status).toBe(200);
      const funds = await res.json();

      // Validate schema
      expect(Funds.safeParse(funds).success).toBe(true);
      
      // Verify edge cases for UI testing
      expect(funds.some((f: any) => f.name.length > 30)).toBe(true); // Long names
      expect(funds.map((f: any) => f.currency)).toEqual(
        expect.arrayContaining(['USD','EUR'])
      );
      
      // Verify data variation
      const nameLengths = funds.map((f: any) => f.name.length);
      expect(nameLengths).toContain(9);  // 'POV Alpha'
      expect(nameLengths).toContain(26); // 'Press On Ventures Fund I'
      expect(nameLengths.some((l: number) => l > 60)).toBe(true); // Very long name
    } else {
      // When stub is disabled, expect 404 with helpful message
      expect(res.status).toBe(404);
      const error = await res.json();
      expect(error.error).toBe('API stub disabled');
      expect(error.hint).toContain('ENABLE_API_STUB=true');
    }
  });

  test('stub disabled returns graceful error', async () => {
    // Temporarily disable stub
    const originalEnv = process.env.ENABLE_API_STUB;
    process.env.ENABLE_API_STUB = 'false';
    
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:4173';
    const res = await fetch(`${baseUrl}/api/funds`);
    
    expect(res.status).toBe(404);
    const error = await res.json();
    expect(error.error).toBe('API stub disabled');
    expect(error.hint).toBe('Set ENABLE_API_STUB=true (preview) to enable demo mode');
    
    // Restore original env
    process.env.ENABLE_API_STUB = originalEnv;
  });
});