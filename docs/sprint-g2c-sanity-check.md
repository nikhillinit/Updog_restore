---
status: ACTIVE
last_updated: 2026-01-19
---

# Sprint G2C Sanity Check - FE/BE Lead Review

## Quick Overview
- **Total Capacity:** 21.5 ideal-days across 16 stories
- **Sprint Duration:** 7 days (Day 15-21)
- **Sprint Capacity:** 21 ideal-days (2.5 day buffer included)

## Owner & Estimate Review Needed

### Frontend-Heavy Stories (Please Review)
- **G2C-005: Accessibility Score ≥90** - Frontend Engineer, 2 days
  - *Sanity Check:* Lighthouse + axe-core compliance work
- **G2C-006: Validate Core User Flows** - QA Engineer, 1.5 days
  - *Sanity Check:* E2E test development and execution

### Backend-Heavy Stories (Please Review)  
- **G2C-001: Resolve Sev-1 Defects** - Senior Engineer, 2 days
  - *Sanity Check:* Critical bug fixes across backend systems
- **G2C-007: Configure Burn-Rate SLO Alerts** - SRE Engineer, 1 day
  - *Sanity Check:* Prometheus/Grafana alert configuration

### DevOps/Infrastructure Stories
- **G2C-003: PR-Level Quality Gates** - DevOps Engineer, 1 day
  - *Sanity Check:* CI/CD pipeline modifications
- **G2C-008: Performance Regression Suite** - Performance Engineer, 2 days
  - *Sanity Check:* Test automation and baseline establishment

## Questions for FE/BE Leads
1. Do the assigned owners have availability for these specific timeframes?
2. Are the estimates realistic given current technical debt?
3. Any dependencies between stories that could cause blockers?
4. Should we adjust P1/P2 story priorities based on team capacity?

## Risk Assessment
- **High Risk:** G2C-001 (Sev-1 fixes) - Unknown complexity
- **Medium Risk:** G2C-005 (Accessibility) - Potential cross-browser issues  
- **Low Risk:** Most P1/P2 stories can be deferred if P0s overrun

**Action Required:** Please review and confirm by EOD today for tomorrow's planning session.
