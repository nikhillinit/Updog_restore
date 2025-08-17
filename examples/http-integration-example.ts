/**
 * Example: Integrating circuit breaker into HTTP calls
 * 
 * This shows how to protect external API calls with circuit breakers
 * and implement stale data fallbacks for resilience.
 */

import { HttpBreakerService } from '../server/infra/circuit-breaker/http-breaker';
import { breakerRegistry } from '../server/infra/circuit-breaker/breaker-registry';

// Example: Partner API service with circuit breaker protection
export class PartnerApiService {
  private httpBreaker: HttpBreakerService;

  constructor(private baseUrl: string) {
    this.httpBreaker = new HttpBreakerService('partner-api');
    breakerRegistry.register('partner-api', this.httpBreaker);
  }

  async getCompanyData(companyId: string) {
    const cacheKey = `company:${companyId}`;
    
    const result = await this.httpBreaker.execute(
      // Primary operation: fetch from API
      async () => {
        const response = await fetch(`${this.baseUrl}/companies/${companyId}`, {
          timeout: 2000, // 2 second timeout
          headers: {
            'Authorization': `Bearer ${process.env.PARTNER_API_TOKEN}`,
            'User-Agent': 'UpDog/1.0'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Partner API error: ${response.status}`);
        }
        
        return response.json();
      },
      cacheKey // This enables stale data fallback
    );

    return {
      ...result.data,
      _meta: {
        degraded: result.degraded,
        source: result.degraded ? 'stale-cache' : 'live-api'
      }
    };
  }

  async getMarketData(symbol: string) {
    const cacheKey = `market:${symbol}`;
    
    try {
      const result = await this.httpBreaker.execute(
        async () => {
          // Simulate external market data API
          const response = await fetch(`${this.baseUrl}/market/${symbol}`);
          return response.json();
        },
        cacheKey
      );

      return result;
    } catch (error) {
      console.warn(`Failed to get market data for ${symbol}:`, error);
      // Return safe default when everything fails
      return {
        data: { symbol, price: null, error: 'Service unavailable' },
        degraded: true
      };
    }
  }
}

// Example: Express route with degraded response headers
export function createPartnerRoute() {
  const partnerApi = new PartnerApiService('https://api.partner.com');

  return async (req: any, res: any) => {
    try {
      const { companyId } = req.params;
      const result = await partnerApi.getCompanyData(companyId);

      // Set degraded headers for client awareness
      if (result._meta.degraded) {
        res.setHeader('X-Circuit-State', 'degraded');
        res.setHeader('X-Data-Source', result._meta.source);
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }

      res.json(result);
    } catch (error) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        degraded: true
      });
    }
  };
}

// Example: Client-side fund service enhancement
export async function enhancedFundCreation(payload: any) {
  const httpBreaker = new HttpBreakerService('funds-api');
  breakerRegistry.register('funds-api', httpBreaker);

  const result = await httpBreaker.execute(
    // Primary operation
    async () => {
      const response = await fetch('/api/funds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Fund creation failed: ${response.status}`);
      }

      return response.json();
    },
    `fund-create:${JSON.stringify(payload)}` // Cache key for idempotency
  );

  return result;
}