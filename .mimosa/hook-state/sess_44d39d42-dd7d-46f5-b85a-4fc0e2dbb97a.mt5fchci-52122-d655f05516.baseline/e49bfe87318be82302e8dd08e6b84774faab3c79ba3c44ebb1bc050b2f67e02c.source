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

  it('forwards ask requests and preserves the success envelope', async () => {
    askAllAIsMock.mockResolvedValue([{ model: 'gpt', text: 'answer' }]);

    const response = await request(app)
      .post('/ask')
      .send({
        prompt: 'Summarize the portfolio',
        models: ['gpt'],
        tags: ['wave1b'],
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      results: [{ model: 'gpt', text: 'answer' }],
    });
    expect(askAllAIsMock).toHaveBeenCalledWith({
      prompt: 'Summarize the portfolio',
      models: ['gpt'],
      tags: ['wave1b'],
    });
  });

  it('returns a typed server error for ask failures', async () => {
    askAllAIsMock.mockRejectedValue(new Error('provider offline'));

    const response = await request(app).post('/ask').send({ prompt: 'test prompt' }).expect(500);

    expect(response.body).toEqual({
      success: false,
      error: 'provider offline',
    });
  });

  it('returns usage stats on success', async () => {
    getUsageStatsMock.mockResolvedValue({
      totalCalls: 7,
      dailyBudgetRemaining: 193,
    });

    const response = await request(app).get('/usage').expect(200);

    expect(response.body).toEqual({
      totalCalls: 7,
      dailyBudgetRemaining: 193,
    });
  });

  it('keeps usage failures on the existing response shape', async () => {
    getUsageStatsMock.mockRejectedValue(new Error('stats unavailable'));

    const response = await request(app).get('/usage').expect(500);

    expect(response.body).toEqual({
      error: 'stats unavailable',
    });
  });

  it('returns debate results on success', async () => {
    aiDebateMock.mockResolvedValue({
      transcript: ['claude: pro', 'gpt: con'],
      winner: 'claude',
    });

    const response = await request(app)
      .post('/debate')
      .send({
        topic: 'Should reserve pacing be front-loaded?',
        ai1: 'claude',
        ai2: 'gpt',
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      result: {
        transcript: ['claude: pro', 'gpt: con'],
        winner: 'claude',
      },
    });
    expect(aiDebateMock).toHaveBeenCalledWith({
      topic: 'Should reserve pacing be front-loaded?',
      ai1: 'claude',
      ai2: 'gpt',
    });
  });

  it('returns consensus results on success', async () => {
    aiConsensusMock.mockResolvedValue({
      recommendation: 'prefer typed adapters',
      confidence: 0.91,
    });

    const response = await request(app)
      .post('/consensus')
      .send({
        question: 'What is the safest route boundary strategy?',
        models: ['claude', 'gpt'],
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      result: {
        recommendation: 'prefer typed adapters',
        confidence: 0.91,
      },
    });
    expect(aiConsensusMock).toHaveBeenCalledWith({
      question: 'What is the safest route boundary strategy?',
      models: ['claude', 'gpt'],
    });
  });

  it('returns collaboration results on success', async () => {
    collaborativeSolveMock.mockResolvedValue({
      solution: 'Introduce shared route parsers first',
      participants: ['claude', 'gpt'],
    });

    const response = await request(app)
      .post('/collaborate')
      .send({
        problem: 'Design the next Wave 1B route refactor step',
        approach: 'parallel',
        models: ['claude', 'gpt'],
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      result: {
        solution: 'Introduce shared route parsers first',
        participants: ['claude', 'gpt'],
      },
    });
    expect(collaborativeSolveMock).toHaveBeenCalledWith({
      problem: 'Design the next Wave 1B route refactor step',
      approach: 'parallel',
      models: ['claude', 'gpt'],
    });
  });
});
