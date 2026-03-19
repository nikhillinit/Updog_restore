import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { askAllAIsMock, getUsageStatsMock, aiDebateMock, aiConsensusMock, collaborativeSolveMock } =
  vi.hoisted(() => ({
    askAllAIsMock: vi.fn(),
    getUsageStatsMock: vi.fn(),
    aiDebateMock: vi.fn(),
    aiConsensusMock: vi.fn(),
    collaborativeSolveMock: vi.fn(),
  }));

vi.mock('../../../server/services/ai-orchestrator', () => ({
  askAllAIs: askAllAIsMock,
  getUsageStats: getUsageStatsMock,
  aiDebate: aiDebateMock,
  aiConsensus: aiConsensusMock,
  collaborativeSolve: collaborativeSolveMock,
}));

import aiRouter from '../../../server/routes/ai';

describe('AI routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(aiRouter);

    vi.clearAllMocks();
  });

  it('returns a validation error for invalid ask requests', async () => {
    const response = await request(app).post('/ask').send({ prompt: '' }).expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Invalid request',
      })
    );
    expect(response.body.details).toBeDefined();
    expect(askAllAIsMock).not.toHaveBeenCalled();
  });

  it('returns a typed server error for ask failures', async () => {
    askAllAIsMock.mockRejectedValue(new Error('provider offline'));

    const response = await request(app).post('/ask').send({ prompt: 'test prompt' }).expect(500);

    expect(response.body).toEqual({
      success: false,
      error: 'provider offline',
    });
  });

  it('keeps usage failures on the existing response shape', async () => {
    getUsageStatsMock.mockRejectedValue(new Error('stats unavailable'));

    const response = await request(app).get('/usage').expect(500);

    expect(response.body).toEqual({
      error: 'stats unavailable',
    });
  });
});
