# Claude Code Standard Workflow

## 🔴 MANDATORY FIRST STEP (Before ANY Task)

```
1. Read CAPABILITIES.md
2. Identify existing solutions
3. Check CHANGELOG for similar past work
```

## 📋 Task Workflow (After Capability Check)

### Phase 1: Informed Planning

1. **Check capabilities** - What tools already exist for this?
2. **Create informed TodoWrite** - Tasks that USE existing tools
3. **Verify approach** - Would existing agents handle this better?

### Phase 2: Execution

1. **Mark in_progress** - One task at a time
2. **Use existing agents** - Via Task tool
3. **Mark completed** - Immediately when done
4. **Next task** - Continue through list

## ❌ NEVER DO THIS:

- Create todos to build things that already exist
- Skip checking CAPABILITIES.md
- Implement from scratch without checking
- Ignore existing agents

## ✅ ALWAYS DO THIS:

- Check CAPABILITIES.md FIRST
- Use existing agents via Task tool
- Run agents in parallel when possible
- Update CAPABILITIES.md when adding new tools

## Example Workflow

**User Request:** "Analyze our fund's performance"

**Step 1: Check Capabilities**

```
Read CAPABILITIES.md
Found: waterfall-specialist, test-automator, perf-guard
```

**Step 2: Create Informed Todos**

```
TodoWrite:
- [ ] Use waterfall-specialist for carry analysis
- [ ] Use perf-guard for performance metrics
- [ ] Generate report with docs-architect
```

**Step 3: Execute Using Existing Tools**

```
Task(waterfall-specialist, ...)
Task(perf-guard, ...)
Task(docs-architect, ...)
```

---

**This workflow ensures we leverage existing capabilities instead of recreating
them.**
