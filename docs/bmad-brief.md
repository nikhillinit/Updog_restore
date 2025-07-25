#project-brief.md
# Gate G2B • BMAD Orchestration Brief
*Version 1.0 – committed YYYY‑MM‑DD*

> **BMAD loop = Build → Measure → Analyze → Decide**  
> Our goal is to ship Gate G2B in 14 days while meeting all performance, memory, and bundle‑size SLAs under an OSS‑first stack and <$200 /mo cloud spend (until LP beta).

---

## Tonight (Day 0)

| Phase | Action | Owner | Output |
|-------|--------|-------|--------|
| **B** | Stub `api/monte‑carlo.yaml` | API Dev | YAML committed |
| | Add `perf‑log.md` | Any dev | File created |
| **M** | `EXPLAIN ANALYZE` on `mc_stats_1min` (limit 10 k) | Data Eng | ≤ 40 ms |
| **A** | Log results + heap stats to `perf‑log.md` | Data Eng | First log entry |
| **D** | If latency > 40 ms: choose **re‑index** or **refresh‑rate tweak** | API Dev + Data Eng | Decision noted |

---

## Day 2 (Tuesday)

| Phase | Critical Checkpoint (must not slip) | Swarm if Blocked | Risk → Mitigation |
|-------|--------------------------------------|------------------|-------------------|
| **B** | Full OpenAPI spec & MSW mocks | API Dev ⇆ FE Lead | Schema drift → 17:00 schema‑freeze |
| **M** | BullMQ worker ≤ 50 ms/scenario | BE Lead ⇆ Data Eng | GC spikes → lower `--max‑old‑space‑size` & batch |
| **A** | Continuous agg `mc_stats_1min` live | Data Eng ⇆ DevOps | Refresh > 1 min → smoke‑test (`day2‑enhancement`) |
| **D** | Choose alert thresholds | DevOps | Bad alarms → baseline from `perf‑log.md` |

---

## Day 3 (Wednesday)

| Phase | Critical Checkpoint | Swarm if Blocked | Risk → Mitigation |
|-------|---------------------|------------------|-------------------|
| **B** | Worker + memory guards | BE Lead ⇆ Data Eng | Heap > 100 MB → AM/PM split (`day3‑restructure`) |
| **M** | Chart 10 k pts < 100 ms | FE Lead ⇆ QA | Jank → virtualize & throttle |
| **A** | Express route skeleton | API Dev | Params missing → generate types |
| **D** | Pick compression settings (10:1) | Data Eng | Low ratio → swap to ZSTD |

---

## Day 4 (Thursday)

| Phase | Critical Checkpoint | Swarm if Blocked | Risk → Mitigation |
|-------|---------------------|------------------|-------------------|
| **B** | `POST /simulate` with validation | API Dev | I/O stall → queue back‑pressure |
| | `GET /status` (5‑min TTL) | API Dev ⇆ DevOps | Redis issues → in‑proc LRU fallback |
| **M** | k6 saturation script (500 rps) | QA | SLA breach → noon dry‑run |
| **A** | KDE overlay added | FE Lead | Perf drop → WebGL + debounced resize |
| **D** | Decide S3 export timing | Data Eng + FE | — |

---

## Critical‑Path Slack

| Window | Duration | Recommended Use |
|--------|----------|-----------------|
| Day 5 PM | 2 h | Spike NATS throughput (progress events 100 ms @ 500 rps) |
| Day 10 PM | 2 h | Tune `pg_cron` + Parquet S3 writer |
| Day 14 | 8 h | Polish dashboards, record fallback demo |

---

## Guard‑Rails (≤ 50 ms / Scenario)

1. **Heap Ceiling** – abort worker if heap > 100 MB (snapshot logged).  
2. **Profiling Gate** – every 1 k scenarios: log p95 latency, GC, RSS; CI fails if p95 > 45 ms.  
3. **Chunked Batching** – run simulations in 250‑scenario batches, idle 10 ms between batches.

---

*End of project brief*