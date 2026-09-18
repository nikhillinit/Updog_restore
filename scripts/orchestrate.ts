#!/usr/bin/env ts-node

import express from 'express';

const app = express();
const message =
  'Legacy reserve, pacing, and cohort worker orchestration is unavailable; use supported application calculation paths.';

app.get('/health', (_request, response) => {
  response.status(503).json({ status: 'unavailable', message });
});

const server = app.listen(Number(process.env['ORCHESTRATOR_PORT'] ?? 3002), () => {
  console.error(message);
});

let closePromise: Promise<void> | undefined;
const close = (): Promise<void> => {
  closePromise ??= new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return closePromise;
};

process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
