import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes as S } from '@opentelemetry/semantic-conventions';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export const sdk = new NodeSDK({
  resource: new Resource({
    [S.SERVICE_NAME]: 'updog-api',
    [S.DEPLOYMENT_ENVIRONMENT]: process.env['NODE_ENV'] || 'dev'
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT']
    }),
    exportIntervalMillis: 10_000
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});