import fp from 'fastify-plugin';
import { register, collectDefaultMetrics } from 'prom-client';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

collectDefaultMetrics({ register });

// Minimal placeholders; replace with your real metrics sources.
async function gatherBusinessMetrics() {
  return {
    wizardFunnel: { started: 0, completed: 0, completionRate: 0 },
    calculationSuccess: { count: 0, errorRate: 0 },
    featureAdoption: {},
  };
}

async function plugin(fastify: FastifyInstance) {
  fastify.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  fastify.get('/healthz', async () => ({ status: 'ok', ts: Date.now() }));

  fastify.get('/business-metrics', async () => {
    const metrics = await gatherBusinessMetrics();
    return {
      timestamp: Date.now(),
      metrics: {
        wizardFunnel: metrics.wizardFunnel,
        calculationSuccess: metrics.calculationSuccess,
        featureAdoption: metrics.featureAdoption,
      }
    };
  });
}

export default fp(plugin);