# Worker Prod Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make async reserve-allocation scenarios actually compute in prod by running the `fund-scenario-calc` worker as a dedicated Railway service and enabling the Vercel producer.

**Architecture:** Topology B from the approved spec (`docs/superpowers/specs/2026-06-11-worker-prod-ops-design.md`). One repo change (a `railway.worker.toml` service config, dispatched via Hermes) plus owner-confirmed prod configuration: a new Railway service running the `Dockerfile.worker` image from PR #823, then `ENABLE_QUEUES=1` on Vercel. Worker comes up first; producer flips second, so no job is ever enqueued without a worker to drain it.

**Tech Stack:** Railway config-as-code (TOML), Docker (`Dockerfile.worker`), BullMQ + Redis, Vercel env config, Hermes orchestration (`orchestrate.js`).

---

## Context for a zero-context engineer

- Prod API = Vercel serverless. It cannot host a persistent BullMQ worker.
- The old Railway deployment is GONE (`updog-fund-platform.up.railway.app` → 404, verified 2026-06-11). You are creating a new service, not editing one.
- Producer gate: `server/services/fund-scenario-calc-queue-service.ts:44` throws 503 unless `server/config/features.ts:getQueueConfig()` sees `ENABLE_QUEUES=1` AND a non-`memory://` `QUEUE_REDIS_URL`/`REDIS_URL`.
- Worker entrypoint: `workers/fund-scenario-calc-worker.ts` (bundled to `dist/workers/fund-scenario-calc-worker.js` by `npm run build:workers`). Health server (`workers/health-server.ts`) serves `/health`, `/live`, `/ready`, `/metrics` on `WORKER_HEALTH_PORT` (image default 9000; Railway runtime vars override image ENV).
- This repo's workflow contract: code edits are dispatched via Hermes (`npm run hermes:production -- --task "..."`). Hermes postflight only runs `npm run check` — you run lint yourself afterwards.
- Prod-touching steps (Railway dashboard, Vercel env) require explicit owner confirmation before applying. Tasks 2-4 are interactive ops, not code.

---

### Task 1: Add `railway.worker.toml` (Hermes-dispatched)

**Files:**
- Create: `railway.worker.toml`
- Reference (do not modify): `railway.toml`, `Dockerfile.worker`

- [x] **Step 1: Write the Hermes task prompt to a temp file**

Write this exact content to `C:\Users\nikhi\AppData\Local\Temp\hermes-railway-worker.txt` (single file, full prompt):

```text
Create a new file railway.worker.toml at the repo root. Do not modify any other file. Exact content:

# Railway config for the dedicated fund-scenario-calc worker service.
# In the Railway dashboard, set this service's "Config-as-code" file path to
# railway.worker.toml so it does not pick up the API config in railway.toml.
#
# Required service variables (set in the Railway dashboard, never committed):
#   NODE_ENV=production
#   ENABLE_QUEUES=1
#   REDIS_URL=<same prod Redis as the Vercel API>
#   DATABASE_URL=<same prod Postgres as the Vercel API>
#   WORKER_HEALTH_PORT=${{PORT}}   # maps Railway's injected PORT onto the worker health server

[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile.worker"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "always"

After creating the file, run npm run check and confirm it passes.
```

- [x] **Step 2: Dry-run the routing to confirm no financial-specialist promotion**

Run (git-bash):
```bash
task=$(cat /c/Users/nikhi/AppData/Local/Temp/hermes-railway-worker.txt)
node orchestrate.js --dry-run --phase production --task "$task"
```
Expected: routing plan JSON shows `phase: production` (NOT `production-financial`), gate `npm run check`, no specialist assigned. If a financial specialist scores in, reword the prompt (the file content itself contains no financial keywords; "fund-scenario-calc" does not match any specialist keyword list in `.claude/hermes/model-routing.json`).

- [x] **Step 3: Dispatch live via Hermes**

```bash
task=$(cat /c/Users/nikhi/AppData/Local/Temp/hermes-railway-worker.txt)
npm run hermes:production -- --task "$task" --live
```
Expected: codex creates `railway.worker.toml`; Hermes postflight `npm run check` passes (exit 0). If the Hermes/codex lane fails twice, fall back to a direct Write of the same content and note the fallback in the commit body.

- [x] **Step 4: Verify the file and run lint yourself (Hermes does not)**

```bash
git diff --stat && git status --short
npm run lint
```
Expected: only `railway.worker.toml` added; lint zero warnings. Confirm the file content matches Step 1 exactly (codex sometimes normalizes comments — exact match required for the `${{PORT}}` template syntax, which is Railway template syntax, not shell).

- [x] **Step 5: Commit and push**

```bash
git add railway.worker.toml
git commit -m "feat(deploy): railway config for dedicated fund-scenario-calc worker service"
git push origin main
git ls-remote origin main   # verify the push landed (never trust piped push output)
```

---

### Task 2: Create the Railway worker service (prod mutation — owner confirms each step)

**Files:** none (Railway dashboard / CLI ops)

- [x] **Step 1: Check for an authenticated Railway CLI**

```bash
npx -y @railway/cli whoami
```
Expected: either a logged-in account (CLI path available) or an auth error (dashboard path; the owner performs the clicks while you supply exact values). If the owner's Railway account/plan is unusable, STOP and surface fallback options A/C from the spec.

- [x] **Step 2: Create project + service from the GitHub repo**

Dashboard path (owner): New Project → Deploy from GitHub repo → `nikhillinit/Updog_restore`. Name the service `fund-scenario-calc-worker`. Before the first deploy finishes, open Service → Settings → Config-as-code and set the file path to `railway.worker.toml` (otherwise Railway uses `railway.toml` and deploys the API image).

- [x] **Step 3: Set service variables**

Service → Variables (values for `REDIS_URL`/`DATABASE_URL` copied by the owner from the Vercel project's production env — do not paste secrets into the chat):

```text
NODE_ENV=production
ENABLE_QUEUES=1
REDIS_URL=<prod Redis URL>
DATABASE_URL=<prod Postgres URL>
WORKER_HEALTH_PORT=${{PORT}}
```

- [x] **Step 4: Deploy and verify health**

Trigger a deploy (variables change usually redeploys automatically). Watch deploy logs for:
- `npm run build:workers` emitting `dist/workers/fund-scenario-calc-worker.js`
- startup log `Worker health server listening on port <PORT>`
- Railway healthcheck passing (service shows green/healthy)

If the healthcheck loops: check logs for the queue-connection error string (`Fund scenario calculation queue Redis connection is not configured`) → variables wrong; or TLS errors → `REDIS_URL` may need `rediss://`.

Expected: service healthy and stable for at least one healthcheck interval.

---

### Task 3: Enable the Vercel producer (prod mutation — owner confirms)

**Files:** none (Vercel env ops). Do NOT do this before Task 2 is green.

- [x] **Step 1: Verify current producer state (read-only)**

Owner checks the Vercel project → Settings → Environment Variables (production): confirm `REDIS_URL` exists and is a real `redis(s)://` URL (not `memory://`), and whether `ENABLE_QUEUES` is set. Do not pull the full env (`vercel env pull` is blocked policy — it dumps all secrets).

- [x] **Step 2: Set `ENABLE_QUEUES=1` (production) and redeploy**

Dashboard: add `ENABLE_QUEUES=1` to Production env, then redeploy the latest production deployment (env changes do not apply to existing deployments).

Expected: new production deployment ready; `/api/health` still healthy (the `fund-scenario-calc` registry entry stays `healthMode: 'producer'`, so no degraded regression).

---

### Task 4: Live end-to-end verification

**Files:** none

- [x] **Step 1: Fire a real reserve-scenario calculation in prod**

Owner (authenticated GP session) opens the scenario workspace for a real fund and triggers reserve calculation, or curls:

```bash
curl -i -X POST "https://<prod-host>/api/funds/<fundId>/scenario-sets/<scenarioSetId>/calculate-reserve" -H "Authorization: Bearer <token>"
```
Expected: HTTP 202 with a job descriptor (NOT 503 `scenario_calculation_queue_unavailable`).

- [x] **Step 2: Confirm the job drains**

Watch the workspace status transition `queued → calculating → succeeded` and results render. Cross-check Railway worker logs for the job id (`reserve-scenario-<fundId>-<scenarioSetId>-...`) being processed.

Expected: succeeded with visible results. If it sticks at `queued`: worker and producer are not sharing the same Redis — re-compare `REDIS_URL` on both hosts.

- [x] **Step 3: Acceptance check against the spec**

All three spec acceptance criteria hold: worker `/health` healthy, prod job `queued → succeeded`, Vercel `/api/health` unchanged.

---

### Task 5: Record the outcome

**Files:**
- Modify: `CHANGELOG.md` (one entry)
- Modify: `.remember/NEXT-SESSION-TASKS.md` (mark Task 1 done; Task 3 healthMode flip stays deferred)

- [x] **Step 1: Add CHANGELOG entry**

Add under the current date, following the file's existing entry format:

```markdown
- feat(deploy): dedicated `fund-scenario-calc` worker service on Railway
  (`railway.worker.toml` + Dockerfile.worker image); Vercel producer enabled
  with `ENABLE_QUEUES=1`. Reserve-allocation scenarios now compute in prod.
```

- [x] **Step 2: Update the handoff and commit**

In `.remember/NEXT-SESSION-TASKS.md`, mark TASK 1 resolved (note the chosen option (a): dedicated worker service) and leave TASK 3 (healthMode flip) open with its per-host-semantics caveat.

```bash
git add CHANGELOG.md .remember/NEXT-SESSION-TASKS.md
git commit -m "docs: record fund-scenario-calc prod worker deployment"
git push origin main && git ls-remote origin main
```

---

## Rollback

- Producer: remove `ENABLE_QUEUES` from Vercel production env + redeploy → enqueue returns 503 again (pre-existing behavior, UI already handles it).
- Worker: stop/delete the Railway service. Queued jobs have 2 attempts with exponential backoff and 24h failure retention; nothing is lost silently.
- Repo: `railway.worker.toml` is inert without a Railway service pointing at it; reverting the commit is optional.
