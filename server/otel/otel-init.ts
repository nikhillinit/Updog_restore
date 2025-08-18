// server/otel/otel-init.ts
// Minimal OTel bootstrap (fill exporters/collector URL per environment)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

export function initOtel() {
  const sdk = new NodeSDK({
    instrumentations: [ new HttpInstrumentation() ]
  });
  sdk.start();
  return sdk;
}
