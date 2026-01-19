---
status: ACTIVE
last_updated: 2026-01-19
---

# Agent Architecture Cheatsheet

## Multi-Level Agent Organization

Claude Code supports a three-tier agent architecture for optimal reusability and
project-specific customization.

## 🏗️ Architecture Levels

### Level 1: User-Level Agents (Global)

**Location:** `C:\Users\[username]\.claude\agents\`

**Scope:** Available across **ALL projects** for this user

**Use Cases:**

- Cross-project tools (architect-review, code-explorer, debug-expert)
- Infrastructure specialists (database-admin, devops-troubleshooter,
  incident-responder)
- General development helpers (dx-optimizer, legacy-modernizer, docs-architect)

**Current Count:** 15 agents

**Example Agents:**

```
architect-review.md       → Architectural decisions and review
database-admin.md         → DB operations, HA, DR
knowledge-synthesizer.md  → Extract patterns from interactions
context-orchestrator.md   → Multi-agent workflow orchestration
```

**When to Create:**

- Agent useful across multiple projects
- Generic development patterns
- Infrastructure/operations tools
- Cross-domain expertise

---

### Level 2: Project-Level Agents (Project-Specific)

**Location:** `.claude\agents\` (in project root)

**Scope:** Available **only for this project** (Updog_restore)

**Use Cases:**

- Domain-specific agents (waterfall-specialist for VC fund modeling)
- Project-specific quality gates (perf-guard, test-repair)
- Custom code review patterns (code-reviewer with project conventions)
- Specialized migrations (db-migration for this schema)

**Current Count:** 22 agents

**Example Agents:**

```
waterfall-specialist.md   → VC fund waterfall/carry calculations
perf-guard.md             → Performance regression detection
db-migration.md           → Drizzle schema migrations
test-repair.md            → Fix project-specific test failures
```

**When to Create:**

- Agent tied to specific domain (venture capital, e-commerce, etc.)
- Project-specific conventions or patterns
- Custom quality gates unique to this codebase
- Business logic specialists

---

### Level 3: Marketplace Agents (Plugins)

**Location:** `C:\Users\[username]\.claude\plugins\marketplaces\`

**Scope:** Available via **plugin system**, globally accessible

**Use Cases:**

- Industry-standard tools (fastapi-pro, django-pro, graphql-architect)
- Platform specialists (kubernetes-operations, cloud-infrastructure)
- Security tools (security-auditor, sast-configuration)
- Accessibility, SEO, blockchain, etc.

**Current Count:** 200+ agents across 40+ plugin collections

**Example Collections:**

```
api-scaffolding/          → Backend-architect, django-pro, fastapi-pro
security-comprehensive/   → Security-auditor, sast-configuration
kubernetes-operations/    → K8s manifest generation, deployment
blockchain-web3/          → Smart contract development
```

**When to Use:**

- Need industry-standard patterns
- Platform-specific expertise
- Security/compliance tooling
- Don't want to maintain custom agents

---

## 📁 Directory Structure

```
C:\Users\nikhi\
└── .claude\
    ├── agents\                    # User-level (15 agents)
    │   ├── architect-review.md
    │   ├── database-admin.md
    │   └── ...
    └── plugins\
        ├── cache\
        │   └── superpowers\
        │       └── skills\        # User-level skills (20)
        └── marketplaces\
            └── claude-code-workflows\  # 200+ marketplace agents

C:\dev\Updog_restore\
└── .claude\
    ├── agents\                    # Project-level (22 agents)
    │   ├── waterfall-specialist.md
    │   ├── test-repair.md
    │   └── ...
    └── skills\                    # Project-level skills (13)
        ├── brainstorming.md
        ├── systematic-debugging.md
        └── ...
```

---

## 🎯 Decision Tree: Where to Create an Agent

```
Need a new agent?
    ↓
Is it domain-specific? (e.g., waterfall calculations, XIRR, pacing)
    ↓ YES → Project-Level (.claude/agents/)
    ↓ NO
    ↓
Useful across multiple projects? (e.g., code review, debugging)
    ↓ YES → User-Level (~/.claude/agents/)
    ↓ NO
    ↓
Industry-standard pattern? (e.g., FastAPI, GraphQL, K8s)
    ↓ YES → Check Marketplace First (might already exist!)
    ↓ NO → Create User-Level agent
```

---

## 🔄 Override Behavior

**Project agents override user agents** with the same name.

### Example: Custom Code Reviewer

**User-Level:** `~/.claude/agents/code-reviewer.md`

- Generic code quality checks
- Language-agnostic patterns

**Project-Level:** `.claude/agents/code-reviewer.md`

- CLAUDE.md violation detection
- Waterfall validation patterns
- Updog-specific conventions

**Result:** Project-level code-reviewer takes precedence when in Updog_restore

---

## 🧠 Skills Library (Superpowers)

### User-Level Skills (20)

**Location:** `C:\Users\nikhi\.claude\plugins\cache\superpowers\skills\`

**Available Across ALL Projects:**

- test-driven-development
- verification-before-completion
- systematic-debugging
- using-git-worktrees
- executing-plans
- brainstorming
- ...and 14 more

### Project-Level Skills (13)

**Location:** `.claude\skills\`

**Updog-Specific Customizations:**

- Customized brainstorming for VC fund modeling
- Extended-thinking-framework with financial examples
- Memory-management with CHANGELOG/DECISIONS patterns

---

## 📦 Archived Agents

### BMad Methodology (Oct 7, 2025)

**Location:** `archive/2025-10-07/directories-backup/repo/`

**Archived Content:**

- 10 BMad agents (analyst, pm, po, qa, sm, ux, etc.)
- 17 BMad tasks (brownfield story creation, brainstorming)
- Full BMad-METHOD with 37 files

**Why Archived:**

- Codebase cleanup reclaimed ~2.5MB
- Zero active imports found
- Focus shift from project management to technical implementation

### Restoration

```bash
# Restore specific BMad agent
git mv archive/2025-10-07/directories-backup/repo/.claude/commands/BMad/agents/analyst.md \
  .claude/agents/analyst.md

# Restore entire BMad methodology
cp -r archive/2025-10-07/directories-backup/repo/BMAD-METHOD/ ./BMAD-METHOD/

# Restore all BMad agents
cp -r archive/2025-10-07/directories-backup/repo/.claude/commands/BMad/ \
  .claude/commands/BMad/
```

**When to Restore:**

- Need project management workflows (epic/story creation)
- Brownfield project onboarding
- Business analyst persona (Mary 📊)
- Structured brainstorming facilitation

---

## 🛠️ Best Practices

### Creating User-Level Agents

```bash
# 1. Create agent file
code ~/.claude/agents/my-global-agent.md

# 2. Add frontmatter
---
name: my-global-agent
description: Cross-project tool for X
tools: ['Read', 'Write', 'Bash']
model: claude-sonnet-4
---

# 3. Immediately available in ALL projects
```

### Creating Project-Level Agents

```bash
# 1. Create in project
code .claude/agents/domain-specialist.md

# 2. Add domain-specific frontmatter
---
name: domain-specialist
description: Handles Updog-specific waterfall calculations
tools: ['Read', 'Grep', 'Edit']
model: claude-sonnet-4
memoryIntegration:
  tenantId: "agent:domain-specialist:updog"
  scopes: ["project", "longterm"]
---

# 3. Only available in Updog_restore
```

### Using Marketplace Agents

```bash
# 1. Check what's available
ls ~/.claude/plugins/marketplaces/claude-code-workflows/

# 2. Browse plugin README
cat ~/.claude/plugins/marketplaces/claude-code-workflows/api-scaffolding/README.md

# 3. Use via Claude Code (automatically discovered)
# No configuration needed!
```

---

## 📊 Current Inventory

| Level               | Location                          | Count    | Scope                 |
| ------------------- | --------------------------------- | -------- | --------------------- |
| User-Level          | `~/.claude/agents/`               | 15       | All projects          |
| Project-Level       | `.claude/agents/`                 | 22       | Updog only            |
| Marketplace         | `~/.claude/plugins/marketplaces/` | 200+     | All projects (plugin) |
| Archived            | `archive/2025-10-07/`             | 27       | Restorable            |
| **Total Available** | -                                 | **250+** | -                     |

---

## 🔍 Finding the Right Agent

### Checklist Before Creating New Agent

1. **Check user-level agents:** `ls ~/.claude/agents/`
2. **Check project-level agents:** `ls .claude/agents/`
3. **Check marketplace:** Browse `~/.claude/plugins/marketplaces/`
4. **Check CAPABILITIES.md:** Complete agent inventory with use cases
5. **Check archive:** `ls archive/2025-10-07/` for BMad agents

### Search Pattern

```bash
# Find agent by keyword
grep -r "architectural review" ~/.claude/agents/*.md
grep -r "waterfall" .claude/agents/*.md

# List all agents
find ~/.claude/agents/ -name "*.md" -exec basename {} .md \;
find .claude/agents/ -name "*.md" -exec basename {} .md \;
```

---

## 🎓 Examples

### Example 1: Waterfall Specialist (Project-Level)

**Why Project-Level:**

- Domain-specific (VC fund carry calculations)
- Tied to Updog business logic
- Not useful in other projects

**File:** `.claude/agents/waterfall-specialist.md`

### Example 2: Architect Review (User-Level)

**Why User-Level:**

- Generic architectural review patterns
- Useful across all projects (web apps, CLIs, services)
- Not domain-specific

**File:** `~/.claude/agents/architect-review.md`

### Example 3: FastAPI Pro (Marketplace)

**Why Marketplace:**

- Industry-standard FastAPI patterns
- Maintained by community
- Don't need custom logic

**File:**
`~/.claude/plugins/marketplaces/claude-code-workflows/api-scaffolding/fastapi-pro.md`

---

## 🚀 Quick Start

### Scenario: Need a Test Generator

1. **Check CAPABILITIES.md** → test-automator exists (user-level)
2. **No custom config needed** → Works out of the box
3. **Use it:**
   `Task(subagent_type="test-automator", prompt="Generate tests for...")`

### Scenario: Need Custom Business Logic Agent

1. **Domain-specific?** → YES (VC fund modeling)
2. **Create project-level:** `.claude/agents/pacing-specialist.md`
3. **Add memory integration** → Learn from past pacing calculations
4. **Available immediately** in Updog_restore

---

## 🎓 Anthropic Cookbook Workflows

**Location:** `C:\dev\Updog_restore\anthropic-cookbook\`

Reference implementations for common agent patterns from Anthropic's official
cookbook.

### Basic Building Blocks

**Notebook:** `patterns/agents/basic_workflows.ipynb`

1. **Prompt Chaining**
   - Break complex tasks into sequential steps
   - Each step's output becomes next step's input
   - Use case: Multi-stage document processing

2. **Routing**
   - Classify input and route to specialized handlers
   - Dynamic tool selection based on query type
   - Use case: Customer support triage, multi-domain queries

3. **Multi-LLM Parallelization**
   - Run multiple LLM calls concurrently
   - Aggregate results from parallel branches
   - Use case: Multi-perspective analysis, consensus building

### Advanced Workflows

**Orchestrator-Workers:** `patterns/agents/orchestrator_workers.ipynb`

- Central orchestrator delegates tasks to specialized subagents
- Each worker handles specific domain (research, citations, synthesis)
- Use case: Research aggregation, complex multi-step analysis

**Evaluator-Optimizer:** `patterns/agents/evaluator_optimizer.ipynb`

- Generate solution → Evaluate quality → Iterate until threshold met
- Closed-loop improvement with automated quality gates
- Use case: Content generation with quality requirements

### Claude Agent SDK Examples

**Research Agent:** `claude_agent_sdk/00_The_one_liner_research_agent.ipynb`

- Autonomous web research with citations
- Multi-source aggregation and synthesis
- Use case: Market research, competitive analysis

**Chief of Staff Agent:** `claude_agent_sdk/01_The_chief_of_staff_agent.ipynb`

- Executive assistant workflow patterns
- Calendar management, email drafting, task prioritization
- Use case: Personal productivity automation

**Observability Agent:** `claude_agent_sdk/02_The_observability_agent.ipynb`

- System monitoring and alerting patterns
- Anomaly detection and root cause analysis
- Use case: Production monitoring, incident response

### Other Cookbook Patterns

**Extended Thinking:** `extended_thinking/`

- Deep reasoning for complex problems
- Step-by-step analysis with intermediate outputs
- Use case: Financial modeling, technical architecture decisions

**Using Sub-Agents:** `multimodal/using_sub_agents.ipynb`

- Decompose tasks across specialized agents
- Coordinate multi-agent workflows
- Use case: Complex document processing, multi-modal analysis

**Tool Evaluation:** `tool_evaluation/`

- Framework for evaluating tool/agent performance
- Automated benchmarking and quality metrics
- Use case: Agent development, quality assurance

### When to Reference Cookbook

✅ **Use cookbook for:**

- Implementation patterns (not domain knowledge)
- Workflow architecture inspiration
- Production-ready code examples
- Multi-agent coordination strategies

❌ **Don't use cookbook for:**

- Business logic (use domain agents like waterfall-specialist)
- Project-specific calculations
- Updog-specific patterns (use CLAUDE.md, cheatsheets)

### Integration with Updog Agents

**Pattern:** Orchestrator-Workers **Updog Implementation:** context-orchestrator
agent **Location:** `~/.claude/agents/context-orchestrator.md`

**Pattern:** Evaluator-Optimizer **Updog Implementation:** Scripts in
`scripts/validation/` (Promptfoo-based) **Use case:** Documentation quality
validation (Phase 1 modules)

**Pattern:** Extended Thinking **Updog Implementation:** ThinkingMixin in
`packages/agent-core/` **Use case:** Add deep reasoning to any agent (all 6
TypeScript agents migrated)

---

## 📖 Related Documentation

- [CAPABILITIES.md](../CAPABILITIES.md) - Complete agent inventory
- [NATIVE-MEMORY-INTEGRATION.md](../NATIVE-MEMORY-INTEGRATION.md) - Add memory
  to agents
- [THINKING_QUICK_START.md](../packages/agent-core/THINKING_QUICK_START.md) -
  Add extended thinking
- [Archive Manifest](../archive/2025-10-07/ARCHIVE_MANIFEST.md) - BMad
  restoration guide
- [Anthropic Cookbook](../anthropic-cookbook/) - Official workflow patterns and
  examples

---

## 🔧 Troubleshooting

### Agent Not Found

```bash
# Check all locations
ls ~/.claude/agents/my-agent.md
ls .claude/agents/my-agent.md
find ~/.claude/plugins/ -name "my-agent.md"
```

### Agent Not Activating

1. **Check frontmatter syntax** (YAML errors?)
2. **Verify file extension** (.md required)
3. **Check agent name** (must match filename without .md)
4. **Restart Claude Code** (reload configuration)

### Duplicate Agents (User + Project)

**Expected Behavior:** Project-level overrides user-level

**Example:**

- User: `~/.claude/agents/code-reviewer.md` (generic)
- Project: `.claude/agents/code-reviewer.md` (Updog-specific)
- **Result:** Updog version used in this project

---

## 💡 Pro Tips

1. **Start User-Level:** Create user-level agents first, move to project-level
   only if domain-specific
2. **Check Marketplace First:** 200+ agents already exist, don't rebuild
3. **Use Memory Integration:** User-level agents can learn across projects
4. **Version Control Project Agents:** Commit `.claude/agents/` for team sharing
5. **Archive Safely:** Use git mv to preserve history when archiving
6. **Document in CAPABILITIES.md:** Keep inventory up-to-date

---

**Last Updated:** 2025-11-09 **Inventory:** 15 user + 22 project + 200+
marketplace = 250+ total agents
