# Sprint G2C Master Checklist
**Use this as your primary coordination document**

## Phase 1: Import & Sanity-Check ✅

### Jira/Linear Import
- [ ] **Import sprint-g2c-backlog.md into Jira/Linear**
  - All 16 stories with proper Epic mapping (includes 2 new performance optimizations)
  - Estimates, acceptance criteria, and owners preserved
  - Links to exit criteria maintained

## Real-Time Sprint Burn-Down
- At each daily standup, record actual ideal-days spent vs time elapsed.
- At Day 17 standup, compare remaining estimated work to remaining capacity; if work > capacity, trigger mid-sprint scope-check.

### FE/BE Lead Review  
- [ ] **Share sprint-g2c-sanity-check.md with FE/BE leads**
- [ ] **Confirm owner availability and estimate accuracy**
- [ ] **Identify any dependency blockers**
- [ ] **Get sign-off on risk assessment**

**Deadline:** EOD today for tomorrow's planning session

---

## Phase 2: Sprint Planning Session 📅

### Pre-Meeting Setup
- [ ] **Send sprint-g2c-planning-agenda.md to all attendees**
- [ ] **Book 60-minute conference room**
- [ ] **Prepare current Sev-1/Sev-2 defect counts**
- [ ] **Set up sprint board with imported stories**

### Meeting Execution
- [ ] **Review all P0 stories for scope clarity (35 min)**
- [ ] **Triage P1/P2 stories based on capacity (15 min)**
- [ ] **Define PR-gate override rules (3 min)**
- [ ] **Assign final story owners and commitments (2 min)**

### Post-Meeting Actions
- [ ] **Update story assignments in Jira/Linear**
- [ ] **Send meeting summary to stakeholders**
- [ ] **Proceed to ceremony calendar setup**

**Deadline:** Complete planning session within 24 hours

---

## Phase 3: Ceremony Calendar Holds 📋

### Calendar Creation
- [ ] **Create recurring "Gate G2C War-Room" standup (Day 15-21)**
  - 15 minutes daily
  - Full sprint team
  - War room + video link

- [ ] **Block Day 16 bug-bash session**
  - 90 minutes
  - 8+ cross-functional participants  
  - Large conference room with screens

- [ ] **Schedule Day 18 mid-sprint check**
  - 30 minutes
  - Sprint team + stakeholders
  - Progress review and scope adjustments

### Setup Verification
- [ ] **Send calendar invites to all team members**
- [ ] **Book physical meeting rooms**
- [ ] **Configure video conferencing links**
- [ ] **Create #sprint-g2c-alerts Slack channel**

**Deadline:** All calendar holds created today

---

## Phase 4: Automation Kickoff 🤖

### Day 15 Immediate Actions
- [ ] **GitHub Actions Jobs Setup (DevOps Engineer - 4 hours)**
  - Lighthouse CI pipeline (90 score threshold)
  - axe-core accessibility checks
  - Performance regression detection

- [ ] **Session Replay Script Setup (Frontend Engineer - 2 hours)**
  - Tool selection and staging integration
  - Privacy settings and error capture
  - User interaction monitoring

- [ ] **Staging Environment Validation (SRE Engineer - parallel)**
  - Database and API health checks
  - Authentication and integrations
  - Monitoring stack operational

### Alert Configuration
- [ ] **Configure burn-rate SLO alerts**
  - Fast burn: 2% in 1h (critical)
  - Slow burn: 10% in 6h (warning)  
  - Long-term: 90% in 3d (warning)

- [ ] **Set up Slack/PagerDuty integration**
  - #sprint-g2c-alerts webhook
  - On-call rotation for sprint
  - Escalation procedures documented

### Pre-Bug-Bash Verification (Day 15 Evening)
- [ ] **Test GitHub Actions quality gates**
- [ ] **Verify session replay capturing**
- [ ] **Trigger test alerts and confirm delivery**

**Deadline:** All automation operational by end of Day 15

---

## Phase 5: Stakeholder Alignment 📊

### Executive Communication
- [ ] **Share sprint-g2c-stakeholder-summary.md with PM/PO**
- [ ] **Present to executive sponsors**
- [ ] **Get confirmation on success metrics**
- [ ] **Clarify escalation authority and approval processes**

### Success Metrics Setup
- [ ] **Configure real-time defect tracking dashboard**
- [ ] **Set up user journey completion monitoring**
- [ ] **Establish accessibility score tracking**
- [ ] **Create progress tracking board for stakeholders**

**Deadline:** Stakeholder alignment complete by Day 15

---

## Daily Execution Checkpoints

### Day 15 (Sprint Start)
- ✅ All setup phases complete
- ✅ Automation operational
- ✅ Team aligned on commitments

### Day 16 (Bug Bash)
- [ ] Execute 90-minute bug bash session
- [ ] Triage all discovered issues within 2 hours
- [ ] Update stakeholders on results

### Day 18 (Mid-Sprint Check)
- [ ] Review P0 story progress
- [ ] Assess risk and scope adjustments
- [ ] Communicate status to stakeholders

### Day 21 (Sprint End)
- [ ] Verify all success criteria met
- [ ] Deploy to production with validated UX
- [ ] Conduct sprint retrospective

---

## Success Criteria Validation

### Quality Gates ✅
- [ ] Zero Sev-1 defects in production
- [ ] All Sev-2 defects resolved or downgraded
- [ ] PR-level quality gates active and enforcing

### User Experience ✅  
- [ ] ≥95% user journey completion rate
- [ ] ≥90 Lighthouse accessibility score
- [ ] Session replay operational with 5+ recorded sessions

### Operational Excellence ✅
- [ ] SLO burn-rate alerts configured and tested
- [ ] Bug bash completed with 8+ participants
- [ ] Documentation and runbooks updated

---

## Emergency Procedures

### If P0 Stories At Risk
1. **Day 16:** Escalate to Engineering Manager
2. **Day 17:** Escalate to Product Owner for scope reduction
3. **Day 18:** Escalate to VP Engineering for resource augmentation

### If Critical Blocker Discovered
1. **Immediate:** Post in #sprint-g2c-alerts
2. **Within 1 hour:** Escalate to on-call engineer
3. **Within 4 hours:** Executive sponsor notification

### If Quality Gates Fail
1. **Document bypass reason and approver**
2. **Create immediate remediation plan**
3. **Post-sprint process improvement action**

---

## File References
- `sprint-g2c-backlog.md` - Complete story breakdown for import
- `sprint-g2c-sanity-check.md` - FE/BE lead review document  
- `sprint-g2c-planning-agenda.md` - 60-minute planning session guide
- `sprint-g2c-ceremony-calendar.md` - Calendar setup instructions
- `sprint-g2c-automation-kickoff.md` - Technical setup guide
- `sprint-g2c-stakeholder-summary.md` - Executive alignment document

## Next Steps
- [ ] **Schedule Day 17 scope-check** as part of daily standup agenda
- [ ] **Set up burn-down tracking** in sprint board for daily updates

**Status:** ⚡ Ready to execute - all planning documents created and ready for implementation.
