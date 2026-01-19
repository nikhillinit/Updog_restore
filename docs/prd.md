---
status: ACTIVE
last_updated: 2026-01-19
---

prd.md

# POVC Fund-Modeling Platform – Product Requirements Document (PRD)

---

## 1  Goals & Background Context

### 1.1 Goals
- Provide lean VC teams with **time-travel fund analytics** (snapshot & rollback) for decision retrospection.  
- Deliver a **Monte-Carlo risk engine with interactive UI** for real-time scenario exploration.  
- Enable **Construction vs Current variance tracking** to surface strategy drift and remaining-capital guidance.  
- Maintain an **OSS-first stack** that can flip to managed services via Terraform flags when scale or compliance demands.  
- Achieve **LP-ready reporting** with AI-generated insights while keeping infra cost < $200 / mo through LP-beta.  

### 1.2 Background Context
Press On Ventures’ existing “Updawg” platform already supports core fund modeling and reserve pacing. User interviews (12 solo GPs + internal IC) exposed gaps in historical replay, probabilistic risk assessment, and audit trails.  
The new roadmap is organised into gated increments (**G1 – G5**), each shipping user-visible value every 2–3 weeks.

### 1.3 Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-07-23 | 2.1 | Aligned with Press On Ventures brand guideline (logo, fonts, colours) | N. Bhambi |

---

## 2  Requirements

### 2.1 Functional
1. **FR1** – Capture point-in-time fund snapshots and restore within < 2 s (5-year history).  
2. **FR2** – Toggle between “Construction” and “Current” models with p95 latency < 500 ms.  
3. **FR3** – Run ≥ 10 k Monte-Carlo sims and stream 5th/50th/95th percentiles at ≥ 60 fps.  
4. **FR4** – Support ≥ 5 concurrent editors with conflict-free comments & audit trails.  
5. **FR5** – Expose read-only LP data and webhook events via public REST v1 + SDK.  
6. **FR6** – Scenario recommendation engine precision ≥ 75 % (labelled outcomes).  

### 2.2 Non-Functional
1. **NFR1** – Uptime ≥ 99.9 % (rolling 7-day, SigNoz-monitored).  
2. **NFR2** – Combined unit + integration test coverage ≥ 80 %.  
3. **NFR3** – Cloud spend ≤ US $200/mo until Gate G3.  
4. **NFR4** – AES-256 at-rest encryption for snapshots & logs.  
5. **NFR5** – Feature-flags enable zero-downtime swap from OSS → managed services.

---

## 3  User-Interface Design Goals

| Item | Canonical Guideline Reference |
|------|------------------------------|
| **Logo usage** | Use the full _PRESS ON VENTURES_ lock-up or standalone power-icon only. Do **not** alter proportions, tilt, recolour, stretch, outline, or add shadows :contentReference[oaicite:9]{index=9} |
| **Safe-zone** | Maintain clear-space equal to the icon width around the logo; the icon alone needs ½-icon clear-space :contentReference[oaicite:10]{index=10} |
| **Fonts** | **Headings:** **Inter Bold**; **Subheads & body:** **Poppins Regular/Medium** :contentReference[oaicite:11]{index=11} |
| **Colour palette** | - Light grey `#F2F2F2`  <br>- White `#FFFFFF`  <br>- Warm beige `#E0D8D1`  <br>- Charcoal `#292929`  + brand gradient :contentReference[oaicite:12]{index=12} |
| **Accessibility** | WCAG AA contrast maintained against brand colours. |

### 3.1 Overall UX Vision
Dark-first, analyst-oriented workspace that feels like a trading terminal: keyboard shortcuts, real-time charts, and a history slider.

### 3.2 Key Interaction Paradigms
- **Time-Machine Slider** – scrub historical timeline (red-alert banner when not “now”).  
- **Scenario Sliders** – adjust distributions and watch charts animate.  
- **Drift Heat-Map** – cell-coded matrix showing construction vs current deviations.  

### 3.3 Core Screens
1. Login & MFA  
2. Fund Dashboard  
3. Monte-Carlo Studio  
4. Time-Machine Playback  
5. Audit & Comment Panel  

---

## 4  Technical Assumptions

| Aspect | Decision |
|--------|----------|
| **Repository** | Nx monorepo (TS + Rust + docs). |
| **Architecture** | Micro-services in single K8s cluster (Fastify APIs, Rust WASM sim, NATS bus). |
| **Testing** | Full pyramid: unit, integration, Playwright e2e; k6 perf gating. |
| **Feature-flags** | Terraform vars `use_managed_pg`, `use_confluent`, `use_pinecone`. |
| **Observability** | SigNoz OSS; Prometheus metrics emitted from `/api/health`. |
| **Brand Assets** | SVG logo & icon from design team; never modified per “Logo don’t” list :contentReference[oaicite:13]{index=13} |

---

## 5  Epic Roadmap (Gate-based)

| # | Epic | Gate | Outcome / Exit Criteria |
|---|------|------|-------------------------|
| 1 | **Platform Hardening** | **G1** | Postgres schema, Vault, SigNoz, auth, ≥ 80 % tests |
| 2 | **Snapshot & Toggle** | **G2A** | Time-Machine Lite + Construction/Current switch |
| 3 | **Monte-Carlo UI** | **G2B** | Interactive sliders, confidence bands, undo/redo |
| 4 | **Drift & Stress Alpha** | **G2C** | Drift heat-map + 3 stress scenarios |
| 5 | **Multi-user & Audit** | **G3** | Comments, audit overlays, Mailrise alerts |
| 6 | **API & Banking Sync** | **G4** | Public REST v1, Plaid sandbox feed, webhook relay |
| 7 | **Insight Engine** | **G5** | AI scenario recommendations, ≥ 75 % precision |

---

## 6  Next Steps

1. **Approve** branding alignment (logo safe-zone, colour palette, Inter/Poppins usage).  
2. Merge this `prd.md` into `docs/` branch.  
3. Kick off BMAD task **`epic-1-g1-platform-hardening`** to begin Gate G1 work.  

---
