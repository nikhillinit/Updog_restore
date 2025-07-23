# Memory Commit Strategy

## When to Commit to Memory (Aligned with Git Commits)

### 1. Mini Milestone = Git Commit = Memory Update
```bash
# Complete feature/fix
git add .
git commit -m "feat: add Monte Carlo simulation endpoint"

# Immediately run:
/log-change  # Updates CHANGELOG.md
```

### 2. What Goes Where at Each Commit

| Memory Type | Update Frequency | Example |
|-------------|-----------------|---------|
| **CHANGELOG.md** | Every commit | "Fixed TypeScript error in FundConfig" |
| **DECISIONS.md** | Major decisions only | "Chose Redis over in-memory cache" |
| **CLAUDE.md** | Rarely - only architecture changes | "Added Redis to tech stack" |
| **cheatsheets/** | New workflows/patterns | "Created monte-carlo-setup.md" |

### 3. Decision Tree at Each Commit

```
At each git commit, ask:
│
├─ Did I fix/add/change something?
│  └─ YES → Update CHANGELOG.md
│
├─ Did I make an architectural decision?
│  └─ YES → Update DECISIONS.md
│
├─ Did I change the core architecture?
│  └─ YES → Update CLAUDE.md (RARE!)
│
└─ Did I create a reusable workflow?
   └─ YES → Create/update cheatsheet
```

### 4. Practical Examples

#### Commit 1: Bug Fix
```bash
git commit -m "fix: resolve chart rendering issue"
/log-change
# → Updates CHANGELOG.md only
```

#### Commit 2: New Feature
```bash
git commit -m "feat: add Redis caching"
/log-change
/log-decision  # Why Redis?
# → Updates CHANGELOG.md + DECISIONS.md
# → CLAUDE.md stays clean!
```

#### Commit 3: Architecture Change
```bash
git commit -m "refactor: migrate from REST to GraphQL"
/log-change
/log-decision
/update-context  # Major architecture change
# → Updates all three, but CLAUDE.md gets only one line
```

### 5. Keep CLAUDE.md Clean

**DON'T** add to CLAUDE.md:
- Bug fixes
- Feature additions
- Performance tweaks
- Implementation details

**DO** add to CLAUDE.md (rarely):
- New major dependency (e.g., "Added GraphQL")
- Architecture pattern change (e.g., "Moved to microservices")
- Critical convention change (e.g., "All components now use composition pattern")

### 6. Commit Message → Memory Update Mapping

```bash
# Commit prefix determines memory action:
fix:  → CHANGELOG.md only
feat: → CHANGELOG.md (+ DECISIONS.md if architectural)
refactor: → CHANGELOG.md + DECISIONS.md
chore: → CHANGELOG.md only (if significant)
docs: → Usually no memory update needed
perf: → CHANGELOG.md (+ cheatsheet if new technique)
```

### 7. Weekly CLAUDE.md Review

Instead of updating CLAUDE.md at each commit:
1. Let changes accumulate in CHANGELOG/DECISIONS
2. Weekly: Run `/update-context` 
3. Claude reviews the week's changes
4. Suggests only truly architectural updates
5. Keeps CLAUDE.md high-signal

## Summary

✅ **Every git commit** → Update CHANGELOG.md
✅ **Architectural decisions** → Update DECISIONS.md  
✅ **New workflows** → Create cheatsheets
❌ **Rarely touch CLAUDE.md** → Only for core architecture changes

This keeps your commit-to-memory pattern while preventing CLAUDE.md bloat!