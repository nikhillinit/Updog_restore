# Surface Contract Matrix

Phase: **authoring**
Schema: **1.0.0**
Provenance: git **d030a803bcb52da567a34a6282a51de3991bb7d2**, KG snapshot **snapshot:dfedfb0c775e750a70fcf33b03ddf50b9515891e43a5a4835eac73c970b7db8f**

## Contract rows

### allocation-scenarios

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/allocation-scenarios | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:409; server/routes/allocation-scenarios.ts:70 |
| api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:422; server/routes/allocation-scenarios.ts:70 |
| api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:448; server/routes/allocation-scenarios.ts:70 |
| api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:435; server/routes/allocation-scenarios.ts:70 |
| api:PATCH:/api/funds/:fundId/allocation-scenarios/:scenarioId | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:513; server/routes/allocation-scenarios.ts:70 |
| api:PATCH:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions/:decisionId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:537; server/routes/allocation-scenarios.ts:70 |
| api:POST:/api/funds/:fundId/allocation-scenarios | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:461; server/routes/allocation-scenarios.ts:70 |
| api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/apply | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:593; server/routes/allocation-scenarios.ts:70 |
| api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:485; server/routes/allocation-scenarios.ts:70 |
| api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/sync | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/allocation-scenarios.ts:566; server/routes/allocation-scenarios.ts:70 |

### allocations

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/allocations/latest | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocations.ts:876 |
| api:GET:/api/funds/:fundId/companies | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocations.ts:602 |
| api:POST:/api/funds/:fundId/allocations | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/allocations.ts:1051 |

### artifact-retention

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scheduler:artifact-retention | scheduler | railway / none | system | platform | keep-and-prove | proposed | server/routes.ts:44 |

### auth

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/auth/csrf | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/auth.ts:66 |
| api:GET:/api/auth/session | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/auth.ts:143 |
| api:POST:/api/auth/login | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/auth.ts:102 |
| api:POST:/api/auth/logout | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/auth.ts:161 |

### backtesting

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/backtesting/fund/:fundId/history | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:457 |
| api:GET:/api/backtesting/jobs/:jobId | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:302 |
| api:GET:/api/backtesting/jobs/:jobId/stream | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:369 |
| api:GET:/api/backtesting/result/:backtestId | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:522 |
| api:GET:/api/backtesting/scenarios | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:656 |
| api:POST:/api/backtesting/compare-scenarios | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:595 |
| api:POST:/api/backtesting/run | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:191 |
| api:POST:/api/backtesting/run/async | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/backtesting.ts:236 |
| worker:backtesting-jobs | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/backtesting-queue.ts:299; server/queues/backtesting-queue.ts:310; server/queues/registry.ts:backtesting |

### calc-run-completion

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| event:calc-run-completion | event-handler | railway / none | system | analytics | keep-and-prove | proposed | server/routes.ts:40 |

### capital-allocation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/capital-allocation/calculate | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/capital-allocation.ts:78 |
| api:POST:/api/capital-allocation/validate | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/capital-allocation.ts:104 |

### capital-call-status

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:capital-call-status | worker-job | dormant / none | system | gp-team | keep-and-prove | proposed | server/workers/capital-call-status-worker.ts:106; server/workers/capital-call-status-worker.ts:119 |

### cash-flow-events

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/cash-flow-events | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cash-flow-events.ts:178 |
| api:PATCH:/api/funds/:fundId/cash-flow-events/:eventId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cash-flow-events.ts:196 |
| api:POST:/api/funds/:fundId/cash-flow-events | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cash-flow-events.ts:148 |
| api:POST:/api/funds/:fundId/cash-flow-events/:eventId/approve | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cash-flow-events.ts:281 |
| api:POST:/api/funds/:fundId/cash-flow-events/:eventId/lock | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cash-flow-events.ts:296 |

### client-router

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| client:/ | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-router.tsx:136 |
| client:/admin/ui-catalog | client-route | client / client | admin | platform | in-contract | proposed | client/src/app/app-router.tsx:151 |
| client:/analytics-legacy | client-route | client / client | gp | gp-team | keep-and-prove | proposed | client/src/app/app-router.tsx:139 |
| client:/dashboard | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:84 |
| client:/financial-modeling | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:89 |
| client:/forecasting | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:88 |
| client:/fund-model-results/:fundId | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:96 |
| client:/fund-model-results/:fundId/analysis | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:95 |
| client:/fund-model-results/:fundId/internal-analysis | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:94 |
| client:/fund-model-results/:fundId/moic-analysis | client-route | client / client | gp | analytics | in-contract | proposed | client/src/app/app-routes.tsx:92 |
| client:/fund-model-results/:fundId/reports | client-route | client / client | gp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:93 |
| client:/fund-model-results/:fundId/scenarios | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:91 |
| client:/fund-setup | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:83 |
| client:/help | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:106 |
| client:/investments | client-route | client / client | gp | gp-team | in-contract | proposed | shared/routes/app-route-definitions.ts:64 |
| client:/kpi-manager | client-route | client / client | gp | gp-team | in-contract | proposed | shared/routes/app-route-definitions.ts:54 |
| client:/kpi-submission | client-route | client / client | gp | gp-team | in-contract | proposed | shared/routes/app-route-definitions.ts:59 |
| client:/login | client-route | client / client | public | gp-team | in-contract | proposed | client/src/app/app-router.tsx:177 |
| client:/lp | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-router.tsx:146 |
| client:/lp-reporting/imports | client-route | client / client | gp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:104 |
| client:/lp-reporting/ledger | client-route | client / client | gp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:101 |
| client:/lp-reporting/metrics | client-route | client / client | gp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:103 |
| client:/lp-reporting/valuations | client-route | client / client | gp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:102 |
| client:/lp/capital-account | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:124 |
| client:/lp/dashboard | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:122 |
| client:/lp/fund-detail/:fundId | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:123 |
| client:/lp/performance | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:125 |
| client:/lp/reports | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:126 |
| client:/lp/settings | client-route | client / client | lp | lp-reporting | in-contract | proposed | client/src/app/app-routes.tsx:127 |
| client:/model-results | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:90 |
| client:/moic-analysis | client-route | client / client | gp | gp-team | in-contract | proposed | shared/routes/app-route-definitions.ts:48 |
| client:/performance | client-route | client / client | gp | analytics | in-contract | proposed | client/src/app/app-routes.tsx:87 |
| client:/pipeline | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:100 |
| client:/planning | client-route | client / client | gp | gp-team | in-contract | proposed | shared/routes/app-route-definitions.ts:42 |
| client:/planning-legacy | client-route | client / client | gp | gp-team | keep-and-prove | proposed | client/src/app/app-router.tsx:142 |
| client:/portal/:rest* | client-route | client / client | public | lp-reporting | in-contract | proposed | client/src/app/app-router.tsx:179 |
| client:/portfolio | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:86 |
| client:/portfolio/company/:id | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:85 |
| client:/reports | client-route | client / client | gp | reporting | in-contract | proposed | client/src/app/app-routes.tsx:98 |
| client:/sensitivity-analysis | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:97 |
| client:/settings | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:105 |
| client:/shared/:shareId | client-route | client / client | public | lp-reporting | in-contract | proposed | client/src/app/app-router.tsx:178 |
| client:/variance-tracking | client-route | client / client | gp | gp-team | in-contract | proposed | client/src/app/app-routes.tsx:99 |

### cohort-analysis

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/cohorts/definitions | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:509 |
| api:GET:/api/cohorts/unmapped | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:298 |
| api:POST:/api/cohorts/analyze | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:96 |
| api:POST:/api/cohorts/definitions | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:569 |
| api:POST:/api/cohorts/sector-mappings | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:404 |
| api:POST:/api/cohorts/seed | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/cohort-analysis.ts:640 |

### cohort-calc

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:cohort-calc | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/registry.ts:cohort-calc; server/routes/fund-config.ts:31; workers/cohort-worker.ts:49 |

### current-forecast

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/current-plan-versions | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/current-forecast.ts:185 |
| api:POST:/api/admin/funds/:fundId/calculation-modes/current-forecast/resume | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/current-forecast.ts:353 |
| api:POST:/api/admin/funds/:fundId/current-forecast/activate | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/current-forecast.ts:456 |
| api:POST:/api/admin/funds/:fundId/current-forecast/references | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/current-forecast.ts:410 |
| api:POST:/api/funds/:fundId/current-forecast/runs | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/current-forecast.ts:240 |
| api:POST:/api/funds/:fundId/current-plan-versions | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/current-forecast.ts:200 |
| api:PUT:/api/admin/funds/:fundId/calculation-modes/current-forecast | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/current-forecast.ts:276 |

### dashboard-summary

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/dashboard-summary/:fundId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/dashboard-summary.ts:23 |

### deal-pipeline

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/deals/opportunities/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:239 |
| api:GET:/api/deals/:id/diligence | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:409 |
| api:GET:/api/deals/opportunities | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:96 |
| api:GET:/api/deals/opportunities/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:160 |
| api:GET:/api/deals/pipeline | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:315 |
| api:GET:/api/deals/stages | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:348 |
| api:POST:/api/deals/:id/diligence | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:368 |
| api:POST:/api/deals/:id/stage | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:272 |
| api:POST:/api/deals/opportunities | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:55 |
| api:POST:/api/deals/opportunities/bulk/archive | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:564 |
| api:POST:/api/deals/opportunities/bulk/status | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:535 |
| api:POST:/api/deals/opportunities/import | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:497 |
| api:POST:/api/deals/opportunities/import/preview | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:443 |
| api:PUT:/api/deals/opportunities/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/deal-pipeline.ts:193 |

### dormant-ui

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dormant:client/src/components/investments/portfolio-company-detail.tsx | dormant-ui | dormant / none | unknown | unassigned | remove-with-approval | proposed | client/src/components/investments/portfolio-company-detail.tsx |
| dormant:client/src/pages/v2/cash.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/cash.tsx |
| dormant:client/src/pages/v2/company.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/company.tsx |
| dormant:client/src/pages/v2/exits.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/exits.tsx |
| dormant:client/src/pages/v2/insights.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/insights.tsx |
| dormant:client/src/pages/v2/partners.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/partners.tsx |
| dormant:client/src/pages/v2/portfolio.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/portfolio.tsx |
| dormant:client/src/pages/v2/scenarios.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/scenarios.tsx |
| dormant:client/src/pages/v2/today.tsx | dormant-ui | dormant / none | unknown | unassigned | quarantined | proposed | client/src/pages/v2/today.tsx |

### dual-forecast

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/dual-forecast | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/dual-forecast.ts:28 |

### economics-calc

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:economics-calc | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/registry.ts:economics-calc |

### error-tracking

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:error-tracking | worker-job | dormant / none | system | platform | keep-and-prove | proposed | server/middleware/asyncErrorHandler.ts:15 |

### financial-facts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/financial-facts/latest | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/financial-facts.ts:105 |
| api:POST:/api/admin/funds/:fundId/financial-facts/snapshots | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/financial-facts.ts:128 |

### flags

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/flags/admin/kill-switch | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:171; server/routes/flags.ts:181; server/routes/flags.ts:182; server/routes/flags.ts:346 |
| api:GET:/api/flags | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:54 |
| api:GET:/api/flags/admin | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:171; server/routes/flags.ts:181; server/routes/flags.ts:182; server/routes/flags.ts:187 |
| api:GET:/api/flags/admin/:key/history | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:171; server/routes/flags.ts:181; server/routes/flags.ts:182; server/routes/flags.ts:305 |
| api:GET:/api/flags/status | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:118 |
| api:PATCH:/api/flags/admin/:key | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:171; server/routes/flags.ts:181; server/routes/flags.ts:182; server/routes/flags.ts:209 |
| api:POST:/api/flags/admin/kill-switch | http-api | vercel / vercel | unknown | platform | in-contract | proposed | server/routes/flags.ts:171; server/routes/flags.ts:181; server/routes/flags.ts:182; server/routes/flags.ts:327 |

### fund-actuals

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/actuals/facts | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/fund-actuals.ts:34 |

### fund-config

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:id/draft | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:278 |
| api:GET:/api/funds/:id/lifecycle-history | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:515 |
| api:GET:/api/funds/:id/reserves | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:415 |
| api:GET:/api/funds/:id/results | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:495 |
| api:GET:/api/funds/:id/results-comparison | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:549 |
| api:GET:/api/funds/:id/state | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-config.ts:465 |
| api:POST:/api/funds/:id/publish | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/fund-config.ts:311 |
| api:POST:/api/funds/:id/recalculate | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/fund-config.ts:363 |
| api:POST:/api/funds/finalize | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/fund-config.ts:99 |
| api:PUT:/api/funds/:id/draft | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/fund-config.ts:151 |

### fund-metrics

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/metrics | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/fund-metrics.ts:72 |
| api:POST:/api/funds/:fundId/metrics/invalidate | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/fund-metrics.ts:162 |

### fund-moic

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/moic/marginal-rankings | http-api | vercel / vercel | admin, gp | analytics | in-contract | proposed | server/routes/fund-moic.ts:277 |
| api:GET:/api/funds/:fundId/moic/rankings | http-api | vercel / vercel | admin, gp | analytics | in-contract | proposed | server/routes/fund-moic.ts:359 |
| api:GET:/api/funds/:fundId/moic/reserve-intelligence/latest | http-api | vercel / vercel | admin, gp | analytics | in-contract | proposed | server/routes/fund-moic.ts:228 |
| api:GET:/api/funds/:fundId/moic/reserve-intelligence/runs/:snapshotId | http-api | vercel / vercel | admin, gp | analytics | in-contract | proposed | server/routes/fund-moic.ts:249 |
| api:POST:/api/admin/funds/:fundId/moic/reconciliations | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/fund-moic.ts:485 |
| api:POST:/api/funds/:fundId/moic/reserve-intelligence/runs | http-api | vercel / vercel | admin, gp | analytics | in-contract | proposed | server/routes/fund-moic.ts:181 |
| api:PUT:/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/fund-moic.ts:615 |
| api:PUT:/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId | http-api | vercel / vercel | admin | analytics | in-contract | proposed | server/routes/fund-moic.ts:534 |

### fund-scenario-calc

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:fund-scenario-calc | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/fund-scenario-calc-worker-init.ts:50; server/queues/registry.ts:fund-scenario-calc; server/services/fund-scenario-calc-queue-service.ts:29; workers/fund-scenario-calc-worker.ts:51 |

### fund-scenario-sets

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/scenario-sets | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:148 |
| api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:165 |
| api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:282 |
| api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/comparison | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:299 |
| api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/results | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:316 |
| api:POST:/api/funds/:fundId/scenario-sets | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:182 |
| api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/archive | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:339 |
| api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculate | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:235 |
| api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:253 |
| api:POST:/api/funds/:fundId/scenario-sets/reserve-optimization | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/fund-scenario-sets.ts:207 |

### funds

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/funds.ts:155 |
| api:GET:/api/funds/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/funds.ts:168 |
| api:POST:/api/funds | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/funds.ts:208 |
| api:POST:/api/funds/calculate | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/funds.ts:249 |

### graduation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/graduation/defaults | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/graduation.ts:75 |
| api:POST:/api/graduation/project | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/graduation.ts:30 |

### internal-analysis

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/internal-analysis/drafts | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:249 |
| api:GET:/api/funds/:fundId/internal-analysis/drafts/:draftId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:262 |
| api:GET:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:288 |
| api:GET:/api/funds/:fundId/internal-analysis/narratives | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:801 |
| api:GET:/api/funds/:fundId/internal-analysis/notes | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:910 |
| api:GET:/api/funds/:fundId/internal-analysis/references | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:596 |
| api:GET:/api/funds/:fundId/internal-analysis/references/:referenceId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:617 |
| api:PATCH:/api/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:452 |
| api:PATCH:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/items/:category | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:312 |
| api:POST:/api/admin/funds/:fundId/internal-analysis/quarterly-draft-run | http-api | vercel / vercel | admin | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:685 |
| api:POST:/api/funds/:fundId/internal-analysis/drafts | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:409 |
| api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/waiver | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:364 |
| api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/refresh | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:516 |
| api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/save | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:551 |
| api:POST:/api/funds/:fundId/internal-analysis/narratives/generate | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:829 |
| api:POST:/api/funds/:fundId/internal-analysis/narratives/revise | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:869 |
| api:POST:/api/funds/:fundId/internal-analysis/notes | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:933 |
| api:POST:/api/funds/:fundId/internal-analysis/references/:referenceId/drafts | http-api | vercel / vercel | admin, analyst, gp | gp-team | in-contract | proposed | server/routes/internal-analysis.ts:648 |

### internal-analysis-checkpoint

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scheduler:internal-analysis-checkpoint | scheduler | railway / none | system | analytics | keep-and-prove | proposed | server/routes.ts:46 |

### internal-economics

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/internal-economics/runs/:runId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-economics.ts:182 |
| api:POST:/api/funds/:fundId/internal-economics/runs | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/internal-economics.ts:143 |

### investment-ledger

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/investment-ledger/financing-events/:eventId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:564 |
| api:GET:/api/funds/:fundId/investment-ledger/ownership-snapshots | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:422 |
| api:GET:/api/funds/:fundId/investment-ledger/position-valuations | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:471 |
| api:GET:/api/funds/:fundId/investment-ledger/positions | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:374 |
| api:POST:/api/funds/:fundId/investment-ledger/financing-events | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:261 |
| api:POST:/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:282 |
| api:POST:/api/funds/:fundId/investment-ledger/ownership-snapshots | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:450 |
| api:POST:/api/funds/:fundId/investment-ledger/position-conversions | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:517 |
| api:POST:/api/funds/:fundId/investment-ledger/position-corrections | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:538 |
| api:POST:/api/funds/:fundId/investment-ledger/position-events | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:401 |
| api:POST:/api/funds/:fundId/investment-ledger/position-valuations | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:496 |
| api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:305 |
| api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:351 |
| api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/investment-ledger.ts:328 |

### investments

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/investments | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:35 |
| api:GET:/api/investments/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:81 |
| api:GET:/api/investments/:id/rounds | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:360 |
| api:GET:/api/investments/:id/rounds/:roundId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:386 |
| api:POST:/api/investments | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:131 |
| api:POST:/api/investments/:id/cases | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:425 |
| api:POST:/api/investments/:id/rounds | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/investments.ts:287 |

### kpi-observations

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/kpi-observations | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/kpi-observations.ts:153 |
| api:GET:/api/funds/:fundId/kpi-observations/:observationId | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/kpi-observations.ts:181 |
| api:PATCH:/api/funds/:fundId/kpi-observations/:observationId/review | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/kpi-observations.ts:330 |
| api:POST:/api/funds/:fundId/kpi-observations | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/kpi-observations.ts:209 |
| api:POST:/api/funds/:fundId/kpi-observations/imports | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/kpi-observations.ts:254 |

### liquidity

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/liquidity/analyze | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/liquidity.ts:97 |
| api:POST:/api/liquidity/forecast | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/liquidity.ts:113 |
| api:POST:/api/liquidity/optimize-calls | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/liquidity.ts:159 |
| api:POST:/api/liquidity/stress-test | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/liquidity.ts:135 |

### lp-api

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/capital-account | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:236; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/funds/:fundId/detail | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:380; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/funds/:fundId/holdings | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:488; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/performance | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:552; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/performance/benchmark | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:66; server/routes/lp-api.ts:664; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/profile | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:107; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/reports | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:66; server/routes/lp-api.ts:67; server/routes/lp-api.ts:891 |
| api:GET:/api/lp/reports/:reportId | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:66; server/routes/lp-api.ts:67; server/routes/lp-api.ts:942 |
| api:GET:/api/lp/reports/:reportId/download | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:66; server/routes/lp-api.ts:67; server/routes/lp-api.ts:997 |
| api:GET:/api/lp/settings | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:1161; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:GET:/api/lp/summary | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:165; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |
| api:POST:/api/lp/reports/generate | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:66; server/routes/lp-api.ts:67; server/routes/lp-api.ts:759 |
| api:PUT:/api/lp/settings | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-api.ts:1220; server/routes/lp-api.ts:66; server/routes/lp-api.ts:67 |

### lp-capital-calls

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/capital-calls | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-capital-calls.ts:92 |
| api:GET:/api/lp/capital-calls/:callId | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-capital-calls.ts:245 |
| api:GET:/api/lp/capital-calls/:callId/wire-instructions | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-capital-calls.ts:392 |
| api:POST:/api/lp/capital-calls/:callId/payment | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-capital-calls.ts:495 |

### lp-distributions

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/distributions | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-distributions.ts:86 |
| api:GET:/api/lp/distributions/:distributionId | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-distributions.ts:522 |
| api:GET:/api/lp/distributions/summary | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-distributions.ts:242 |
| api:GET:/api/lp/distributions/tax-summary/:year | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-distributions.ts:364 |

### lp-documents

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/documents | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-documents.ts:112 |
| api:GET:/api/lp/documents/:documentId | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-documents.ts:363 |
| api:GET:/api/lp/documents/:documentId/download | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-documents.ts:475 |
| api:GET:/api/lp/documents/search | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-documents.ts:250 |

### lp-notifications

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/notifications | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:84 |
| api:GET:/api/lp/notifications/preferences | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:499 |
| api:GET:/api/lp/notifications/unread-count | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:236 |
| api:POST:/api/lp/notifications/:notificationId/read | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:296 |
| api:POST:/api/lp/notifications/read-all | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:403 |
| api:PUT:/api/lp/notifications/preferences | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/lp-notifications.ts:569 |

### lp-reporting-imports

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/imports/batches/:batchId | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:585 |
| api:GET:/api/funds/:fundId/reconciliation/cases | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:609 |
| api:POST:/api/funds/:fundId/imports/artifacts | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:404 |
| api:POST:/api/funds/:fundId/imports/batches | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:545 |
| api:POST:/api/funds/:fundId/imports/batches/:batchId/commit | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:701 |
| api:POST:/api/funds/:fundId/imports/ledger/commit | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:330 |
| api:POST:/api/funds/:fundId/imports/ledger/dry-run | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:256 |
| api:POST:/api/funds/:fundId/imports/mapping-profiles | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:479 |
| api:POST:/api/funds/:fundId/imports/valuation-marks/commit | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:367 |
| api:POST:/api/funds/:fundId/imports/valuation-marks/dry-run | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:293 |
| api:POST:/api/funds/:fundId/reconciliation/cases/:caseId/resolve | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:633 |
| api:POST:/api/funds/:fundId/reconciliation/cases/bulk-resolve | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/imports.ts:672 |

### lp-reporting-metric-runs

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:382 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/evidence-records | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:677 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:725 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:863 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:459 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:497 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:610 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:629 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:544 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:563 |
| api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:478 |
| api:GET:/api/funds/:fundId/metric-runs/latest | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:351 |
| api:PATCH:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:773 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/approve | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:401 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/evidence-records | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:696 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/lock | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:430 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:744 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:833 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:803 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:648 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:582 |
| api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:516 |
| api:POST:/api/funds/:fundId/metric-runs/commit | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:323 |
| api:POST:/api/funds/:fundId/metric-runs/dry-run | http-api | vercel / vercel | admin, gp | lp-reporting | in-contract | proposed | server/routes/lp-reporting/metric-runs.ts:296 |

### lp-view-refresh

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:lp-view-refresh | worker-job | dormant / none | system | lp-reporting | keep-and-prove | proposed | server/workers/lp-materialized-view-refresh.ts:100; server/workers/lp-materialized-view-refresh.ts:113 |

### ml-reserve

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| listener:ml-reserve:GET:/health | http-api | local / none | system | analytics | keep-and-prove | proposed | ml-service/app.py:187; ml-service/app.py:26; ml-service/app.py:427 |
| listener:ml-reserve:GET:/model/info | http-api | local / none | system | analytics | keep-and-prove | proposed | ml-service/app.py:409; ml-service/app.py:26; ml-service/app.py:427 |
| listener:ml-reserve:POST:/predict | http-api | local / none | system | analytics | keep-and-prove | proposed | ml-service/app.py:265; ml-service/app.py:26; ml-service/app.py:427 |
| listener:ml-reserve:POST:/train | http-api | local / none | system | analytics | keep-and-prove | proposed | ml-service/app.py:201; ml-service/app.py:26; ml-service/app.py:427 |

### operating-object-tasks

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/tasks | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/operating-object-tasks.ts:95 |
| api:GET:/api/funds/:fundId/tasks/:taskId/evidence-links | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/operating-object-tasks.ts:113 |
| api:PATCH:/api/funds/:fundId/tasks/:taskId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/operating-object-tasks.ts:214 |
| api:POST:/api/funds/:fundId/tasks | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/operating-object-tasks.ts:65 |
| api:POST:/api/funds/:fundId/tasks/:taskId/evidence-links | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/operating-object-tasks.ts:149 |

### pacing-calc

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:pacing-calc | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/registry.ts:pacing-calc; server/routes/fund-config.ts:29; workers/pacing-worker.ts:30 |

### performance-api

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/pacing-history | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/performance-api.ts:194 |
| api:GET:/api/funds/:fundId/performance/breakdown | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/performance-api.ts:374 |
| api:GET:/api/funds/:fundId/performance/comparison | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/performance-api.ts:506 |
| api:GET:/api/funds/:fundId/performance/metrics | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/performance-api.ts:130 |
| api:GET:/api/funds/:fundId/performance/timeseries | http-api | vercel / vercel | unknown | analytics | in-contract | proposed | server/routes/performance-api.ts:258 |

### planning-fmv-overrides

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/planning/fmv-overrides/latest | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/planning-fmv-overrides.ts:130 |
| api:POST:/api/funds/:fundId/planning/fmv-overrides | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/planning-fmv-overrides.ts:91 |

### portfolio-companies

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/portfolio-companies | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/portfolio-companies.ts:44 |
| api:GET:/api/portfolio-companies/:id | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/portfolio-companies.ts:106 |
| api:POST:/api/portfolio-companies | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/portfolio-companies.ts:175 |

### portfolio-lots

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:fundId/portfolio/lots | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/portfolio/lots.ts:123 |
| api:POST:/api/funds/:fundId/portfolio/lots | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/portfolio/lots.ts:38 |

### portfolio-overview

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/portfolio-overview | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/portfolio-overview.ts:44 |

### reallocation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/funds/:fundId/reallocation/commit | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/reallocation.ts:411 |
| api:POST:/api/funds/:fundId/reallocation/preview | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/reallocation.ts:308 |

### report

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:lp-report-generation | worker-job | railway / none | system | lp-reporting | keep-and-prove | proposed | server/queues/registry.ts:report; server/queues/report-generation-queue.ts:316; server/queues/report-generation-queue.ts:331 |

### reserve-calc

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:reserve-calc | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/registry.ts:reserve-calc; server/routes/fund-config.ts:27; workers/reserve-worker.ts:13 |

### runtime-observed

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/ | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/server.ts:332 |

### scenario-generation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:scenario-generation | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/services/CacheWarmingService.ts:48; server/workers/scenarioGeneratorWorker.ts:203 |

### sensitivity

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/funds/:id/sensitivity/runs | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/sensitivity.ts:189 |
| api:GET:/api/funds/:id/sensitivity/runs/:runId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/sensitivity.ts:234 |
| api:POST:/api/funds/:id/sensitivity/one-way | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/sensitivity.ts:60 |
| api:POST:/api/funds/:id/sensitivity/stress | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/sensitivity.ts:146 |
| api:POST:/api/funds/:id/sensitivity/two-way | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/sensitivity.ts:103 |

### server/app.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api-docs | http-api | vercel / vercel | unknown | unassigned | keep-and-prove | proposed | server/app.ts:137 |
| api:GET:/api-docs.json | http-api | vercel / vercel | unknown | unassigned | keep-and-prove | proposed | server/app.ts:160 |

### server/routes/activities.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/activities | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/activities.ts:20 |
| api:POST:/api/activities | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/activities.ts:75 |

### server/routes/admin/engine.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/admin/engine/guard | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/admin/engine.ts:18; server/routes/admin/engine.ts:9 |
| api:GET:/api/admin/engine/status | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/admin/engine.ts:71; server/routes/admin/engine.ts:9 |
| api:POST:/api/admin/engine/guard | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/admin/engine.ts:27; server/routes/admin/engine.ts:9 |

### server/routes/ai.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/ai/usage | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/ai.ts:68 |
| api:POST:/api/ai/ask | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/ai.ts:45 |
| api:POST:/api/ai/collaborate | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/ai.ts:137 |
| api:POST:/api/ai/consensus | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/ai.ts:111 |
| api:POST:/api/ai/debate | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/ai.ts:85 |

### server/routes/cache.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/cache/stats | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/cache.ts:124 |
| api:POST:/api/cache/invalidate | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/cache.ts:148 |
| api:POST:/api/cache/warm | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/cache.ts:183 |

### server/routes/calculations.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/calculations/export-csv | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/calculations.ts:78 |
| api:POST:/api/calculations/run | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/calculations.ts:114 |

### server/routes/cashflow.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/cashflow/:fundId/transactions/:transactionId | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:279 |
| api:GET:/api/cashflow/:fundId/capital-calls | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:321 |
| api:GET:/api/cashflow/:fundId/cash-position | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:509 |
| api:GET:/api/cashflow/:fundId/liquidity-forecast | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:402 |
| api:GET:/api/cashflow/:fundId/recurring-expenses | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:595 |
| api:GET:/api/cashflow/:fundId/transactions | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:109 |
| api:POST:/api/cashflow/:fundId/capital-calls | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:360 |
| api:POST:/api/cashflow/:fundId/recurring-expenses | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:644 |
| api:POST:/api/cashflow/:fundId/transactions | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:191 |
| api:PUT:/api/cashflow/:fundId/transactions/:transactionId | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/cashflow.ts:229 |

### server/routes/dev-dashboard.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/dev-dashboard/health | http-api | railway / none | public | unassigned | dev-only-excluded | proposed | server/routes/dev-dashboard.ts:313 |
| api:POST:/api/dev-dashboard/fix/build | http-api | railway / none | unknown | unassigned | dev-only-excluded | proposed | server/routes/dev-dashboard.ts:373 |
| api:POST:/api/dev-dashboard/fix/tests | http-api | railway / none | unknown | unassigned | dev-only-excluded | proposed | server/routes/dev-dashboard.ts:361 |
| api:POST:/api/dev-dashboard/fix/typescript | http-api | railway / none | unknown | unassigned | dev-only-excluded | proposed | server/routes/dev-dashboard.ts:349 |

### server/routes/engine-summaries.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/cohorts/analysis | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/engine-summaries.ts:165 |
| api:GET:/api/pacing/summary | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/engine-summaries.ts:115 |
| api:GET:/api/reserves/:fundId | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/engine-summaries.ts:69 |

### server/routes/error-budget.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/error-budget | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/error-budget.ts:18 |
| api:GET:/api/error-budget/:slo | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/error-budget.ts:31 |
| api:GET:/api/error-budget/config/slos | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/error-budget.ts:66 |
| api:GET:/api/error-budget/gate/status | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/error-budget.ts:53 |
| api:POST:/api/error-budget/config/slos | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/error-budget.ts:72 |

### server/routes/fund-metrics-legacy.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/fund-metrics/:fundId | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/fund-metrics-legacy.ts:12 |

### server/routes/health.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/health | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:182 |
| api:GET:/api/health/alerts | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:543 |
| api:GET:/api/health/cache | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:389 |
| api:GET:/api/health/db | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:361 |
| api:GET:/api/health/live | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:194 |
| api:GET:/api/health/migrations | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:489 |
| api:GET:/api/health/queues | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:409 |
| api:GET:/api/health/ready | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:193 |
| api:GET:/api/health/schema | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:457 |
| api:GET:/api/health/workers/:workerType | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:604 |
| api:GET:/api/version | http-api | both / vercel | unknown | unassigned | in-contract | proposed | server/app.ts:213; server/routes/health.ts:526 |
| api:GET:/health | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:171 |
| api:GET:/health/detailed | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:308 |
| api:GET:/health/detailed-json | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:197 |
| api:GET:/health/inflight | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:350 |
| api:GET:/healthz | http-api | both / vercel | public | unassigned | in-contract | proposed | server/routes/health.ts:158 |
| api:GET:/readyz | http-api | both / vercel | unknown | unassigned | in-contract | proposed | server/routes/health.ts:250 |

### server/routes/lp-health.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/lp/health | http-api | railway / none | public | unassigned | keep-and-prove | proposed | server/routes/lp-health.ts:212 |

### server/routes/metrics-endpoint.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/metrics | http-api | both / vercel | unknown | unassigned | in-contract | proposed | server/routes/metrics-endpoint.ts:19 |
| api:GET:/metrics | http-api | both / vercel | unknown | unassigned | in-contract | proposed | server/routes/metrics-endpoint.ts:19 |

### server/routes/metrics-rum-ingress.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/metrics/rum | http-api | vercel / vercel | public | unassigned | in-contract | proposed | server/routes/metrics-rum-ingress.ts:28; server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:112 |
| api:POST:/metrics/rum | http-api | vercel / vercel | public | unassigned | keep-and-prove | proposed | server/routes/metrics-rum-ingress.ts:28; server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:112 |

### server/routes/metrics-rum.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/metrics/rum | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:189 |
| api:GET:/api/metrics/rum/health | http-api | vercel / vercel | public | unassigned | in-contract | proposed | server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:213 |
| api:GET:/metrics/rum | http-api | vercel / vercel | unknown | unassigned | keep-and-prove | proposed | server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:189 |
| api:GET:/metrics/rum/health | http-api | vercel / vercel | public | unassigned | keep-and-prove | proposed | server/routes/metrics-rum.ts:106; server/routes/metrics-rum.ts:109; server/routes/metrics-rum.ts:213 |

### server/routes/monte-carlo.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/monte-carlo/cache | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:836 |
| api:GET:/api/monte-carlo/funds/:fundId/simulate | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:781 |
| api:GET:/api/monte-carlo/health | http-api | railway / none | public | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:731 |
| api:GET:/api/monte-carlo/jobs/:jobId | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:469 |
| api:GET:/api/monte-carlo/jobs/:jobId/stream | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:522 |
| api:GET:/api/monte-carlo/performance | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:758 |
| api:POST:/api/monte-carlo/batch | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:572 |
| api:POST:/api/monte-carlo/multi-environment | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:651 |
| api:POST:/api/monte-carlo/simulate | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:297 |
| api:POST:/api/monte-carlo/simulate/async | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/monte-carlo.ts:286; server/routes/monte-carlo.ts:287; server/routes/monte-carlo.ts:367 |

### server/routes/operations.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/operations/:key | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/operations.ts:7 |

### server/routes/performance-metrics.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/performance/alerts | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:118 |
| api:GET:/api/performance/monte-carlo | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:80 |
| api:GET:/api/performance/operations | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:225 |
| api:GET:/api/performance/realtime | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:152 |
| api:GET:/api/performance/summary | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:39 |
| api:POST:/api/performance/simulate | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/performance-metrics.ts:281 |

### server/routes/portfolio-intelligence.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/portfolio/strategies/:id | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:487 |
| api:GET:/api/portfolio/forecasts/:scenarioId | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:980 |
| api:GET:/api/portfolio/metrics/:scenarioId | http-api | railway / none | admin, gp | analytics | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:1185; server/routes/portfolio-intelligence.ts:40 |
| api:GET:/api/portfolio/reserves/strategies/:fundId | http-api | railway / none | admin, gp | analytics | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:831 |
| api:GET:/api/portfolio/scenarios/:fundId | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:619 |
| api:GET:/api/portfolio/strategies/:fundId | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:337; server/routes/portfolio-intelligence.ts:40 |
| api:GET:/api/portfolio/templates | http-api | railway / none | unknown | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:1074; server/routes/portfolio-intelligence.ts:40 |
| api:POST:/api/portfolio/forecasts | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:923 |
| api:POST:/api/portfolio/forecasts/validate | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:1019; server/routes/portfolio-intelligence.ts:40 |
| api:POST:/api/portfolio/quick-scenario | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:1146; server/routes/portfolio-intelligence.ts:40 |
| api:POST:/api/portfolio/reserves/backtest | http-api | railway / none | admin, gp | analytics | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:876 |
| api:POST:/api/portfolio/reserves/optimize | http-api | railway / none | admin, gp | analytics | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:770 |
| api:POST:/api/portfolio/scenarios | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:540 |
| api:POST:/api/portfolio/scenarios/:id/simulate | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:704 |
| api:POST:/api/portfolio/scenarios/compare | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:40; server/routes/portfolio-intelligence.ts:661 |
| api:POST:/api/portfolio/strategies | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:208; server/routes/portfolio-intelligence.ts:40 |
| api:PUT:/api/portfolio/strategies/:id | http-api | railway / none | admin, gp | gp-team | keep-and-prove | proposed | server/routes/portfolio-intelligence.ts:385; server/routes/portfolio-intelligence.ts:40 |

### server/routes/public/csp-report.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:POST:/api/csp-violations | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/public/csp-report.ts:62 |

### server/routes/scenario-analysis.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/companies/:companyId/scenarios/:scenarioId | http-api | vercel / vercel | admin, analyst, gp | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:981 |
| api:GET:/api/companies/:companyId/scenarios | http-api | vercel / vercel | admin, gp | gp-team | in-contract | proposed | server/routes/scenario-analysis.ts:326 |
| api:GET:/api/companies/:companyId/scenarios/:scenarioId | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:564 |
| api:GET:/api/funds/:fundId/scenario-analysis/seeds | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:377 |
| api:PATCH:/api/companies/:companyId/scenarios/:scenarioId | http-api | vercel / vercel | admin, analyst, gp | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:829 |
| api:POST:/api/companies/:companyId/reserves/optimize | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:1053 |
| api:POST:/api/companies/:companyId/scenarios | http-api | vercel / vercel | admin, analyst, gp | unassigned | in-contract | proposed | server/routes/scenario-analysis.ts:753 |
| api:POST:/api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed | http-api | vercel / vercel | admin, analyst, gp, unknown | gp-team | in-contract | proposed | server/routes/scenario-analysis.ts:426 |

### server/routes/sse-events.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/events/fund/:fundId | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/sse-events.ts:65 |
| api:GET:/api/events/simulation/:simulationId | http-api | railway / none | unknown | unassigned | keep-and-prove | proposed | server/routes/sse-events.ts:163 |

### server/routes/v1/reserves.ts

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/v1/reserves/config | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/v1/reserves.ts:149 |
| api:GET:/api/v1/reserves/constrained/reconciliations | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/v1/reserves.ts:195 |
| api:POST:/api/v1/reserves/calculate | http-api | vercel / vercel | unknown | unassigned | in-contract | proposed | server/routes/v1/reserves.ts:67 |

### shares

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/shares/:shareId | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/shares.ts:580 |
| api:GET:/api/public/shares/:shareId | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/shares.ts:674 |
| api:GET:/api/shares | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/shares.ts:460 |
| api:GET:/api/shares/:shareId/analytics | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/shares.ts:630 |
| api:PATCH:/api/shares/:shareId | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/shares.ts:491 |
| api:POST:/api/public/shares/:shareId/verify | http-api | vercel / vercel | unknown | lp-reporting | in-contract | proposed | server/routes/shares.ts:699 |
| api:POST:/api/shares | http-api | vercel / vercel | admin | lp-reporting | in-contract | proposed | server/routes/shares.ts:406 |

### simulation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worker:monte-carlo-simulations | worker-job | railway / none | system | analytics | keep-and-prove | proposed | server/queues/registry.ts:simulation; server/queues/simulation-queue.ts:139; server/queues/simulation-queue.ts:154 |

### timeline

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:GET:/api/timeline/:fundId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/timeline.ts:112 |
| api:GET:/api/timeline/:fundId/compare | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/timeline.ts:256 |
| api:GET:/api/timeline/:fundId/state | http-api | vercel / vercel | admin | gp-team | in-contract | proposed | server/routes/timeline.ts:154 |
| api:GET:/api/timeline/events/latest | http-api | vercel / vercel | admin | gp-team | in-contract | proposed | server/routes/timeline.ts:303 |
| api:POST:/api/timeline/:fundId/snapshot | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/timeline.ts:198 |

### variance

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api:DELETE:/api/funds/:id/baselines/:baselineId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:271 |
| api:GET:/api/funds/:id/alerts | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:561 |
| api:GET:/api/funds/:id/baselines | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:153 |
| api:GET:/api/funds/:id/variance-dashboard | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:855 |
| api:GET:/api/funds/:id/variance-reports | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:399 |
| api:GET:/api/funds/:id/variance-reports/:reportId | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:436 |
| api:GET:/api/internal/alert-automation/health | http-api | vercel / vercel | public | gp-team | in-contract | proposed | server/routes/variance.ts:70 |
| api:POST:/api/alerts/:alertId/acknowledge | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:620 |
| api:POST:/api/alerts/:alertId/resolve | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:670 |
| api:POST:/api/funds/:id/alert-rules | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:489 |
| api:POST:/api/funds/:id/alerts/cleanup-superseded | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:720 |
| api:POST:/api/funds/:id/baselines | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:83 |
| api:POST:/api/funds/:id/baselines/:baselineId/set-default | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:211 |
| api:POST:/api/funds/:id/variance-analysis | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:772 |
| api:POST:/api/funds/:id/variance-reports | http-api | vercel / vercel | unknown | gp-team | in-contract | proposed | server/routes/variance.ts:304 |

### variance-alert-automation

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scheduler:variance-alert-automation | scheduler | railway / none | system | analytics | keep-and-prove | proposed | server/routes.ts:42 |

### vercel-functions

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api-fn:ANY:/api/telemetry/wizard | vercel-function | vercel / none | unknown | platform | keep-and-prove | proposed | api/telemetry/wizard.ts:default export; vercel.json functions.api/**/*.ts |

### websocket

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ws:setup-websocket-servers | websocket | railway / none | system | platform | keep-and-prove | proposed | server/routes.ts:153 |

### worker-health

| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| listener:worker-health:GET:/health | http-api | railway / none | public | platform | keep-and-prove | proposed | workers/health-server.ts:125; workers/health-server.ts:204 |
| listener:worker-health:GET:/live | http-api | railway / none | public | platform | keep-and-prove | proposed | workers/health-server.ts:141; workers/health-server.ts:204 |
| listener:worker-health:GET:/metrics | http-api | railway / none | system | platform | keep-and-prove | proposed | workers/health-server.ts:177; workers/health-server.ts:204 |
| listener:worker-health:GET:/ready | http-api | railway / none | public | platform | keep-and-prove | proposed | workers/health-server.ts:150; workers/health-server.ts:204 |
| listener:worker-health:GET:/stats | http-api | railway / none | system | platform | keep-and-prove | proposed | workers/health-server.ts:189; workers/health-server.ts:204 |

## Decisions required

Every proposed row and every exclusion/disposition below requires evidenced approval before G1 closes.

### Proposed rows (470)

- **row** `api-fn:ANY:/api/telemetry/wizard` — lifecycle: **proposed** — evidence: ["api/telemetry/wizard.ts:default export","vercel.json functions.api/**/*.ts"]
- **row** `api:DELETE:/api/cashflow/:fundId/transactions/:transactionId` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:279"]
- **row** `api:DELETE:/api/companies/:companyId/scenarios/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:981"]
- **row** `api:DELETE:/api/deals/opportunities/:id` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:239"]
- **row** `api:DELETE:/api/flags/admin/kill-switch` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:171","server/routes/flags.ts:181","server/routes/flags.ts:182","server/routes/flags.ts:346"]
- **row** `api:DELETE:/api/funds/:id/baselines/:baselineId` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:271"]
- **row** `api:DELETE:/api/monte-carlo/cache` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:836"]
- **row** `api:DELETE:/api/portfolio/strategies/:id` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:487"]
- **row** `api:DELETE:/api/shares/:shareId` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:580"]
- **row** `api:GET:/` — lifecycle: **proposed** — evidence: ["server/server.ts:332"]
- **row** `api:GET:/api-docs` — lifecycle: **proposed** — evidence: ["server/app.ts:137"]
- **row** `api:GET:/api-docs.json` — lifecycle: **proposed** — evidence: ["server/app.ts:160"]
- **row** `api:GET:/api/activities` — lifecycle: **proposed** — evidence: ["server/routes/activities.ts:20"]
- **row** `api:GET:/api/admin/engine/guard` — lifecycle: **proposed** — evidence: ["server/routes/admin/engine.ts:18","server/routes/admin/engine.ts:9"]
- **row** `api:GET:/api/admin/engine/status` — lifecycle: **proposed** — evidence: ["server/routes/admin/engine.ts:71","server/routes/admin/engine.ts:9"]
- **row** `api:GET:/api/ai/usage` — lifecycle: **proposed** — evidence: ["server/routes/ai.ts:68"]
- **row** `api:GET:/api/auth/csrf` — lifecycle: **proposed** — evidence: ["server/routes/auth.ts:66"]
- **row** `api:GET:/api/auth/session` — lifecycle: **proposed** — evidence: ["server/routes/auth.ts:143"]
- **row** `api:GET:/api/backtesting/fund/:fundId/history` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:457"]
- **row** `api:GET:/api/backtesting/jobs/:jobId` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:302"]
- **row** `api:GET:/api/backtesting/jobs/:jobId/stream` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:369"]
- **row** `api:GET:/api/backtesting/result/:backtestId` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:522"]
- **row** `api:GET:/api/backtesting/scenarios` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:656"]
- **row** `api:GET:/api/cache/stats` — lifecycle: **proposed** — evidence: ["server/routes/cache.ts:124"]
- **row** `api:GET:/api/cashflow/:fundId/capital-calls` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:321"]
- **row** `api:GET:/api/cashflow/:fundId/cash-position` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:509"]
- **row** `api:GET:/api/cashflow/:fundId/liquidity-forecast` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:402"]
- **row** `api:GET:/api/cashflow/:fundId/recurring-expenses` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:595"]
- **row** `api:GET:/api/cashflow/:fundId/transactions` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:109"]
- **row** `api:GET:/api/cohorts/analysis` — lifecycle: **proposed** — evidence: ["server/routes/engine-summaries.ts:165"]
- **row** `api:GET:/api/cohorts/definitions` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:509"]
- **row** `api:GET:/api/cohorts/unmapped` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:298"]
- **row** `api:GET:/api/companies/:companyId/scenarios` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:326"]
- **row** `api:GET:/api/companies/:companyId/scenarios/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:564"]
- **row** `api:GET:/api/dashboard-summary/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/dashboard-summary.ts:23"]
- **row** `api:GET:/api/deals/:id/diligence` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:409"]
- **row** `api:GET:/api/deals/opportunities` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:96"]
- **row** `api:GET:/api/deals/opportunities/:id` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:160"]
- **row** `api:GET:/api/deals/pipeline` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:315"]
- **row** `api:GET:/api/deals/stages` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:348"]
- **row** `api:GET:/api/dev-dashboard/health` — lifecycle: **proposed** — evidence: ["server/routes/dev-dashboard.ts:313"]
- **row** `api:GET:/api/error-budget` — lifecycle: **proposed** — evidence: ["server/routes/error-budget.ts:18"]
- **row** `api:GET:/api/error-budget/:slo` — lifecycle: **proposed** — evidence: ["server/routes/error-budget.ts:31"]
- **row** `api:GET:/api/error-budget/config/slos` — lifecycle: **proposed** — evidence: ["server/routes/error-budget.ts:66"]
- **row** `api:GET:/api/error-budget/gate/status` — lifecycle: **proposed** — evidence: ["server/routes/error-budget.ts:53"]
- **row** `api:GET:/api/events/fund/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/sse-events.ts:65"]
- **row** `api:GET:/api/events/simulation/:simulationId` — lifecycle: **proposed** — evidence: ["server/routes/sse-events.ts:163"]
- **row** `api:GET:/api/flags` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:54"]
- **row** `api:GET:/api/flags/admin` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:171","server/routes/flags.ts:181","server/routes/flags.ts:182","server/routes/flags.ts:187"]
- **row** `api:GET:/api/flags/admin/:key/history` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:171","server/routes/flags.ts:181","server/routes/flags.ts:182","server/routes/flags.ts:305"]
- **row** `api:GET:/api/flags/status` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:118"]
- **row** `api:GET:/api/fund-metrics/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/fund-metrics-legacy.ts:12"]
- **row** `api:GET:/api/funds` — lifecycle: **proposed** — evidence: ["server/routes/funds.ts:155"]
- **row** `api:GET:/api/funds/:fundId/actuals/facts` — lifecycle: **proposed** — evidence: ["server/routes/fund-actuals.ts:34"]
- **row** `api:GET:/api/funds/:fundId/allocation-scenarios` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:409","server/routes/allocation-scenarios.ts:70"]
- **row** `api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:422","server/routes/allocation-scenarios.ts:70"]
- **row** `api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:448","server/routes/allocation-scenarios.ts:70"]
- **row** `api:GET:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:435","server/routes/allocation-scenarios.ts:70"]
- **row** `api:GET:/api/funds/:fundId/allocations/latest` — lifecycle: **proposed** — evidence: ["server/routes/allocations.ts:876"]
- **row** `api:GET:/api/funds/:fundId/cash-flow-events` — lifecycle: **proposed** — evidence: ["server/routes/cash-flow-events.ts:178"]
- **row** `api:GET:/api/funds/:fundId/companies` — lifecycle: **proposed** — evidence: ["server/routes/allocations.ts:602"]
- **row** `api:GET:/api/funds/:fundId/current-plan-versions` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:185"]
- **row** `api:GET:/api/funds/:fundId/dual-forecast` — lifecycle: **proposed** — evidence: ["server/routes/dual-forecast.ts:28"]
- **row** `api:GET:/api/funds/:fundId/financial-facts/latest` — lifecycle: **proposed** — evidence: ["server/routes/financial-facts.ts:105"]
- **row** `api:GET:/api/funds/:fundId/imports/batches/:batchId` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:585"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/drafts` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:249"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/drafts/:draftId` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:262"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:288"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/narratives` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:801"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/notes` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:910"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/references` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:596"]
- **row** `api:GET:/api/funds/:fundId/internal-analysis/references/:referenceId` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:617"]
- **row** `api:GET:/api/funds/:fundId/internal-economics/runs/:runId` — lifecycle: **proposed** — evidence: ["server/routes/internal-economics.ts:182"]
- **row** `api:GET:/api/funds/:fundId/investment-ledger/financing-events/:eventId` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:564"]
- **row** `api:GET:/api/funds/:fundId/investment-ledger/ownership-snapshots` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:422"]
- **row** `api:GET:/api/funds/:fundId/investment-ledger/position-valuations` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:471"]
- **row** `api:GET:/api/funds/:fundId/investment-ledger/positions` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:374"]
- **row** `api:GET:/api/funds/:fundId/kpi-observations` — lifecycle: **proposed** — evidence: ["server/routes/kpi-observations.ts:153"]
- **row** `api:GET:/api/funds/:fundId/kpi-observations/:observationId` — lifecycle: **proposed** — evidence: ["server/routes/kpi-observations.ts:181"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:382"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/evidence-records` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:677"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:725"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:863"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:459"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:497"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:610"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:629"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:544"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json/artifact` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:563"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:478"]
- **row** `api:GET:/api/funds/:fundId/metric-runs/latest` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:351"]
- **row** `api:GET:/api/funds/:fundId/metrics` — lifecycle: **proposed** — evidence: ["server/routes/fund-metrics.ts:72"]
- **row** `api:GET:/api/funds/:fundId/moic/marginal-rankings` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:277"]
- **row** `api:GET:/api/funds/:fundId/moic/rankings` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:359"]
- **row** `api:GET:/api/funds/:fundId/moic/reserve-intelligence/latest` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:228"]
- **row** `api:GET:/api/funds/:fundId/moic/reserve-intelligence/runs/:snapshotId` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:249"]
- **row** `api:GET:/api/funds/:fundId/pacing-history` — lifecycle: **proposed** — evidence: ["server/routes/performance-api.ts:194"]
- **row** `api:GET:/api/funds/:fundId/performance/breakdown` — lifecycle: **proposed** — evidence: ["server/routes/performance-api.ts:374"]
- **row** `api:GET:/api/funds/:fundId/performance/comparison` — lifecycle: **proposed** — evidence: ["server/routes/performance-api.ts:506"]
- **row** `api:GET:/api/funds/:fundId/performance/metrics` — lifecycle: **proposed** — evidence: ["server/routes/performance-api.ts:130"]
- **row** `api:GET:/api/funds/:fundId/performance/timeseries` — lifecycle: **proposed** — evidence: ["server/routes/performance-api.ts:258"]
- **row** `api:GET:/api/funds/:fundId/planning/fmv-overrides/latest` — lifecycle: **proposed** — evidence: ["server/routes/planning-fmv-overrides.ts:130"]
- **row** `api:GET:/api/funds/:fundId/portfolio/lots` — lifecycle: **proposed** — evidence: ["server/routes/portfolio/lots.ts:123"]
- **row** `api:GET:/api/funds/:fundId/reconciliation/cases` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:609"]
- **row** `api:GET:/api/funds/:fundId/scenario-analysis/seeds` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:377"]
- **row** `api:GET:/api/funds/:fundId/scenario-sets` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:148"]
- **row** `api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:165"]
- **row** `api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:282"]
- **row** `api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/comparison` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:299"]
- **row** `api:GET:/api/funds/:fundId/scenario-sets/:scenarioSetId/results` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:316"]
- **row** `api:GET:/api/funds/:fundId/tasks` — lifecycle: **proposed** — evidence: ["server/routes/operating-object-tasks.ts:95"]
- **row** `api:GET:/api/funds/:fundId/tasks/:taskId/evidence-links` — lifecycle: **proposed** — evidence: ["server/routes/operating-object-tasks.ts:113"]
- **row** `api:GET:/api/funds/:id` — lifecycle: **proposed** — evidence: ["server/routes/funds.ts:168"]
- **row** `api:GET:/api/funds/:id/alerts` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:561"]
- **row** `api:GET:/api/funds/:id/baselines` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:153"]
- **row** `api:GET:/api/funds/:id/draft` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:278"]
- **row** `api:GET:/api/funds/:id/lifecycle-history` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:515"]
- **row** `api:GET:/api/funds/:id/reserves` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:415"]
- **row** `api:GET:/api/funds/:id/results` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:495"]
- **row** `api:GET:/api/funds/:id/results-comparison` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:549"]
- **row** `api:GET:/api/funds/:id/sensitivity/runs` — lifecycle: **proposed** — evidence: ["server/routes/sensitivity.ts:189"]
- **row** `api:GET:/api/funds/:id/sensitivity/runs/:runId` — lifecycle: **proposed** — evidence: ["server/routes/sensitivity.ts:234"]
- **row** `api:GET:/api/funds/:id/state` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:465"]
- **row** `api:GET:/api/funds/:id/variance-dashboard` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:855"]
- **row** `api:GET:/api/funds/:id/variance-reports` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:399"]
- **row** `api:GET:/api/funds/:id/variance-reports/:reportId` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:436"]
- **row** `api:GET:/api/graduation/defaults` — lifecycle: **proposed** — evidence: ["server/routes/graduation.ts:75"]
- **row** `api:GET:/api/health` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:182"]
- **row** `api:GET:/api/health/alerts` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:543"]
- **row** `api:GET:/api/health/cache` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:389"]
- **row** `api:GET:/api/health/db` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:361"]
- **row** `api:GET:/api/health/live` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:194"]
- **row** `api:GET:/api/health/migrations` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:489"]
- **row** `api:GET:/api/health/queues` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:409"]
- **row** `api:GET:/api/health/ready` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:193"]
- **row** `api:GET:/api/health/schema` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:457"]
- **row** `api:GET:/api/health/workers/:workerType` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:604"]
- **row** `api:GET:/api/internal/alert-automation/health` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:70"]
- **row** `api:GET:/api/investments` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:35"]
- **row** `api:GET:/api/investments/:id` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:81"]
- **row** `api:GET:/api/investments/:id/rounds` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:360"]
- **row** `api:GET:/api/investments/:id/rounds/:roundId` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:386"]
- **row** `api:GET:/api/lp/capital-account` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:236","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/capital-calls` — lifecycle: **proposed** — evidence: ["server/routes/lp-capital-calls.ts:92"]
- **row** `api:GET:/api/lp/capital-calls/:callId` — lifecycle: **proposed** — evidence: ["server/routes/lp-capital-calls.ts:245"]
- **row** `api:GET:/api/lp/capital-calls/:callId/wire-instructions` — lifecycle: **proposed** — evidence: ["server/routes/lp-capital-calls.ts:392"]
- **row** `api:GET:/api/lp/distributions` — lifecycle: **proposed** — evidence: ["server/routes/lp-distributions.ts:86"]
- **row** `api:GET:/api/lp/distributions/:distributionId` — lifecycle: **proposed** — evidence: ["server/routes/lp-distributions.ts:522"]
- **row** `api:GET:/api/lp/distributions/summary` — lifecycle: **proposed** — evidence: ["server/routes/lp-distributions.ts:242"]
- **row** `api:GET:/api/lp/distributions/tax-summary/:year` — lifecycle: **proposed** — evidence: ["server/routes/lp-distributions.ts:364"]
- **row** `api:GET:/api/lp/documents` — lifecycle: **proposed** — evidence: ["server/routes/lp-documents.ts:112"]
- **row** `api:GET:/api/lp/documents/:documentId` — lifecycle: **proposed** — evidence: ["server/routes/lp-documents.ts:363"]
- **row** `api:GET:/api/lp/documents/:documentId/download` — lifecycle: **proposed** — evidence: ["server/routes/lp-documents.ts:475"]
- **row** `api:GET:/api/lp/documents/search` — lifecycle: **proposed** — evidence: ["server/routes/lp-documents.ts:250"]
- **row** `api:GET:/api/lp/funds/:fundId/detail` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:380","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/funds/:fundId/holdings` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:488","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/health` — lifecycle: **proposed** — evidence: ["server/routes/lp-health.ts:212"]
- **row** `api:GET:/api/lp/notifications` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:84"]
- **row** `api:GET:/api/lp/notifications/preferences` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:499"]
- **row** `api:GET:/api/lp/notifications/unread-count` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:236"]
- **row** `api:GET:/api/lp/performance` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:552","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/performance/benchmark` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:66","server/routes/lp-api.ts:664","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/profile` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:107","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/reports` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:66","server/routes/lp-api.ts:67","server/routes/lp-api.ts:891"]
- **row** `api:GET:/api/lp/reports/:reportId` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:66","server/routes/lp-api.ts:67","server/routes/lp-api.ts:942"]
- **row** `api:GET:/api/lp/reports/:reportId/download` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:66","server/routes/lp-api.ts:67","server/routes/lp-api.ts:997"]
- **row** `api:GET:/api/lp/settings` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:1161","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/lp/summary` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:165","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:GET:/api/metrics` — lifecycle: **proposed** — evidence: ["server/routes/metrics-endpoint.ts:19"]
- **row** `api:GET:/api/metrics/rum` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:189"]
- **row** `api:GET:/api/metrics/rum/health` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:213"]
- **row** `api:GET:/api/monte-carlo/funds/:fundId/simulate` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:781"]
- **row** `api:GET:/api/monte-carlo/health` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:731"]
- **row** `api:GET:/api/monte-carlo/jobs/:jobId` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:469"]
- **row** `api:GET:/api/monte-carlo/jobs/:jobId/stream` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:522"]
- **row** `api:GET:/api/monte-carlo/performance` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:758"]
- **row** `api:GET:/api/operations/:key` — lifecycle: **proposed** — evidence: ["server/routes/operations.ts:7"]
- **row** `api:GET:/api/pacing/summary` — lifecycle: **proposed** — evidence: ["server/routes/engine-summaries.ts:115"]
- **row** `api:GET:/api/performance/alerts` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:118"]
- **row** `api:GET:/api/performance/monte-carlo` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:80"]
- **row** `api:GET:/api/performance/operations` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:225"]
- **row** `api:GET:/api/performance/realtime` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:152"]
- **row** `api:GET:/api/performance/summary` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:39"]
- **row** `api:GET:/api/portfolio-companies` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-companies.ts:44"]
- **row** `api:GET:/api/portfolio-companies/:id` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-companies.ts:106"]
- **row** `api:GET:/api/portfolio-overview` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-overview.ts:44"]
- **row** `api:GET:/api/portfolio/forecasts/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:980"]
- **row** `api:GET:/api/portfolio/metrics/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:1185","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:GET:/api/portfolio/reserves/strategies/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:831"]
- **row** `api:GET:/api/portfolio/scenarios/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:619"]
- **row** `api:GET:/api/portfolio/strategies/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:337","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:GET:/api/portfolio/templates` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:1074","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:GET:/api/public/shares/:shareId` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:674"]
- **row** `api:GET:/api/reserves/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/engine-summaries.ts:69"]
- **row** `api:GET:/api/shares` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:460"]
- **row** `api:GET:/api/shares/:shareId/analytics` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:630"]
- **row** `api:GET:/api/timeline/:fundId` — lifecycle: **proposed** — evidence: ["server/routes/timeline.ts:112"]
- **row** `api:GET:/api/timeline/:fundId/compare` — lifecycle: **proposed** — evidence: ["server/routes/timeline.ts:256"]
- **row** `api:GET:/api/timeline/:fundId/state` — lifecycle: **proposed** — evidence: ["server/routes/timeline.ts:154"]
- **row** `api:GET:/api/timeline/events/latest` — lifecycle: **proposed** — evidence: ["server/routes/timeline.ts:303"]
- **row** `api:GET:/api/v1/reserves/config` — lifecycle: **proposed** — evidence: ["server/routes/v1/reserves.ts:149"]
- **row** `api:GET:/api/v1/reserves/constrained/reconciliations` — lifecycle: **proposed** — evidence: ["server/routes/v1/reserves.ts:195"]
- **row** `api:GET:/api/version` — lifecycle: **proposed** — evidence: ["server/app.ts:213","server/routes/health.ts:526"]
- **row** `api:GET:/health` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:171"]
- **row** `api:GET:/health/detailed` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:308"]
- **row** `api:GET:/health/detailed-json` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:197"]
- **row** `api:GET:/health/inflight` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:350"]
- **row** `api:GET:/healthz` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:158"]
- **row** `api:GET:/metrics` — lifecycle: **proposed** — evidence: ["server/routes/metrics-endpoint.ts:19"]
- **row** `api:GET:/metrics/rum` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:189"]
- **row** `api:GET:/metrics/rum/health` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:213"]
- **row** `api:GET:/readyz` — lifecycle: **proposed** — evidence: ["server/routes/health.ts:250"]
- **row** `api:PATCH:/api/companies/:companyId/scenarios/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:829"]
- **row** `api:PATCH:/api/flags/admin/:key` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:171","server/routes/flags.ts:181","server/routes/flags.ts:182","server/routes/flags.ts:209"]
- **row** `api:PATCH:/api/funds/:fundId/allocation-scenarios/:scenarioId` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:513","server/routes/allocation-scenarios.ts:70"]
- **row** `api:PATCH:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions/:decisionId` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:537","server/routes/allocation-scenarios.ts:70"]
- **row** `api:PATCH:/api/funds/:fundId/cash-flow-events/:eventId` — lifecycle: **proposed** — evidence: ["server/routes/cash-flow-events.ts:196"]
- **row** `api:PATCH:/api/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:452"]
- **row** `api:PATCH:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/items/:category` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:312"]
- **row** `api:PATCH:/api/funds/:fundId/kpi-observations/:observationId/review` — lifecycle: **proposed** — evidence: ["server/routes/kpi-observations.ts:330"]
- **row** `api:PATCH:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:773"]
- **row** `api:PATCH:/api/funds/:fundId/tasks/:taskId` — lifecycle: **proposed** — evidence: ["server/routes/operating-object-tasks.ts:214"]
- **row** `api:PATCH:/api/shares/:shareId` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:491"]
- **row** `api:POST:/api/activities` — lifecycle: **proposed** — evidence: ["server/routes/activities.ts:75"]
- **row** `api:POST:/api/admin/engine/guard` — lifecycle: **proposed** — evidence: ["server/routes/admin/engine.ts:27","server/routes/admin/engine.ts:9"]
- **row** `api:POST:/api/admin/funds/:fundId/calculation-modes/current-forecast/resume` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:353"]
- **row** `api:POST:/api/admin/funds/:fundId/current-forecast/activate` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:456"]
- **row** `api:POST:/api/admin/funds/:fundId/current-forecast/references` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:410"]
- **row** `api:POST:/api/admin/funds/:fundId/financial-facts/snapshots` — lifecycle: **proposed** — evidence: ["server/routes/financial-facts.ts:128"]
- **row** `api:POST:/api/admin/funds/:fundId/internal-analysis/quarterly-draft-run` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:685"]
- **row** `api:POST:/api/admin/funds/:fundId/moic/reconciliations` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:485"]
- **row** `api:POST:/api/ai/ask` — lifecycle: **proposed** — evidence: ["server/routes/ai.ts:45"]
- **row** `api:POST:/api/ai/collaborate` — lifecycle: **proposed** — evidence: ["server/routes/ai.ts:137"]
- **row** `api:POST:/api/ai/consensus` — lifecycle: **proposed** — evidence: ["server/routes/ai.ts:111"]
- **row** `api:POST:/api/ai/debate` — lifecycle: **proposed** — evidence: ["server/routes/ai.ts:85"]
- **row** `api:POST:/api/alerts/:alertId/acknowledge` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:620"]
- **row** `api:POST:/api/alerts/:alertId/resolve` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:670"]
- **row** `api:POST:/api/auth/login` — lifecycle: **proposed** — evidence: ["server/routes/auth.ts:102"]
- **row** `api:POST:/api/auth/logout` — lifecycle: **proposed** — evidence: ["server/routes/auth.ts:161"]
- **row** `api:POST:/api/backtesting/compare-scenarios` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:595"]
- **row** `api:POST:/api/backtesting/run` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:191"]
- **row** `api:POST:/api/backtesting/run/async` — lifecycle: **proposed** — evidence: ["server/routes/backtesting.ts:236"]
- **row** `api:POST:/api/cache/invalidate` — lifecycle: **proposed** — evidence: ["server/routes/cache.ts:148"]
- **row** `api:POST:/api/cache/warm` — lifecycle: **proposed** — evidence: ["server/routes/cache.ts:183"]
- **row** `api:POST:/api/calculations/export-csv` — lifecycle: **proposed** — evidence: ["server/routes/calculations.ts:78"]
- **row** `api:POST:/api/calculations/run` — lifecycle: **proposed** — evidence: ["server/routes/calculations.ts:114"]
- **row** `api:POST:/api/capital-allocation/calculate` — lifecycle: **proposed** — evidence: ["server/routes/capital-allocation.ts:78"]
- **row** `api:POST:/api/capital-allocation/validate` — lifecycle: **proposed** — evidence: ["server/routes/capital-allocation.ts:104"]
- **row** `api:POST:/api/cashflow/:fundId/capital-calls` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:360"]
- **row** `api:POST:/api/cashflow/:fundId/recurring-expenses` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:644"]
- **row** `api:POST:/api/cashflow/:fundId/transactions` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:191"]
- **row** `api:POST:/api/cohorts/analyze` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:96"]
- **row** `api:POST:/api/cohorts/definitions` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:569"]
- **row** `api:POST:/api/cohorts/sector-mappings` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:404"]
- **row** `api:POST:/api/cohorts/seed` — lifecycle: **proposed** — evidence: ["server/routes/cohort-analysis.ts:640"]
- **row** `api:POST:/api/companies/:companyId/reserves/optimize` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:1053"]
- **row** `api:POST:/api/companies/:companyId/scenarios` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:753"]
- **row** `api:POST:/api/csp-violations` — lifecycle: **proposed** — evidence: ["server/routes/public/csp-report.ts:62"]
- **row** `api:POST:/api/deals/:id/diligence` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:368"]
- **row** `api:POST:/api/deals/:id/stage` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:272"]
- **row** `api:POST:/api/deals/opportunities` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:55"]
- **row** `api:POST:/api/deals/opportunities/bulk/archive` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:564"]
- **row** `api:POST:/api/deals/opportunities/bulk/status` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:535"]
- **row** `api:POST:/api/deals/opportunities/import` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:497"]
- **row** `api:POST:/api/deals/opportunities/import/preview` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:443"]
- **row** `api:POST:/api/dev-dashboard/fix/build` — lifecycle: **proposed** — evidence: ["server/routes/dev-dashboard.ts:373"]
- **row** `api:POST:/api/dev-dashboard/fix/tests` — lifecycle: **proposed** — evidence: ["server/routes/dev-dashboard.ts:361"]
- **row** `api:POST:/api/dev-dashboard/fix/typescript` — lifecycle: **proposed** — evidence: ["server/routes/dev-dashboard.ts:349"]
- **row** `api:POST:/api/error-budget/config/slos` — lifecycle: **proposed** — evidence: ["server/routes/error-budget.ts:72"]
- **row** `api:POST:/api/flags/admin/kill-switch` — lifecycle: **proposed** — evidence: ["server/routes/flags.ts:171","server/routes/flags.ts:181","server/routes/flags.ts:182","server/routes/flags.ts:327"]
- **row** `api:POST:/api/funds` — lifecycle: **proposed** — evidence: ["server/routes/funds.ts:208"]
- **row** `api:POST:/api/funds/:fundId/allocation-scenarios` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:461","server/routes/allocation-scenarios.ts:70"]
- **row** `api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/apply` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:593","server/routes/allocation-scenarios.ts:70"]
- **row** `api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/decisions` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:485","server/routes/allocation-scenarios.ts:70"]
- **row** `api:POST:/api/funds/:fundId/allocation-scenarios/:scenarioId/sync` — lifecycle: **proposed** — evidence: ["server/routes/allocation-scenarios.ts:566","server/routes/allocation-scenarios.ts:70"]
- **row** `api:POST:/api/funds/:fundId/allocations` — lifecycle: **proposed** — evidence: ["server/routes/allocations.ts:1051"]
- **row** `api:POST:/api/funds/:fundId/cash-flow-events` — lifecycle: **proposed** — evidence: ["server/routes/cash-flow-events.ts:148"]
- **row** `api:POST:/api/funds/:fundId/cash-flow-events/:eventId/approve` — lifecycle: **proposed** — evidence: ["server/routes/cash-flow-events.ts:281"]
- **row** `api:POST:/api/funds/:fundId/cash-flow-events/:eventId/lock` — lifecycle: **proposed** — evidence: ["server/routes/cash-flow-events.ts:296"]
- **row** `api:POST:/api/funds/:fundId/current-forecast/runs` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:240"]
- **row** `api:POST:/api/funds/:fundId/current-plan-versions` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:200"]
- **row** `api:POST:/api/funds/:fundId/imports/artifacts` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:404"]
- **row** `api:POST:/api/funds/:fundId/imports/batches` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:545"]
- **row** `api:POST:/api/funds/:fundId/imports/batches/:batchId/commit` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:701"]
- **row** `api:POST:/api/funds/:fundId/imports/ledger/commit` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:330"]
- **row** `api:POST:/api/funds/:fundId/imports/ledger/dry-run` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:256"]
- **row** `api:POST:/api/funds/:fundId/imports/mapping-profiles` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:479"]
- **row** `api:POST:/api/funds/:fundId/imports/valuation-marks/commit` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:367"]
- **row** `api:POST:/api/funds/:fundId/imports/valuation-marks/dry-run` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:293"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/drafts` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:409"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/waiver` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:364"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/refresh` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:516"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/drafts/:draftId/save` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:551"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/narratives/generate` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:829"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/narratives/revise` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:869"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/notes` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:933"]
- **row** `api:POST:/api/funds/:fundId/internal-analysis/references/:referenceId/drafts` — lifecycle: **proposed** — evidence: ["server/routes/internal-analysis.ts:648"]
- **row** `api:POST:/api/funds/:fundId/internal-economics/runs` — lifecycle: **proposed** — evidence: ["server/routes/internal-economics.ts:143"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/financing-events` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:261"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:282"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/ownership-snapshots` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:450"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/position-conversions` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:517"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/position-corrections` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:538"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/position-events` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:401"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/position-valuations` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:496"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:305"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:351"]
- **row** `api:POST:/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations` — lifecycle: **proposed** — evidence: ["server/routes/investment-ledger.ts:328"]
- **row** `api:POST:/api/funds/:fundId/kpi-observations` — lifecycle: **proposed** — evidence: ["server/routes/kpi-observations.ts:209"]
- **row** `api:POST:/api/funds/:fundId/kpi-observations/imports` — lifecycle: **proposed** — evidence: ["server/routes/kpi-observations.ts:254"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/approve` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:401"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/evidence-records` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:696"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/lock` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:430"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:744"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/approve` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:833"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/narrative-runs/:narrativeRunId/review` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:803"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:648"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:582"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/json` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:516"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/commit` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:323"]
- **row** `api:POST:/api/funds/:fundId/metric-runs/dry-run` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/metric-runs.ts:296"]
- **row** `api:POST:/api/funds/:fundId/metrics/invalidate` — lifecycle: **proposed** — evidence: ["server/routes/fund-metrics.ts:162"]
- **row** `api:POST:/api/funds/:fundId/moic/reserve-intelligence/runs` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:181"]
- **row** `api:POST:/api/funds/:fundId/planning/fmv-overrides` — lifecycle: **proposed** — evidence: ["server/routes/planning-fmv-overrides.ts:91"]
- **row** `api:POST:/api/funds/:fundId/portfolio/lots` — lifecycle: **proposed** — evidence: ["server/routes/portfolio/lots.ts:38"]
- **row** `api:POST:/api/funds/:fundId/reallocation/commit` — lifecycle: **proposed** — evidence: ["server/routes/reallocation.ts:411"]
- **row** `api:POST:/api/funds/:fundId/reallocation/preview` — lifecycle: **proposed** — evidence: ["server/routes/reallocation.ts:308"]
- **row** `api:POST:/api/funds/:fundId/reconciliation/cases/:caseId/resolve` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:633"]
- **row** `api:POST:/api/funds/:fundId/reconciliation/cases/bulk-resolve` — lifecycle: **proposed** — evidence: ["server/routes/lp-reporting/imports.ts:672"]
- **row** `api:POST:/api/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed` — lifecycle: **proposed** — evidence: ["server/routes/scenario-analysis.ts:426"]
- **row** `api:POST:/api/funds/:fundId/scenario-sets` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:182"]
- **row** `api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/archive` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:339"]
- **row** `api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculate` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:235"]
- **row** `api:POST:/api/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:253"]
- **row** `api:POST:/api/funds/:fundId/scenario-sets/reserve-optimization` — lifecycle: **proposed** — evidence: ["server/routes/fund-scenario-sets.ts:207"]
- **row** `api:POST:/api/funds/:fundId/tasks` — lifecycle: **proposed** — evidence: ["server/routes/operating-object-tasks.ts:65"]
- **row** `api:POST:/api/funds/:fundId/tasks/:taskId/evidence-links` — lifecycle: **proposed** — evidence: ["server/routes/operating-object-tasks.ts:149"]
- **row** `api:POST:/api/funds/:id/alert-rules` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:489"]
- **row** `api:POST:/api/funds/:id/alerts/cleanup-superseded` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:720"]
- **row** `api:POST:/api/funds/:id/baselines` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:83"]
- **row** `api:POST:/api/funds/:id/baselines/:baselineId/set-default` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:211"]
- **row** `api:POST:/api/funds/:id/publish` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:311"]
- **row** `api:POST:/api/funds/:id/recalculate` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:363"]
- **row** `api:POST:/api/funds/:id/sensitivity/one-way` — lifecycle: **proposed** — evidence: ["server/routes/sensitivity.ts:60"]
- **row** `api:POST:/api/funds/:id/sensitivity/stress` — lifecycle: **proposed** — evidence: ["server/routes/sensitivity.ts:146"]
- **row** `api:POST:/api/funds/:id/sensitivity/two-way` — lifecycle: **proposed** — evidence: ["server/routes/sensitivity.ts:103"]
- **row** `api:POST:/api/funds/:id/variance-analysis` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:772"]
- **row** `api:POST:/api/funds/:id/variance-reports` — lifecycle: **proposed** — evidence: ["server/routes/variance.ts:304"]
- **row** `api:POST:/api/funds/calculate` — lifecycle: **proposed** — evidence: ["server/routes/funds.ts:249"]
- **row** `api:POST:/api/funds/finalize` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:99"]
- **row** `api:POST:/api/graduation/project` — lifecycle: **proposed** — evidence: ["server/routes/graduation.ts:30"]
- **row** `api:POST:/api/investments` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:131"]
- **row** `api:POST:/api/investments/:id/cases` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:425"]
- **row** `api:POST:/api/investments/:id/rounds` — lifecycle: **proposed** — evidence: ["server/routes/investments.ts:287"]
- **row** `api:POST:/api/liquidity/analyze` — lifecycle: **proposed** — evidence: ["server/routes/liquidity.ts:97"]
- **row** `api:POST:/api/liquidity/forecast` — lifecycle: **proposed** — evidence: ["server/routes/liquidity.ts:113"]
- **row** `api:POST:/api/liquidity/optimize-calls` — lifecycle: **proposed** — evidence: ["server/routes/liquidity.ts:159"]
- **row** `api:POST:/api/liquidity/stress-test` — lifecycle: **proposed** — evidence: ["server/routes/liquidity.ts:135"]
- **row** `api:POST:/api/lp/capital-calls/:callId/payment` — lifecycle: **proposed** — evidence: ["server/routes/lp-capital-calls.ts:495"]
- **row** `api:POST:/api/lp/notifications/:notificationId/read` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:296"]
- **row** `api:POST:/api/lp/notifications/read-all` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:403"]
- **row** `api:POST:/api/lp/reports/generate` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:66","server/routes/lp-api.ts:67","server/routes/lp-api.ts:759"]
- **row** `api:POST:/api/metrics/rum` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum-ingress.ts:28","server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:112"]
- **row** `api:POST:/api/monte-carlo/batch` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:572"]
- **row** `api:POST:/api/monte-carlo/multi-environment` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:651"]
- **row** `api:POST:/api/monte-carlo/simulate` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:297"]
- **row** `api:POST:/api/monte-carlo/simulate/async` — lifecycle: **proposed** — evidence: ["server/routes/monte-carlo.ts:286","server/routes/monte-carlo.ts:287","server/routes/monte-carlo.ts:367"]
- **row** `api:POST:/api/performance/simulate` — lifecycle: **proposed** — evidence: ["server/routes/performance-metrics.ts:281"]
- **row** `api:POST:/api/portfolio-companies` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-companies.ts:175"]
- **row** `api:POST:/api/portfolio/forecasts` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:923"]
- **row** `api:POST:/api/portfolio/forecasts/validate` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:1019","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:POST:/api/portfolio/quick-scenario` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:1146","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:POST:/api/portfolio/reserves/backtest` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:876"]
- **row** `api:POST:/api/portfolio/reserves/optimize` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:770"]
- **row** `api:POST:/api/portfolio/scenarios` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:540"]
- **row** `api:POST:/api/portfolio/scenarios/:id/simulate` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:704"]
- **row** `api:POST:/api/portfolio/scenarios/compare` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:40","server/routes/portfolio-intelligence.ts:661"]
- **row** `api:POST:/api/portfolio/strategies` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:208","server/routes/portfolio-intelligence.ts:40"]
- **row** `api:POST:/api/public/shares/:shareId/verify` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:699"]
- **row** `api:POST:/api/shares` — lifecycle: **proposed** — evidence: ["server/routes/shares.ts:406"]
- **row** `api:POST:/api/timeline/:fundId/snapshot` — lifecycle: **proposed** — evidence: ["server/routes/timeline.ts:198"]
- **row** `api:POST:/api/v1/reserves/calculate` — lifecycle: **proposed** — evidence: ["server/routes/v1/reserves.ts:67"]
- **row** `api:POST:/metrics/rum` — lifecycle: **proposed** — evidence: ["server/routes/metrics-rum-ingress.ts:28","server/routes/metrics-rum.ts:106","server/routes/metrics-rum.ts:109","server/routes/metrics-rum.ts:112"]
- **row** `api:PUT:/api/admin/funds/:fundId/calculation-modes/current-forecast` — lifecycle: **proposed** — evidence: ["server/routes/current-forecast.ts:276"]
- **row** `api:PUT:/api/admin/funds/:fundId/calculation-modes/fund-moic-rankings` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:615"]
- **row** `api:PUT:/api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId` — lifecycle: **proposed** — evidence: ["server/routes/fund-moic.ts:534"]
- **row** `api:PUT:/api/cashflow/:fundId/transactions/:transactionId` — lifecycle: **proposed** — evidence: ["server/routes/cashflow.ts:229"]
- **row** `api:PUT:/api/deals/opportunities/:id` — lifecycle: **proposed** — evidence: ["server/routes/deal-pipeline.ts:193"]
- **row** `api:PUT:/api/funds/:id/draft` — lifecycle: **proposed** — evidence: ["server/routes/fund-config.ts:151"]
- **row** `api:PUT:/api/lp/notifications/preferences` — lifecycle: **proposed** — evidence: ["server/routes/lp-notifications.ts:569"]
- **row** `api:PUT:/api/lp/settings` — lifecycle: **proposed** — evidence: ["server/routes/lp-api.ts:1220","server/routes/lp-api.ts:66","server/routes/lp-api.ts:67"]
- **row** `api:PUT:/api/portfolio/strategies/:id` — lifecycle: **proposed** — evidence: ["server/routes/portfolio-intelligence.ts:385","server/routes/portfolio-intelligence.ts:40"]
- **row** `client:/` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:136"]
- **row** `client:/admin/ui-catalog` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:151"]
- **row** `client:/analytics-legacy` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:139"]
- **row** `client:/dashboard` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:84"]
- **row** `client:/financial-modeling` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:89"]
- **row** `client:/forecasting` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:88"]
- **row** `client:/fund-model-results/:fundId` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:96"]
- **row** `client:/fund-model-results/:fundId/analysis` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:95"]
- **row** `client:/fund-model-results/:fundId/internal-analysis` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:94"]
- **row** `client:/fund-model-results/:fundId/moic-analysis` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:92"]
- **row** `client:/fund-model-results/:fundId/reports` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:93"]
- **row** `client:/fund-model-results/:fundId/scenarios` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:91"]
- **row** `client:/fund-setup` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:83"]
- **row** `client:/help` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:106"]
- **row** `client:/investments` — lifecycle: **proposed** — evidence: ["shared/routes/app-route-definitions.ts:64"]
- **row** `client:/kpi-manager` — lifecycle: **proposed** — evidence: ["shared/routes/app-route-definitions.ts:54"]
- **row** `client:/kpi-submission` — lifecycle: **proposed** — evidence: ["shared/routes/app-route-definitions.ts:59"]
- **row** `client:/login` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:177"]
- **row** `client:/lp` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:146"]
- **row** `client:/lp-reporting/imports` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:104"]
- **row** `client:/lp-reporting/ledger` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:101"]
- **row** `client:/lp-reporting/metrics` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:103"]
- **row** `client:/lp-reporting/valuations` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:102"]
- **row** `client:/lp/capital-account` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:124"]
- **row** `client:/lp/dashboard` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:122"]
- **row** `client:/lp/fund-detail/:fundId` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:123"]
- **row** `client:/lp/performance` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:125"]
- **row** `client:/lp/reports` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:126"]
- **row** `client:/lp/settings` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:127"]
- **row** `client:/model-results` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:90"]
- **row** `client:/moic-analysis` — lifecycle: **proposed** — evidence: ["shared/routes/app-route-definitions.ts:48"]
- **row** `client:/performance` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:87"]
- **row** `client:/pipeline` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:100"]
- **row** `client:/planning` — lifecycle: **proposed** — evidence: ["shared/routes/app-route-definitions.ts:42"]
- **row** `client:/planning-legacy` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:142"]
- **row** `client:/portal/:rest*` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:179"]
- **row** `client:/portfolio` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:86"]
- **row** `client:/portfolio/company/:id` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:85"]
- **row** `client:/reports` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:98"]
- **row** `client:/sensitivity-analysis` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:97"]
- **row** `client:/settings` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:105"]
- **row** `client:/shared/:shareId` — lifecycle: **proposed** — evidence: ["client/src/app/app-router.tsx:178"]
- **row** `client:/variance-tracking` — lifecycle: **proposed** — evidence: ["client/src/app/app-routes.tsx:99"]
- **row** `dormant:client/src/components/investments/portfolio-company-detail.tsx` — lifecycle: **proposed** — evidence: ["client/src/components/investments/portfolio-company-detail.tsx"]
- **row** `dormant:client/src/pages/v2/cash.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/cash.tsx"]
- **row** `dormant:client/src/pages/v2/company.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/company.tsx"]
- **row** `dormant:client/src/pages/v2/exits.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/exits.tsx"]
- **row** `dormant:client/src/pages/v2/insights.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/insights.tsx"]
- **row** `dormant:client/src/pages/v2/partners.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/partners.tsx"]
- **row** `dormant:client/src/pages/v2/portfolio.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/portfolio.tsx"]
- **row** `dormant:client/src/pages/v2/scenarios.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/scenarios.tsx"]
- **row** `dormant:client/src/pages/v2/today.tsx` — lifecycle: **proposed** — evidence: ["client/src/pages/v2/today.tsx"]
- **row** `event:calc-run-completion` — lifecycle: **proposed** — evidence: ["server/routes.ts:40"]
- **row** `listener:ml-reserve:GET:/health` — lifecycle: **proposed** — evidence: ["ml-service/app.py:187","ml-service/app.py:26","ml-service/app.py:427"]
- **row** `listener:ml-reserve:GET:/model/info` — lifecycle: **proposed** — evidence: ["ml-service/app.py:409","ml-service/app.py:26","ml-service/app.py:427"]
- **row** `listener:ml-reserve:POST:/predict` — lifecycle: **proposed** — evidence: ["ml-service/app.py:265","ml-service/app.py:26","ml-service/app.py:427"]
- **row** `listener:ml-reserve:POST:/train` — lifecycle: **proposed** — evidence: ["ml-service/app.py:201","ml-service/app.py:26","ml-service/app.py:427"]
- **row** `listener:worker-health:GET:/health` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:125","workers/health-server.ts:204"]
- **row** `listener:worker-health:GET:/live` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:141","workers/health-server.ts:204"]
- **row** `listener:worker-health:GET:/metrics` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:177","workers/health-server.ts:204"]
- **row** `listener:worker-health:GET:/ready` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:150","workers/health-server.ts:204"]
- **row** `listener:worker-health:GET:/stats` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:189","workers/health-server.ts:204"]
- **row** `scheduler:artifact-retention` — lifecycle: **proposed** — evidence: ["server/routes.ts:44"]
- **row** `scheduler:internal-analysis-checkpoint` — lifecycle: **proposed** — evidence: ["server/routes.ts:46"]
- **row** `scheduler:variance-alert-automation` — lifecycle: **proposed** — evidence: ["server/routes.ts:42"]
- **row** `worker:backtesting-jobs` — lifecycle: **proposed** — evidence: ["server/queues/backtesting-queue.ts:299","server/queues/backtesting-queue.ts:310","server/queues/registry.ts:backtesting"]
- **row** `worker:capital-call-status` — lifecycle: **proposed** — evidence: ["server/workers/capital-call-status-worker.ts:106","server/workers/capital-call-status-worker.ts:119"]
- **row** `worker:cohort-calc` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:cohort-calc","server/routes/fund-config.ts:31","workers/cohort-worker.ts:49"]
- **row** `worker:economics-calc` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:economics-calc"]
- **row** `worker:error-tracking` — lifecycle: **proposed** — evidence: ["server/middleware/asyncErrorHandler.ts:15"]
- **row** `worker:fund-scenario-calc` — lifecycle: **proposed** — evidence: ["server/queues/fund-scenario-calc-worker-init.ts:50","server/queues/registry.ts:fund-scenario-calc","server/services/fund-scenario-calc-queue-service.ts:29","workers/fund-scenario-calc-worker.ts:51"]
- **row** `worker:lp-report-generation` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:report","server/queues/report-generation-queue.ts:316","server/queues/report-generation-queue.ts:331"]
- **row** `worker:lp-view-refresh` — lifecycle: **proposed** — evidence: ["server/workers/lp-materialized-view-refresh.ts:100","server/workers/lp-materialized-view-refresh.ts:113"]
- **row** `worker:monte-carlo-simulations` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:simulation","server/queues/simulation-queue.ts:139","server/queues/simulation-queue.ts:154"]
- **row** `worker:pacing-calc` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:pacing-calc","server/routes/fund-config.ts:29","workers/pacing-worker.ts:30"]
- **row** `worker:reserve-calc` — lifecycle: **proposed** — evidence: ["server/queues/registry.ts:reserve-calc","server/routes/fund-config.ts:27","workers/reserve-worker.ts:13"]
- **row** `worker:scenario-generation` — lifecycle: **proposed** — evidence: ["server/services/CacheWarmingService.ts:48","server/workers/scenarioGeneratorWorker.ts:203"]
- **row** `ws:setup-websocket-servers` — lifecycle: **proposed** — evidence: ["server/routes.ts:153"]

### Runtime exclusions

- None.

### Listener dispositions

- **listener product-surface** `dockerfile-ml-reserve` — lifecycle: **proposed** — evidence: ["ml-service/Dockerfile:35"]
- **listener product-surface** `dockerfile-railway` — lifecycle: **proposed** — evidence: ["Dockerfile.railway:41","Dockerfile.railway:45"]
- **listener product-surface** `dockerfile-root` — lifecycle: **proposed** — evidence: ["Dockerfile:56","Dockerfile:65"]
- **listener product-surface** `dockerfile-simple` — lifecycle: **proposed** — evidence: ["Dockerfile.simple:32","Dockerfile.simple:36"]
- **listener product-surface** `dockerfile-worker` — lifecycle: **proposed** — evidence: ["Dockerfile.worker:158","Dockerfile.worker:170"]
- **listener product-surface** `ml-reserve` — lifecycle: **proposed** — evidence: ["ml-service/app.py:26","ml-service/app.py:427"]
- **listener product-surface** `server-bootstrap` — lifecycle: **proposed** — evidence: ["server/bootstrap.ts:47","server/bootstrap.ts:54"]
- **listener product-surface** `server-index` — lifecycle: **proposed** — evidence: ["server/index.ts:13"]
- **listener non-product-tooling** `tooling-scripts-ai-tools-metrics-server-js` — lifecycle: **proposed** — evidence: [{"file":"scripts/ai-tools/metrics-server.js","line":52,"pattern":"node-listen","text":"const server = app.listen(PORT, () => {"}]
- **listener non-product-tooling** `tooling-scripts-orchestrate-ts` — lifecycle: **proposed** — evidence: [{"file":"scripts/orchestrate.ts","line":54,"pattern":"node-listen","text":"app.listen(PORT, () => {"}]
- **listener non-product-tooling** `tooling-server-observability-metrics-demo-ts` — lifecycle: **proposed** — evidence: [{"file":"server/observability/metrics-demo.ts","line":16,"pattern":"node-listen","text":"app.listen(port, () => {"}]
- **listener product-surface** `worker-health` — lifecycle: **proposed** — evidence: ["workers/health-server.ts:204"]

### Dormant candidate dispositions

- **dormant candidate** `client/src/pages/admin/telemetry.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/analytics.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/CompanyDetail.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/CustomFields.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/ExitRecyclingStep.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/InvestmentRoundsStep.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/investments-table.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/investments.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/index.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/KpiDefinitionModal.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/KpiTabs.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/panes/AnalyticsPane.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/panes/OverviewPane.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/panes/SettingsPane.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/tabs-config.ts` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/useKpiManager.ts` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-manager/useModalState.ts` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/kpi-submission.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/notion-integration.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/partial-sales.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/planning.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/portfolio-constructor.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/return-the-fund.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/secondary-market.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/time-travel.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/cash.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/company.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/exits.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/insights.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/partners.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/portfolio.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/scenarios.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/v2/today.tsx` — lifecycle: **proposed** — evidence: —
- **dormant candidate** `client/src/pages/WaterfallStep.tsx` — lifecycle: **proposed** — evidence: —

### Orphan resolutions

- **orphan** `dormant:client/src/pages/admin/telemetry.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/analytics.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/CompanyDetail.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/CustomFields.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/ExitRecyclingStep.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/InvestmentRoundsStep.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/investments-table.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/investments.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/index.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/KpiDefinitionModal.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/KpiTabs.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/panes/AnalyticsPane.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/panes/OverviewPane.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/panes/SettingsPane.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/tabs-config.ts` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/useKpiManager.ts` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-manager/useModalState.ts` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/kpi-submission.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/notion-integration.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/partial-sales.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/planning.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/portfolio-company-detail.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/portfolio-constructor.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/return-the-fund.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/secondary-market.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/time-travel.tsx` — lifecycle: **proposed** — evidence: —
- **orphan** `dormant:client/src/pages/WaterfallStep.tsx` — lifecycle: **proposed** — evidence: —

### Optional absence evidence

- **absence** `wp-l4` — lifecycle: **proposed** — evidence: Authoring-time absence; G1 approval required before closed phase.
