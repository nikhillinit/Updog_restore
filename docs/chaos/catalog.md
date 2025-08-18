# Chaos Scenario Catalog
- Single-point: DB latency/failure, Redis fail, engine non-finite
- Cascades: DB latency + Redis eviction + worker saturation
- Network partition: Redis master split-brain; expect 503 READONLY on writes
- Disk pressure/OOM (bounded): verify back-pressure & recovery
Run on staging per release at 50% of baseline RPS; cache passing results 7 days.
