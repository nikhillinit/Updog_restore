/**
 * Time-Travel Analytics API Tests
 *
 * Comprehensive unit tests for time-travel analytics API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { timeTravelFixtures } from '../../fixtures/time-travel-fixtures';
import { createSandbox } from '../../setup/test-infrastructure';

// Mock database queries
const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve([]))
          }))
        }))
      })),
      leftJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([]))
          }))
        }))
      }))
    }))
  })),
  query: {
    funds: {
      findFirst: vi.fn()
    }
  }
};

// Mock the database module
vi.mock('../../../server/db', () => ({
  db: mockDb
}));

// Mock validation middleware
vi.mock('../../../server/middleware/validation', () => ({
  validateRequest: () => (req: any, res: any, next: any) => next()
}));

// Mock async handler
vi.mock('../../../server/middleware/async', () => ({
  asyncHandler: (fn: any) => fn
}));

// Mock errors
vi.mock('../../../server/errors', () => ({
  NotFoundError: class NotFoundError extends Error {},
  ValidationError: class ValidationError extends Error {}
}));

// Mock logger
vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock metrics
vi.mock('../../../server/metrics', () => ({
  recordBusinessMetric: vi.fn()
}));

// Import the router after mocking
import timelineRouter from '../../../server/routes/timeline';

describe('Time-Travel Analytics API', () => {
  let app: express.Express;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();

    // Create Express app with timeline router
    app = express();
    app.use(express.json());

    // Mock cache provider
    app.locals.cache = {
      get: vi.fn(),
      set: vi.fn()
    };

    // Mock providers for snapshot creation
    app.locals.providers = {
      queue: { enabled: false }
    };

    app.use(timelineRouter);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('GET /api/timeline/:fundId', () => {
    it('should retrieve timeline events and snapshots', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          eventType: 'investment',
          eventTime: '2024-12-15T16:30:00Z',
          operation: 'create',
          entityType: 'company',
          metadata: { companyId: 1, amount: 500000 }
        },
        {
          id: 'event-2',
          eventType: 'valuation',
          eventTime: '2024-12-31T17:00:00Z',
          operation: 'update',
          entityType: 'company',
          metadata: { companyId: 1, newValuation: 600000 }
        }
      ];

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          snapshotTime: '2024-12-31T23:59:59Z',
          eventCount: 15,
          stateHash: 'abc123',
          metadata: { type: 'quarterly' }
        }
      ];

      const mockCount = [{ count: 2 }];

      // Mock database calls
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve(mockEvents))
              }))
            }))
          }))
        }))
      }));

      // Override for second call (snapshots)
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  offset: vi.fn(() => Promise.resolve(mockEvents))
                }))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(mockSnapshots))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockCount))
          }))
        });

      const response = await request(app)
        .get('/api/timeline/1')
        .expect(200);

      expect(response.body.fundId).toBe(1);
      expect(response.body.events).toEqual(mockEvents);
      expect(response.body.snapshots).toEqual(mockSnapshots);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.limit).toBe(100);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should handle query parameters for filtering', async () => {
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([]))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1?startTime=2024-01-01T00:00:00Z&endTime=2024-12-31T23:59:59Z&limit=50&offset=10')
        .expect(200);

      expect(response.body.fundId).toBe(1);
      expect(response.body.events).toEqual([]);
      expect(response.body.snapshots).toEqual([]);
    });

    it('should handle invalid fund ID', async () => {
      const response = await request(app)
        .get('/api/timeline/invalid')
        .expect(500); // The route would try to parse and fail

      // The actual error handling would depend on the validateRequest middleware
    });
  });

  describe('GET /api/timeline/:fundId/state', () => {
    it('should retrieve fund state at specific timestamp', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        snapshotTime: '2024-12-30T23:59:59Z',
        eventCount: 10,
        stateHash: 'abc123',
        state: timeTravelFixtures.snapshots.quarterlySnapshot.portfolio_state
      };

      const mockEvents = [
        {
          id: 'event-1',
          eventTime: '2024-12-31T12:00:00Z',
          eventType: 'valuation',
          operation: 'update'
        }
      ];

      // Mock cache miss
      app.locals.cache.get.mockResolvedValue(null);

      // Mock database calls
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([mockSnapshot]))
            }))
          }))
        }))
      }));

      // Second call for events
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([mockSnapshot]))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(mockEvents))
            }))
          }))
        });

      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z&includeEvents=true')
        .expect(200);

      expect(response.body.fundId).toBe(1);
      expect(response.body.snapshot.id).toBe('snapshot-1');
      expect(response.body.state).toBeDefined();
      expect(response.body.eventsApplied).toBe(1);
      expect(response.body.events).toEqual(mockEvents);

      // Verify cache operations
      expect(app.locals.cache.get).toHaveBeenCalled();
      expect(app.locals.cache.set).toHaveBeenCalled();
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        fundId: 1,
        snapshot: { id: 'cached-snapshot' },
        state: { totalValue: 2500000 }
      };

      app.locals.cache.get.mockResolvedValue(JSON.stringify(cachedResult));

      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
        .expect(200);

      expect(response.body).toEqual(cachedResult);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should handle missing timestamp parameter', async () => {
      const response = await request(app)
        .get('/api/timeline/1/state')
        .expect(500); // ValidationError would be thrown

      // The actual validation middleware would handle this
    });

    it('should handle no snapshot found', async () => {
      app.locals.cache.get.mockResolvedValue(null);

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([]))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
        .expect(500); // NotFoundError would be thrown
    });
  });

  describe('POST /api/timeline/:fundId/snapshot', () => {
    it('should create snapshot request (dev mode)', async () => {
      mockDb.query.funds.findFirst.mockResolvedValue({
        id: 1,
        name: 'Test Fund'
      });

      const snapshotData = {
        type: 'manual',
        description: 'Manual snapshot for testing'
      };

      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .send(snapshotData)
        .expect(202);

      expect(response.body.message).toContain('dev mode');
      expect(response.body.fundId).toBe(1);
      expect(response.body.type).toBe('manual');
      expect(response.body.estimatedCompletion).toBeDefined();
    });

    it('should handle fund not found', async () => {
      mockDb.query.funds.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .send({ type: 'manual' })
        .expect(500); // NotFoundError would be thrown
    });

    it('should use default values for optional fields', async () => {
      mockDb.query.funds.findFirst.mockResolvedValue({
        id: 1,
        name: 'Test Fund'
      });

      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .send({})
        .expect(202);

      expect(response.body.type).toBe('manual'); // Default value
    });

    it('should handle queue not available', async () => {
      // This is already the default in our setup (queue.enabled = false)
      mockDb.query.funds.findFirst.mockResolvedValue({
        id: 1,
        name: 'Test Fund'
      });

      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .send({ type: 'manual' })
        .expect(202);

      expect(response.body.message).toContain('dev mode');
    });
  });

  describe('GET /api/timeline/:fundId/compare', () => {
    it('should compare fund states at two timestamps', async () => {
      const mockState1 = {
        snapshot: { id: 'snapshot-1' },
        state: { totalValue: 2000000 },
        eventsApplied: 5
      };

      const mockState2 = {
        snapshot: { id: 'snapshot-2' },
        state: { totalValue: 2500000 },
        eventsApplied: 8
      };

      // Mock the fetchStateAtTime function calls
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([{
                id: 'snapshot-1',
                snapshotTime: '2024-11-30T23:59:59Z',
                state: mockState1.state
              }]))
            }))
          }))
        }))
      }));

      // Mock count query for events
      const mockEventCount = [{ count: 5 }];
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([{
                  id: 'snapshot-1',
                  snapshotTime: '2024-11-30T23:59:59Z',
                  state: mockState1.state
                }]))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockEventCount))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([{
                  id: 'snapshot-2',
                  snapshotTime: '2024-12-31T23:59:59Z',
                  state: mockState2.state
                }]))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([{ count: 8 }]))
          }))
        });

      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-11-30T23:59:59Z&timestamp2=2024-12-31T23:59:59Z&includeDiff=true')
        .expect(200);

      expect(response.body.fundId).toBe('1');
      expect(response.body.comparison.timestamp1).toBe('2024-11-30T23:59:59Z');
      expect(response.body.comparison.timestamp2).toBe('2024-12-31T23:59:59Z');
      expect(response.body.comparison.state1.snapshotId).toBe('snapshot-1');
      expect(response.body.comparison.state2.snapshotId).toBe('snapshot-2');
      expect(response.body.differences).toBeDefined();
      expect(response.body.summary.totalChanges).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing timestamp parameters', async () => {
      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-11-30T23:59:59Z')
        .expect(500); // ValidationError for missing timestamp2
    });

    it('should handle states not found', async () => {
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([]))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-11-30T23:59:59Z&timestamp2=2024-12-31T23:59:59Z')
        .expect(500); // NotFoundError would be thrown
    });

    it('should skip differences calculation when includeDiff=false', async () => {
      const mockState1 = {
        snapshot: { id: 'snapshot-1' },
        state: { totalValue: 2000000 },
        eventsApplied: 5
      };

      const mockState2 = {
        snapshot: { id: 'snapshot-2' },
        state: { totalValue: 2500000 },
        eventsApplied: 8
      };

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([{
                id: 'snapshot-1',
                snapshotTime: '2024-11-30T23:59:59Z',
                state: mockState1.state
              }]))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-11-30T23:59:59Z&timestamp2=2024-12-31T23:59:59Z&includeDiff=false')
        .expect(200);

      expect(response.body.differences).toBeNull();
    });
  });

  describe('GET /api/timeline/events/latest', () => {
    it('should retrieve latest events across all funds', async () => {
      const mockLatestEvents = [
        {
          id: 'event-1',
          fundId: 1,
          eventType: 'investment',
          eventTime: '2024-12-31T16:30:00Z',
          operation: 'create',
          entityType: 'company',
          metadata: { amount: 500000 },
          fundName: 'Fund 1'
        },
        {
          id: 'event-2',
          fundId: 2,
          eventType: 'exit',
          eventTime: '2024-12-30T15:00:00Z',
          operation: 'update',
          entityType: 'company',
          metadata: { proceeds: 1000000 },
          fundName: 'Fund 2'
        }
      ];

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(mockLatestEvents))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/events/latest?limit=10')
        .expect(200);

      expect(response.body.events).toEqual(mockLatestEvents);
      expect(response.body.timestamp).toBeDefined();
    });

    it('should filter by event types', async () => {
      const mockFilteredEvents = [
        {
          id: 'event-1',
          fundId: 1,
          eventType: 'investment',
          eventTime: '2024-12-31T16:30:00Z',
          fundName: 'Fund 1'
        }
      ];

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(mockFilteredEvents))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/events/latest?eventTypes=investment,exit&limit=5')
        .expect(200);

      expect(response.body.events).toEqual(mockFilteredEvents);
    });

    it('should use default limit when not provided', async () => {
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([]))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/events/latest')
        .expect(200);

      expect(response.body.events).toEqual([]);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    it('should test fetchStateAtTime helper function', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        snapshotTime: '2024-12-30T23:59:59Z',
        state: { totalValue: 2500000 }
      };

      const mockEventCount = [{ count: 3 }];

      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([mockSnapshot]))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockEventCount))
          }))
        });

      // We would need to access the helper function directly for this test
      // For now, we test it indirectly through the API endpoint
      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
        .expect(200);

      expect(response.body.snapshot.id).toBe('snapshot-1');
      expect(response.body.eventsApplied).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockDb.select.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/timeline/1')
        .expect(500);

      // The error would be caught by the async handler
    });

    it('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .type('json')
        .send('{"invalid": json}')
        .expect(400);

      // Express would handle malformed JSON at middleware level
    });

    it('should handle concurrent request race conditions', async () => {
      // Mock cache to simulate race condition
      app.locals.cache.get.mockResolvedValue(null);
      app.locals.cache.set.mockResolvedValue(true);

      const mockSnapshot = {
        id: 'snapshot-1',
        snapshotTime: '2024-12-30T23:59:59Z',
        state: { totalValue: 2500000 }
      };

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([mockSnapshot]))
            }))
          }))
        }))
      }));

      // Make concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app).get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.snapshot.id).toBe('snapshot-1');
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should cache state queries effectively', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        state: { totalValue: 2500000 }
      };

      // First request - cache miss
      app.locals.cache.get.mockResolvedValueOnce(null);
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([mockSnapshot]))
            }))
          }))
        }))
      }));

      await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
        .expect(200);

      expect(app.locals.cache.set).toHaveBeenCalledWith(
        expect.stringContaining('fund:1:state:'),
        expect.any(String),
        300 // 5 minutes cache
      );

      // Second request - cache hit
      const cachedResult = JSON.stringify({
        fundId: 1,
        snapshot: { id: 'snapshot-1' }
      });
      app.locals.cache.get.mockResolvedValueOnce(cachedResult);

      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=2024-12-31T23:59:59Z')
        .expect(200);

      expect(response.body.fundId).toBe(1);
      // Database should not be called again
    });

    it('should handle large timeline queries efficiently', async () => {
      const largeEventSet = Array(1000).fill(null).map((_, i) => ({
        id: `event-${i}`,
        eventType: 'investment',
        eventTime: new Date(Date.now() - i * 86400000).toISOString(),
        operation: 'create',
        entityType: 'company',
        metadata: { amount: Math.random() * 1000000 }
      }));

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve(largeEventSet.slice(0, 100)))
              }))
            }))
          }))
        }))
      }));

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/timeline/1?limit=100')
        .expect(200);
      const executionTime = Date.now() - startTime;

      expect(response.body.events).toHaveLength(100);
      expect(executionTime).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Query Parameter Edge Cases', () => {
    it('should handle malformed datetime parameters', async () => {
      const response = await request(app)
        .get('/api/timeline/1/state?timestamp=invalid-date')
        .expect(500);

      // ValidationError would be thrown by the validation middleware
    });

    it('should handle out-of-range numeric parameters', async () => {
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([]))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1?limit=99999&offset=-1')
        .expect(200);

      // The route should handle this gracefully, possibly with defaults
      expect(response.body.events).toEqual([]);
    });

    it('should handle special characters in query parameters', async () => {
      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([]))
              }))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1?startTime=2024-01-01T00:00:00%2B00:00') // URL encoded timezone
        .expect(200);

      expect(response.body.events).toEqual([]);
    });
  });

  describe('Snapshot Creation Edge Cases', () => {
    it('should handle maximum description length', async () => {
      mockDb.query.funds.findFirst.mockResolvedValue({
        id: 1,
        name: 'Test Fund'
      });

      const longDescription = 'a'.repeat(1000); // Very long description

      const response = await request(app)
        .post('/api/timeline/1/snapshot')
        .send({
          type: 'manual',
          description: longDescription
        })
        .expect(202);

      expect(response.body.fundId).toBe(1);
    });

    it('should handle various snapshot types', async () => {
      mockDb.query.funds.findFirst.mockResolvedValue({
        id: 1,
        name: 'Test Fund'
      });

      const snapshotTypes = ['manual', 'scheduled', 'auto'];

      for (const type of snapshotTypes) {
        const response = await request(app)
          .post('/api/timeline/1/snapshot')
          .send({ type })
          .expect(202);

        expect(response.body.type).toBe(type);
      }
    });
  });

  describe('State Comparison Edge Cases', () => {
    it('should handle identical timestamps', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        snapshotTime: '2024-12-31T23:59:59Z',
        state: { totalValue: 2500000 }
      };

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([mockSnapshot]))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-12-31T23:59:59Z&timestamp2=2024-12-31T23:59:59Z')
        .expect(200);

      expect(response.body.summary.timeSpan).toBe(0);
    });

    it('should handle reverse chronological order', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        snapshotTime: '2024-12-31T23:59:59Z',
        state: { totalValue: 2500000 }
      };

      mockDb.select.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([mockSnapshot]))
            }))
          }))
        }))
      }));

      const response = await request(app)
        .get('/api/timeline/1/compare?timestamp1=2024-12-31T23:59:59Z&timestamp2=2024-01-01T00:00:00Z')
        .expect(200);

      expect(response.body.summary.timeSpan).toBeGreaterThan(0);
    });
  });
});