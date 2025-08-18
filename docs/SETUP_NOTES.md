# Setup Notes
Secrets required:
- `READINESS_URL` (staging base URL)
- `SYNTHETIC_URL` (staging base URL)
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` for collector.
Ensure `npm run generate-spec` is available to emit OpenAPI JSON.
