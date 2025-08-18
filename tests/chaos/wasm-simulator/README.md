# WASM Fault Simulator (CLI)

Reads JSON from stdin, corrupts numeric fields, outputs JSON to stdout.

```bash
echo '{"moic":1.2,"irr":0.14,"percentiles":{"50":1.1}}' \
  | FAULT_RATE=0.5 FAULT_SEED=7 node index.js
```

Env:

* `FAULT_RATE` — probability 0..1
* `FAULT_SEED` — deterministic seed
* `FAULT_TARGETS` — comma list to prioritize (default: `irr,moic,median,percentiles`)