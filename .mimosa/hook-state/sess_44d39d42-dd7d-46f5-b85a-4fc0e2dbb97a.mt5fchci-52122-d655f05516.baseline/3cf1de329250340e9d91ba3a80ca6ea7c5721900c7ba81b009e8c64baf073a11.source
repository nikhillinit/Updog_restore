/**
 * MSW handlers for AI provider APIs
 * Mocks OpenAI, Claude, and other AI services for testing
 */

import { http, HttpResponse } from 'msw';

export const aiProviderHandlers = [
  // OpenAI Chat Completions
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;

    return HttpResponse.json({
      id: 'chatcmpl-mock-123',
      object: 'chat.completion',
      created: Date.now(),
      model: body.model || 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock response from OpenAI',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  }),

  // Anthropic Claude Messages
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.json() as any;

    return HttpResponse.json({
      id: 'msg-mock-456',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Mock response from Claude',
        },
      ],
      model: body.model || 'claude-3-sonnet-20240229',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 15,
        output_tokens: 25,
      },
    });
  }),

  // Add other AI providers as needed
];
