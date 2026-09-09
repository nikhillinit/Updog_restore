import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { log } from 'node:console';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

const script = fileURLToPath(new URL('./smoke.sh', import.meta.url));
let healthBody;
let healthStatus;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  let body = '{"status":"ok","version":"test"}';
  if (request.url === '/api/health') {
    response.statusCode = healthStatus;
    body = healthBody;
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    body = '<html><div id="root"></div><script src="/assets/smoke.js"></script></html>';
  } else if (request.url === '/assets/smoke.js') {
    response.setHeader('Content-Type', 'application/javascript');
    body = '';
  }
  response.end(body);
});

const cases = [
  ['compact', '{"status":"ok"}', 0],
  ['spaces', '{ "status": "ok" }', 0],
  ['multiline', '{\n  "status"\n  :\n  "ok"\n}', 0],
  ['reordered', '{"version":"test","status":"ok"}', 0],
  ['unhealthy', '{"status":"error"}', 1],
  ['nested status', '{"status":"error","dependency":{"status":"ok"}}', 1],
  ['missing status', '{"version":"test"}', 1],
  ['malformed', '{"status":"ok"', 1],
  ['null', 'null', 1],
  ['HTTP failure', '{"status":"ok"}', 1, 503],
];

server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const [name, body, expectedExit, status = 200] of cases) {
    healthBody = body;
    healthStatus = status;
    const exitCode = await new Promise((resolve) => {
      execFile('bash', [script, baseUrl], { timeout: 10000 }, (error) => {
        resolve(error ? error.code : 0);
      });
    });
    assert.equal(exitCode, expectedExit, name);
  }
  log(`Passed ${cases.length} smoke health cases`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
