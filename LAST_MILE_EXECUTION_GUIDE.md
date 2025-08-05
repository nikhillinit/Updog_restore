# 🎯 **Last-Mile Execution Guide: 30-Minute Migration**

Everything framed as *bite-size actions* you can paste into a terminal or ticketing tool.  
Total planned **keyboard time ≈ 30 minutes** spread across two working days.

---

## 0  One-Time Prep (~3 min – do once per workstation)

```bash
# Shell profile — copy/paste once
cat <<'EOS' >> ~/.bash_aliases    # or ~/.zshrc
alias preflight='dev:preflight'   # runs git clean + gh auth + npm ci
alias stress='scripts/stress-summary.sh'
alias migrate='bash scripts/async-migrate.sh'
EOS
source ~/.bash_aliases
```

---

## 1  Kick-off Block A (~10 min)

| Step | Command | Success Gate |
| ---- | ------- | ------------ |
| 1.1  | `preflight` | All ✅ printed |
| 1.2  | `migrate fund-setup.tsx cohort-worker.ts` | Opens PR in browser, template checklist visible |
| 1.3  | Click **Merge** once Guardian badge turns green | PR auto-squashed; Guardian yellow → green |

> Behind the scenes: `.async-migration-active` is already included, bench & stress start automatically.

---

## 2  Guardian Background Work

*Duration:* ~8 min CI + overnight stress; **no keyboard time**.  
You'll get an e-mail **only if** a check fails or auto-rollback fires—no dashboard babysitting.

---

## 3  Morning Block B (~5 min)

```bash
stress          # auto-detects last night's folder
```

*Decision tree*

| Condition | Action |
| --------- | ------ |
| P95 **> 400 ms** at any concurrency ≤ 8 | Stop. Investigate hot loop before more PRs. |
| P95 ≤ 300 ms @ C = 8 | `auto-tune-concurrency` one-liner *(5 s)* |
| Else | Do nothing |

---

## 4  Afternoon Block C (~15 min)

1. **Second migration**

   ```bash
   migrate charts/*.tsx slackService.ts
   ```

   Confirm PR merged green.

2. **Immediate rollback drill**

   ```bash
   ./scripts/verify-rollback.sh    # waits ~5 min
   ```

   > Pass criteria: branch `rollback/auto-…` appears → Guardian green again.

3. **If this was the final hot-path file**

   ```bash
   git rm .async-migration-active
   git commit -m "chore: disable async bench"
   git push && gh pr create --fill --merge --squash
   ```

---

## 5  Evening Block D (~3 min total)

*This is now fully automated via the scheduled workflow and CODEOWNERS PR.*

| Already automated | Manual |
| ----------------- | ------ |
| ESLint warn → error (`promote-eslint.yml`) | GitHub UI: Settings → Branches → **Require Guardian** check (20 s) |

---

## 6  Day +3 — CODEOWNERS Protection

The PR created by the one-liner is already merged. Verify in UI that:

```
/.perf-budget.json  @<your-handle>
```

appears under *Code owners*. (30 s)

---

## 7  Passive → GA

*Duration:* 7 × 24 h of Guardian green.  
You only respond if:

* `error_rate` ≥ 1 %  
* perf-budget breach  
* circuitBreaker.trips > 0  

Both conditions trigger GitHub notifications by default.

---

## 8  GA Tag Block E (~2 min)

```bash
git pull origin main
git tag -a v1.0-ga -m "Async migration GA $(date +%F)"
git push origin v1.0-ga
gh release create v1.0-ga --generate-notes
```

---

## 9  Post-GA (Optional 5-minute polish)

* Add badge snippet to README  
* Run **dry-run rollback** on a throw-away branch for the incident-playbook demo  
* Capture a screenshot of the green Guardian badge for your release notes  

---

### Edge-Case Guardrails Recap

| Guard | How it triggers | Your save |
| ----- | --------------- | --------- |
| **GitHub auth** | preflight exits early | avoids rollback branch push failure |
| **OS notification guard** | `command -v osascript` check | Linux CI safe |
| **Non-enterprise PR merge** | `--auto` flag dropped | no CLI error |
| **Laptop sleep** | ESLint promotion scheduled in CI | rule promotion guaranteed |

---

## You're Good to Ship

* 30 minutes total typing  
* Zero vendor lock-in  
* Rollback proven *before* prod traffic  
* Metrics + breaker + cost all enforced by Guardian  

**Next literal keystroke:**

```bash
preflight
```

Once that prints **"🚀 Ready for 30-minute migration!"** you're officially in execution mode.
