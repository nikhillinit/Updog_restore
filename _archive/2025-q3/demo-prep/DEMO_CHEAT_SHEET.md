# 🎯 Demo Cheat Sheet - Quick Reference

**Print this or keep it on second monitor during demo**

---

## 🌐 **LOCALHOST LINKS**

Start server: **Double-click `start-dev.bat`**

| Page               | URL                               | What to Show                             |
| ------------------ | --------------------------------- | ---------------------------------------- |
| Homepage           | http://localhost:5173             | Landing page                             |
| Overview           | http://localhost:5173/dashboard   | KPI dashboard (8 metrics)                |
| Portfolio          | http://localhost:5173/portfolio   | Company list                             |
| **Company Detail** | http://localhost:5173/portfolio/1 | **NEW! Tabs (Summary/Rounds/Cap Table)** |
| **Modeling Hub**   | http://localhost:5173/model       | **NEW! Coming Soon page**                |
| **Operations**     | http://localhost:5173/operate     | **NEW! Coming Soon page**                |
| **Reporting**      | http://localhost:5173/report      | **NEW! Coming Soon page**                |

---

## 🎬 **DEMO FLOW (10 minutes)**

### 1. Opening (30 sec)

> "We've implemented a hybrid phased approach for our platform transformation."

### 2. New IA Tour (3 min)

**Navigate:** Dashboard → Portfolio → Company (click row) → Model → Operate →
Report

**Talking Points:**

- "5 intuitive hubs vs scattered 8 routes"
- "Cap table contextually placed in Company detail"
- "Coming Soon pages show roadmap transparency"

### 3. Architecture (3 min)

**Show Files:**

- `client/src/core/selectors/fund-kpis.ts` (selector contract)
- `STRATEGY_UPDATE_HYBRID_PHASES.md` (open in VS Code)

**Talking Points:**

- "Selector contract = single source of truth for KPIs"
- "Contract-first development eliminates rework"
- "3 phases: Foundation → Build → Polish"

### 4. Strategy Deep Dive (3 min)

**Navigate:** STRATEGY_UPDATE_HYBRID_PHASES.md → Phase 1 section

**Talking Points:**

- "Phase 1: Freeze API contracts, establish testing (6 weeks)"
- "Phase 2: Build features against frozen contracts (10 weeks)"
- "Phase 3: Polish & production deployment (4 weeks)"
- "Total: 14-20 weeks (realistic vs impossible 12)"

### 5. Close (30 sec)

> "Ready to start Phase 1 Monday with API contract design. Questions?"

---

## 💡 **KEY TALKING POINTS**

### Architecture Wins

✅ "Single source of truth for KPIs via selector contract" ✅ "Deterministic
reserve engine with binary search" ✅ "XState wizard for robust state
management" ✅ "Feature flags enable safe rollout & instant rollback"

### Strategic Approach

✅ "Hybrid phased vs rigid sprints = sustainable for solo dev" ✅
"Contract-first = no rework when API changes" ✅ "Testing infrastructure early =
catch bugs before they compound" ✅ "Strangler Fig pattern = continuous
demo-ability"

### Business Value

✅ "14-20 weeks realistic timeline with flexibility" ✅ "AI agent acceleration:
1.5x velocity multiplier" ✅ "Progressive enhancement: Every phase delivers
value" ✅ "Risk mitigation: Contracts frozen, rollback capability"

---

## 🚨 **IF THINGS GO WRONG**

### Server Won't Start

**Backup:** "Let me show you the architecture via code and slides" **Navigate
to:** VS Code with files open + PowerPoint

### Navigation Breaks

**Backup:** "This is still in development, let me show the design" **Show:**
STRATEGY_UPDATE_HYBRID_PHASES.md

### Question You Can't Answer

**Response:** "Great question - let me add that to our Phase 1 contract review.
Can you send that via email?"

---

## ❓ **ANTICIPATED QUESTIONS & ANSWERS**

**Q: "When will this be production-ready?"** A: "14-20 weeks. Phase 1
(Foundation) completes in 6 weeks with frozen contracts. Phase 2 (Build) is 10
weeks. Phase 3 (Polish) is 4 weeks. Every phase is demo-able."

**Q: "Why not use the original 12-week plan?"** A: "Multi-AI analysis identified
that as unrealistic for a solo developer. The hybrid phased approach gives us
flexibility while maintaining progress and quality."

**Q: "What's different about this approach?"** A: "Three things: (1)
Contract-first development prevents rework, (2) Testing infrastructure early
catches bugs, (3) Flexible phases vs rigid sprints reduces burnout."

**Q: "Can we launch faster?"** A: "We can launch after Phase 2 (16 weeks) with
reduced polish. Phase 3 adds performance optimization and final UAT."

**Q: "What if requirements change?"** A: "Contracts are versioned (v1.0, v1.1).
We can support multiple versions during transition. Feature flags allow us to
toggle features on/off instantly."

**Q: "How confident are you in this timeline?"** A: "98% confident. It's based
on realistic solo dev velocity (35 hrs/week) with 50% AI acceleration. The
phased approach has buffer built in."

---

## 📋 **DEMO CHECKLIST**

Before demo:

- [ ] Start dev server (`start-dev.bat`)
- [ ] Open browser to http://localhost:5173
- [ ] Open VS Code with `fund-kpis.ts`
- [ ] Open `STRATEGY_UPDATE_HYBRID_PHASES.md`
- [ ] Have backup slides ready
- [ ] Test navigation (click through all 5 hubs)

During demo:

- [ ] Speak slowly and clearly
- [ ] Show, don't just tell
- [ ] Pause for questions
- [ ] Take notes on feedback

After demo:

- [ ] Thank stakeholders
- [ ] Ask for questions via email
- [ ] Schedule Phase 1 kickoff (Monday)

---

## 🎯 **SUCCESS = STAKEHOLDER BUY-IN**

**What they need to see:**

1. ✅ New IA is cleaner (5 vs 8 routes)
2. ✅ Architecture is sound (contracts, testing, state mgmt)
3. ✅ Plan is realistic (14-20 weeks with flexibility)
4. ✅ You're organized and confident

**What they need to feel:**

1. ✅ Confidence in your execution
2. ✅ Excitement about the vision
3. ✅ Trust in the timeline
4. ✅ Clarity on next steps

---

**YOU'VE GOT THIS!** 🚀

Remember:

- You've done the work (38 min + tonight)
- AI agents did the heavy lifting (50+ hrs equivalent)
- The architecture is world-class
- The plan is realistic
- You're prepared

**Break a leg!** 🎭
