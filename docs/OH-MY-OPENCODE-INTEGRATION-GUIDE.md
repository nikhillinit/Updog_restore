# Oh-My-OpenCode Integration Guide

**Created**: 2026-01-07 **Status**: EXPERIMENTAL (1-week validation period)
**Decision Gate**: 2026-01-14

---

## Executive Summary

This guide documents the integration of **oh-my-opencode** into the Updog
project as a replacement for manual MCP multi-AI collaboration. The framework
provides **automatic task-based delegation** to multiple AI models (Claude Opus,
GPT-4o, Gemini 2.5 Pro) with **background parallelization** and **cost
optimization**.

**Key Benefits**:

- **Zero-overhead delegation** - No more "ask Gemini to review" prompts
- **5x background concurrency** - Parallel agent execution
- **Automatic model selection** - Optimal AI for each task type
- **Cost optimization** - Cheap models (Gemini Flash) for simple tasks

**Installation**: [COMPLETE] (2026-01-07 13:53) **Next Steps**: Authenticate ->
Test -> Validate -> Decide

---

## 1. What We Installed

### Core Framework

- **oh-my-opencode** v2.8.3 - Agent orchestration harness
- **Sisyphus** (Claude Opus 4.5) - Main orchestrator
- **Oracle** (GPT-4o) - Architecture design, debugging
- **Librarian** (Gemini 2.5 Pro) - Documentation, research
- **Explore** (Gemini 2.5 Pro) - Fast codebase analysis
- **Frontend Engineer** (Gemini 2.5 Pro) - UI/UX work
- **Document Writer** (Gemini 2.5 Pro) - Documentation

### Authentication Plugins

- `opencode-antigravity-auth@1.2.7` - Google (Gemini) authentication
- `opencode-openai-codex-auth@4.3.0` - OpenAI (GPT) authentication
- Native Claude OAuth - Built-in authentication

### Configuration Files

- **Project**: `.opencode/oh-my-opencode.json` - Agent assignments
- **Global**: `~/.config/opencode/opencode.json` - Plugin config
- **Backup**: `claude_code-multi-AI-MCP/credentials.backup.20260107-135328.json`

---

## 2. How It Works

### Current MCP (Manual)

```
Developer: "Hey Claude, ask Gemini to review this auth code"
Claude: [Uses mcp__multi-ai-collab__gemini_code_review tool]
Gemini: [Reviews code]
Claude: [Returns Gemini's response]
```

**Problems**:

- Manual delegation every time
- Sequential execution
- Developer must choose model
- No cost optimization

### Oh-My-OpenCode (Automatic)

```
Developer: "Review this auth code"
Sisyphus (Claude Opus): [Analyzes task]
  ├─> Oracle (GPT-4o): Analyzes architecture in parallel
  ├─> Librarian (Gemini): Researches auth best practices in parallel
  └─> Synthesizes results
Claude: [Returns comprehensive review]
```

**Benefits**:

- Automatic delegation
- Parallel execution (5 concurrent agents)
- Optimal model per task
- Cost optimization (Gemini Flash for simple tasks)

---

## 3. Quick Start (3 Commands)

### Step 1: Authenticate

```bash
# Claude OAuth (required)
opencode auth login

# Then install and authenticate Gemini/OpenAI plugins
# (oh-my-opencode installer handles this)
```

### Step 2: Verify Setup

```bash
# Check agent configuration
powershell scripts\monitor-oh-my-opencode.ps1
```

### Step 3: Start Using

Just code normally - oh-my-opencode will automatically delegate tasks to
specialized agents.

---

## 4. Configuration Details

### Agent Assignment (.opencode/oh-my-opencode.json)

```json
{
  "agents": {
    "Sisyphus": {
      "model": "anthropic/claude-opus-4-5",
      "temperature": 0.2
    },
    "oracle": {
      "model": "openai/gpt-4o",
      "temperature": 0.1,
      "permission": { "edit": "ask", "bash": "ask" }
    },
    "librarian": { "model": "google/gemini-2.5-pro" },
    "explore": { "model": "google/gemini-2.5-pro" },
    "frontend-ui-ux-engineer": { "model": "google/gemini-2.5-pro" }
  },
  "background_task": {
    "defaultConcurrency": 5,
    "providerConcurrency": {
      "anthropic": 3,
      "google": 5,
      "openai": 2
    }
  }
}
```

### Concurrency Limits (Rate Limit Protection)

- **Anthropic (Claude)**: 3 concurrent requests
- **Google (Gemini)**: 5 concurrent requests
- **OpenAI (GPT)**: 2 concurrent requests
- **Total**: Up to 5 agents running in parallel

---

## 5. Validation Plan (Week 1: Jan 7-14, 2026)

### Day 1-2: Authentication & Basic Testing

- [x] Install oh-my-opencode (COMPLETE)
- [ ] Authenticate all providers (Claude, Gemini, OpenAI)
- [ ] Verify basic delegation works
- [ ] Test each agent type (Oracle, Librarian, Explore)

### Day 3-4: Feature Comparison

Compare oh-my-opencode vs. current MCP on real tasks:

- [ ] Code review (automatic Oracle consultation)
- [ ] Documentation lookup (automatic Librarian usage)
- [ ] Codebase exploration (automatic Explore usage)
- [ ] Track: delegation prompts, time, accuracy

### Day 5-6: Production Scenarios

- [ ] Complex refactoring (test parallel delegation)
- [ ] New feature implementation (test auto-specialization)
- [ ] Bug investigation (test multi-AI collaboration)
- [ ] Measure: API costs, speed, developer satisfaction

### Day 7: Decision Gate (2026-01-14)

- [ ] Analyze metrics vs. targets
- [ ] ADOPT / REJECT / ITERATE decision
- [ ] Update ADR-016 with findings

---

## 6. Success Metrics

| Metric                    | Baseline (MCP)  | Target (OMO) | Threshold            |
| ------------------------- | --------------- | ------------ | -------------------- |
| Manual delegation prompts | 5-10 per task   | 1 per task   | 50%+ reduction       |
| Time to delegate          | ~30s            | 0s (auto)    | Instant              |
| Parallelization           | Sequential      | 5 concurrent | Background execution |
| Model selection accuracy  | Manual (varies) | Automatic    | >90% correct         |
| API costs                 | Baseline        | Cost-neutral | ≤ baseline           |

### MUST ACHIEVE (Pass/Fail)

- [ ] Authentication works reliably
- [ ] Automatic routing >90% accurate
- [ ] No critical stability issues
- [ ] API costs ≤ baseline

### SHOULD ACHIEVE (Metrics)

- [ ] 50%+ reduction in manual prompts
- [ ] Measurable speedup from parallelization
- [ ] Positive developer satisfaction

---

## 7. Rollback Plan

**If oh-my-opencode doesn't meet targets:**

1. **Keep Current MCP** (Backup intact)
   - `claude_code-multi-AI-MCP/` still functional
   - API keys preserved in backup file
   - Credentials: `credentials.backup.20260107-135328.json`

2. **Remove oh-my-opencode**

   ```bash
   # Uninstall
   bunx oh-my-opencode uninstall

   # Remove config
   rm -r .opencode/
   rm ~/.config/opencode/opencode.json
   ```

3. **Document Learnings**
   - Update ADR-016 with rejection rationale
   - Extract any valuable patterns (LSP, AST-Grep)
   - Share findings with team

---

## 8. LSP Testing (Parallel Track)

**Location**: `experiments/oh-my-opencode-lsp-test/`

### Test Objectives

1. **LSP Refactoring** - Rename variables, extract functions
2. **AST-Grep** - Structural code search vs. text grep
3. **Ultrawork** - Auto-activation pattern evaluation

### Benchmark Criteria

- **Speed**: 2x+ improvement to justify adoption
- **Accuracy**: 100% (LSP guarantees correct refactoring)
- **Developer Experience**: Lower cognitive load

### Decision Criteria

- **ADOPT LSP** if: 2x speed + 100% accuracy + seamless workflow
- **REJECT LSP** if: <50% improvement or workflow disruption
- **CHERRY-PICK** if: Specific features valuable (e.g., AST-Grep only)

---

## 9. Monitoring & Troubleshooting

### Check Agent Status

```bash
powershell scripts\monitor-oh-my-opencode.ps1
```

**Output**:

- Configured agents and their models
- Concurrency settings
- Recent activity log
- Comparison metrics (MCP vs. OMO)

### Monitor API Usage

```bash
# Check agent invocation logs
cat .opencode/agent-usage.log
```

### Live Monitoring

```bash
# Real-time agent activity
powershell scripts\monitor-oh-my-opencode.ps1 -Live -IntervalSeconds 5
```

### Common Issues

**Authentication Failures**:

```bash
# Re-authenticate
opencode auth login
```

**Agent Not Delegating**:

- Check `.opencode/oh-my-opencode.json` exists
- Verify agent models configured
- Check plugin installation: `~/.config/opencode/opencode.json`

**API Rate Limits**:

- Adjust `providerConcurrency` in config
- Reduce `defaultConcurrency` from 5 to 3

---

## 10. Documentation References

### Primary Docs

- **ADR-016**: [DECISIONS.md](../DECISIONS.md#adr-016) - Full migration
  rationale
- **Installation Script**:
  [scripts/install-oh-my-opencode.ps1](../scripts/install-oh-my-opencode.ps1)
- **Monitoring Script**:
  [scripts/monitor-oh-my-opencode.ps1](../scripts/monitor-oh-my-opencode.ps1)
- **LSP Test Environment**:
  [experiments/oh-my-opencode-lsp-test/](../experiments/oh-my-opencode-lsp-test/)

### External Resources

- **Repository**:
  [github.com/code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- **Documentation**:
  [DeepWiki - Oh-My-OpenCode](https://deepwiki.com/code-yeongyu/oh-my-opencode)
- **OpenCode Docs**: [opencode.ai/docs](https://opencode.ai/docs)

### Related Capabilities

- **CAPABILITIES.md**: Existing 250+ agents (complementary, not replaced)
- **AI-WORKFLOW-COMPLETE-GUIDE.md**: 28 specialized agents + orchestration

---

## 11. Timeline

| Date          | Milestone                                | Status        |
| ------------- | ---------------------------------------- | ------------- |
| 2026-01-07    | Installation complete                    | [DONE]        |
| 2026-01-07    | Authentication & basic testing           | [IN PROGRESS] |
| 2026-01-08-09 | Feature comparison testing               | [PENDING]     |
| 2026-01-10-11 | Production scenario validation           | [PENDING]     |
| 2026-01-12-13 | LSP testing & benchmarking               | [PENDING]     |
| 2026-01-14    | **Decision Gate** (ADOPT/REJECT/ITERATE) | [PENDING]     |
| 2026-01-21    | If adopted: Complete MCP deprecation     | [PENDING]     |

---

## 12. Contact & Support

**Questions?**

- Review [ADR-016](../DECISIONS.md#adr-016) for full context
- Check oh-my-opencode
  [GitHub Issues](https://github.com/code-yeongyu/oh-my-opencode/issues)
- Consult [OpenCode Documentation](https://opencode.ai/docs)

**Feedback**:

- Document findings in `experiments/oh-my-opencode-lsp-test/test-results/`
- Update metrics in monitoring script
- Share results at decision gate (2026-01-14)

---

**Last Updated**: 2026-01-07 13:58 **Next Review**: 2026-01-14 (Decision Gate)
