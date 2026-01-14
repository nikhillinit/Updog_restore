# RACI Matrix - Updog_restore Development Strategy

## Legend

- **R** = Responsible (does the work)
- **A** = Accountable (decision maker, one per item)
- **C** = Consulted (provides input)
- **I** = Informed (kept in the loop)

## System Components Ownership

| Component                  | Responsible           | Accountable   | Consulted         | Informed     |
| -------------------------- | --------------------- | ------------- | ----------------- | ------------ |
| **Synthetic Tests**        | QA Engineer           | Platform Lead | DevOps, Product   | All Teams    |
| **Security (CSP/HSTS)**    | Security Engineer     | Platform Lead | DevOps, Backend   | All Teams    |
| **Database & Migrations**  | Backend Engineer      | Backend Lead  | Platform, DevOps  | Product      |
| **API Design**             | Backend Engineer      | Backend Lead  | Frontend, Product | QA           |
| **Fund Setup Wizard**      | Frontend Engineer     | Product Lead  | UX, Backend       | All Teams    |
| **Reserves Engine**        | Backend Engineer      | Product Lead  | Data Science, QA  | Frontend     |
| **Feature Flags**          | Platform Engineer     | Platform Lead | Backend, Frontend | All Teams    |
| **Performance Monitoring** | DevOps Engineer       | Platform Lead | Backend, Frontend | Product      |
| **CI/CD Pipeline**         | DevOps Engineer       | Platform Lead | All Engineers     | Product      |
| **Documentation**          | Tech Writer/Engineers | Product Lead  | All Teams         | Stakeholders |

## Gate Execution Ownership

| Gate                        | Primary Owner     | Secondary Owner   | Consulted         | Informed          |
| --------------------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| **Gate 0: Triage**          | Platform Lead     | DevOps Engineer   | All Engineers     | Product           |
| **Gate A: Critical Path**   | Platform Lead     | Security Engineer | QA, Backend       | All Teams         |
| **Gate C1: Feature Flags**  | Platform Engineer | Backend Engineer  | Frontend, QA      | Product           |
| **Gate B1: Wizard**         | Frontend Lead     | Product Designer  | Backend, QA       | Stakeholders      |
| **Gate B2: Reserves v1.1**  | Backend Lead      | Product Manager   | Data Science, QA  | Frontend          |
| **Gate C2: Infrastructure** | Platform Lead     | DevOps Engineer   | Backend, Security | All Teams         |
| **Gate D: Snapshots**       | Backend Lead      | Database Engineer | Platform, Product | Frontend          |
| **Gate E: API Versioning**  | Backend Lead      | Platform Engineer | Frontend, Product | External Partners |
| **Gate F: Performance**     | Platform Lead     | DevOps Engineer   | All Engineers     | Product           |

## Key Activities Ownership

| Activity                  | Responsible          | Accountable   | Consulted                  | Informed          |
| ------------------------- | -------------------- | ------------- | -------------------------- | ----------------- |
| **Fix Failing Tests**     | QA Engineer          | QA Lead       | Developers who wrote tests | Platform          |
| **Create testIds.ts**     | Frontend Engineer    | Frontend Lead | QA                         | All Frontend      |
| **Implement SECURITY.md** | Security Engineer    | Platform Lead | Legal, Product             | All Teams         |
| **Baseline Metrics**      | DevOps Engineer      | Platform Lead | Backend, Frontend          | Product           |
| **Migration Strategy**    | Database Engineer    | Backend Lead  | Platform, DevOps           | Product           |
| **OpenAPI Documentation** | Backend Engineer     | Backend Lead  | Frontend, Product          | External Partners |
| **Performance Budgets**   | Performance Engineer | Platform Lead | All Engineers              | Product           |
| **Rollback Procedures**   | DevOps Engineer      | Platform Lead | All Engineers              | Support Team      |
| **Monitoring Dashboards** | DevOps Engineer      | Platform Lead | All Engineers              | Product           |
| **Release Gates**         | Release Manager      | Platform Lead | QA, Product                | All Teams         |

## Decision Authority Matrix

| Decision Type                   | Decision Maker               | Consulted                         | Informed          |
| ------------------------------- | ---------------------------- | --------------------------------- | ----------------- |
| **Gate Progression**            | Platform Lead + Product Lead | Tech Leads, QA Lead               | All Teams         |
| **Rollback Trigger**            | On-Call Engineer             | Platform Lead                     | Product, Support  |
| **Feature Flag Changes**        | Product Manager              | Platform Lead, Feature Owner      | All Teams         |
| **Security Policy Changes**     | Security Lead                | Platform Lead, Legal              | All Teams         |
| **API Breaking Changes**        | Backend Lead                 | Product, Frontend Lead            | External Partners |
| **Performance Budget Override** | Platform Lead                | Product Lead, Engineering Manager | All Teams         |
| **Resource Reallocation**       | Engineering Manager          | Tech Leads, Product               | All Teams         |

## Communication Responsibilities

| Communication Type         | Owner           | Frequency    | Audience               |
| -------------------------- | --------------- | ------------ | ---------------------- |
| **Gate Status Update**     | Platform Lead   | Weekly       | All Stakeholders       |
| **Blocker Escalation**     | Tech Leads      | As Needed    | Engineering Manager    |
| **Security Incidents**     | Security Lead   | Immediate    | Platform Lead, Product |
| **Performance Regression** | DevOps Lead     | Daily        | Platform, Backend      |
| **Release Notes**          | Product Manager | Per Release  | All Stakeholders       |
| **Post-Mortem Reports**    | Incident Owner  | Within 48hrs | All Teams              |

## Escalation Path

1. **Technical Issues**: Developer → Tech Lead → Platform Lead → Engineering
   Manager
2. **Security Issues**: Anyone → Security Lead → Platform Lead → CTO
3. **Product Issues**: Anyone → Product Manager → Product Lead → Product VP
4. **Resource Issues**: Tech Lead → Engineering Manager → VP Engineering

## Role Assumptions

For execution with current resources:

- **1 Developer Mode**: Developer assumes all R responsibilities, Platform Lead
  is A for all
- **2 Developer Mode**: Split R between Platform and Product focus areas
- **3+ Developer Mode**: Distribute R per matrix, maintain single A per
  component

## Review Schedule

- **Weekly**: Activity progress and blockers
- **Per Gate**: Role effectiveness and adjustments needed
- **Monthly**: Overall RACI matrix optimization

---

_Effective Date: 2025-08-26_ _Last Updated: 2025-10-06_ _Next Review: Gate C1
Completion_ _Version: 1.0_ _Note: Matrix validated, Gate A ownership assignments
proved effective_
