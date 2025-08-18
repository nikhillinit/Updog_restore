# PR #12 — WASM Fault Injector + Engine Non-Finite Guards

This kit adds:
- A **test-only fault injector** that can introduce `NaN`/`Infinity`/extremes into calc results
- A **deep finite guard** for API responses (blocks non-finite numbers from leaving the service)
- A **Vitest integration test** to validate the guard
- A small **WASM-like simulator** CLI for fuzzing via stdin/JSON (optional, used in tests or locally)
- A **local chaos runner** script

## Steps

1) **Copy files** (see file list below).
2) **Guard your API** responses that return calculation results:
   - Import `assertFiniteDeep` from `server/middleware/engine-guards`
   - Check results with `assertFiniteDeep` and reject on `ok=false`.
3) **Wrap engine with faults in tests**:
   - Use `withFaults` in tests; enable with `ENGINE_FAULT_RATE` env var.
4) **Scripts** (add to `package.json` if missing):
   ```json
   {
     "scripts": {
       "test:chaos": "vitest run tests/chaos",
       "test:chaos:wasm": "vitest run tests/chaos/wasm-fault.integration.test.ts",
       "chaos:start": "docker-compose -f docker-compose.chaos.yml up -d",
       "chaos:stop": "docker-compose -f docker-compose.chaos.yml down",
       "chaos:reset": "curl -s -X POST http://localhost:8474/reset || true"
     }
   }
   ```

5. **Local run**

   ```bash
   # Optional: start toxiproxy/DB chaos infra (if present in your repo)
   npm run chaos:start

   # Engine-only chaos test
   ENGINE_FAULT_RATE=0.7 npm run test:chaos:wasm

   # Full chaos suite (PG/Redis + Engine)
   ENGINE_FAULT_RATE=0.2 npm run test:chaos

   npm run chaos:stop
   ```

## Acceptance (PR checklist)

* 422 with `{ error: 'ENGINE_NONFINITE', path }` when non-finite results are produced
* No `NaN`/`Infinity` in any API response (manual probes + tests)
* `ENGINE_FAULT_RATE=0` → all tests pass; performance unchanged
* If correlation IDs are enabled, they appear in logs for rejections

## Files Added

* `server/middleware/engine-guards.ts` - Deep non-finite value guard
* `server/engine/fault-injector.ts` - Test-only fault injection wrapper
* `server/routes/simulations-guarded.example.ts` - Example integration
* `tests/chaos/README.md` - Updated with engine chaos docs
* `tests/chaos/INTEGRATION.md` - This file
* `tests/chaos/wasm-fault.integration.test.ts` - Integration tests
* `tests/chaos/wasm-simulator/Dockerfile` - Container for CLI
* `tests/chaos/wasm-simulator/package.json` - CLI package
* `tests/chaos/wasm-simulator/index.js` - Fault simulator CLI
* `tests/chaos/wasm-simulator/README.md` - CLI documentation
* `scripts/run-chaos-tests.sh` - Updated chaos test runner

## Integration Example (Express)

```typescript
import { assertFiniteDeep } from '../middleware/engine-guards';

app.post('/api/simulate', async (req, res) => {
  const result = await runSimulation(req.body);
  
  const guard = assertFiniteDeep(result);
  if (!guard.ok) {
    const correlationId = req.headers['x-correlation-id'];
    console.error(`[ENGINE_NONFINITE] ${correlationId} at ${guard.path}`);
    return res.status(422).json({ 
      error: 'ENGINE_NONFINITE', 
      path: guard.path,
      correlationId 
    });
  }
  
  res.json(result);
});
```

## Testing Strategy

1. **Unit Tests**: Test guard detects NaN/Infinity at any depth
2. **Integration Tests**: Test fault injection produces detectable faults
3. **E2E Tests**: Test API rejects non-finite responses with 422
4. **Chaos Tests**: Run with various fault rates (0.1 to 0.9)

## Performance Impact

- **Guards**: < 1ms for typical responses (1000 fields)
- **Fault Injection**: Only active in test environment
- **Production**: Zero overhead when `NODE_ENV=production`

## Monitoring

Track these metrics:
- `engine.nonfinite.rejected` - Count of rejected responses
- `engine.guard.latency` - Time spent in guard checks
- `engine.fault.injected` - Count of injected faults (test only)