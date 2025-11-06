# Catalog All Development Tooling

Provide a comprehensive catalog of ALL development assets accessible in this
environment, including project-level, user-level, and built-in resources.

## CRITICAL INSTRUCTIONS

You MUST catalog assets from **multiple independent sources**:

### 1. PROJECT-LEVEL ASSETS (Use File Search Tools)

**Agents**:

- Search: `.claude/agents/*.md`
- For each: Extract name, model, tools, purpose, when to use

**Commands**:

- Search: `.claude/commands/*.md`
- For each: Extract name, purpose, usage, features

**Agent Packages**:

- Search: `packages/*/package.json`
- Filter: Packages with "agent" in name or description
- For each: Extract name, version, description, dependencies, scripts

**Scripts & Automation**:

- Read: `package.json` scripts section
- Search: `scripts/` directory structure
- Categorize: AI tools, testing, validation, deployment, utilities

**Settings & Configuration**:

- Read: `.claude/settings.json`
- Extract: Permissions, hooks, features

### 2. SYSTEM-LEVEL ASSETS (Extract from System Prompt)

**User-Level Global Agents**:

- Source: Your system prompt contains Task tool descriptions
- Look for: Agents in section "Available agent types and the tools they have
  access to"
- For each agent type listed:
  - Name (e.g., "architect-review", "chaos-engineer")
  - Description
  - Tools available
  - When to use (from description)

**Built-in Agents**:

- Extract: general-purpose, statusline-setup, Explore, Plan
- Include: Description and primary use cases

**MCP Tools (Model Context Protocol)**:

- Source: Your available function calls
- Filter: All functions starting with `mcp__`
- Group by: Server provider (multi-ai-collab, context7, serena, codacy, github)
- For each: Name, parameters, purpose
- Known MCP Servers installed:
  - multi-ai-collab (Multi-AI collaboration - Gemini, OpenAI, consensus)
  - context7 (Code context and semantic search)
  - serena (AI assistant capabilities)
  - codacy (Code analysis, security scanning)
  - github (Repository management, PR/issue automation)

### 3. OUTPUT FORMAT

Organize your catalog with clear section headers:

```markdown
# COMPLETE DEVELOPMENT TOOLING CATALOG

_Generated: [Today's date]_

## SUMMARY STATISTICS

- Project Agents: X
- User-Level Global Agents: X
- Built-in Agents: X
- Slash Commands: X
- MCP Tools: X
- Agent Packages: X
- NPM Scripts: X

---

## 1. PROJECT-LEVEL AGENTS (.claude/agents/)

### [Agent Name]

- **Model**: [sonnet/opus/haiku/inherit]
- **Tools**: [Read, Edit, etc.]
- **Purpose**: [Brief description]
- **When to Use**: [Usage guidance]
- **Location**: `.claude/agents/[filename].md`

[Repeat for all project agents]

---

## 2. USER-LEVEL GLOBAL AGENTS (System-wide)

### [Agent Name]

- **Model**: [sonnet/opus/haiku]
- **Purpose**: [From system prompt description]
- **When to Use**: [Proactive usage scenarios]
- **Scope**: Available across all projects

[Repeat for all user-level agents]

---

## 3. BUILT-IN AGENTS (Always Available)

### [Agent Name]

- **Purpose**: [Description]
- **When to Use**: [Usage scenarios]

[Repeat for built-in agents]

---

## 4. SLASH COMMANDS (.claude/commands/)

### /[command-name]

- **Purpose**: [Description]
- **Usage**: `/[command-name] [args]`
- **Features**: [Key capabilities]
- **Location**: `.claude/commands/[filename].md`

[Repeat for all commands]

---

## 5. MCP TOOLS (Model Context Protocol)

### Multi-AI Collaboration Server (mcp**multi-ai-collab**)

#### [Tool Name]

- **Function**: `mcp__multi-ai-collab__[function]`
- **Parameters**: [Required and optional params]
- **Purpose**: [What it does]

[Repeat for all multi-ai-collab tools]

### Context7 Server (mcp**context7**)

#### [Tool Name]

- **Function**: `mcp__context7__[function]`
- **Parameters**: [Required and optional params]
- **Purpose**: [What it does]

[Repeat for all context7 tools]

### Serena Server (mcp**serena**)

#### [Tool Name]

- **Function**: `mcp__serena__[function]`
- **Parameters**: [Required and optional params]
- **Purpose**: [What it does]

[Repeat for all serena tools]

### Codacy Server (mcp**codacy**)

#### [Tool Name]

- **Function**: `mcp__codacy__[function]`
- **Parameters**: [Required and optional params]
- **Purpose**: [What it does]

**Note**: Auto-analysis runs on file edits and dependency changes

[Repeat for all codacy tools]

### GitHub Server (mcp**github**)

#### [Tool Name]

- **Function**: `mcp__github__[function]`
- **Parameters**: [Required and optional params]
- **Purpose**: [What it does]

[Repeat for all github tools]

---

## 6. AI AGENT PACKAGES (packages/)

### [@scope/package-name]

- **Version**: [version]
- **Description**: [From package.json]
- **Dependencies**: [Key dependencies]
- **Scripts**: [Available npm scripts]
- **Location**: `packages/[package-name]/`

[Repeat for all agent packages]

---

## 7. NPM SCRIPTS (package.json)

Organize by category:

### AI & Agents

- `npm run ai` - [Description]
- `npm run ai:metrics` - [Description] [...]

### Development

- `npm run dev` - [Description]
- `npm run dev:client` - [Description] [...]

### Testing

- `npm test` - [Description]
- `npm run test:smart` - [Description] [...]

### Building

- `npm run build` - [Description] [...]

### Database

- `npm run db:push` - [Description] [...]

### Security

- `npm run security:audit` - [Description] [...]

### Performance

- `npm run perf:guard` - [Description] [...]

### Other Utilities

- `npm run doctor` - [Description] [...]

---

## 8. WORKFLOW DECISION TREE
```

User Request ↓ Has user-level agent? → YES → Use Task tool with agent type ↓ NO
Has project-level agent? → YES → Use Task tool with agent type ↓ NO Has slash
command? → YES → Use SlashCommand tool ↓ NO Has npm script? → YES → Use Bash
tool ↓ NO Has MCP tool? → YES → Use MCP function ↓ NO Can use built-in agents? →
YES → Use Task tool ↓ NO [Implement new solution]

```

---

## 9. VALIDATION CHECKLIST

Cross-reference your catalog against:

- ✅ All agent types in Task tool system prompt descriptions
- ✅ All available function calls (mcp__*)
- ✅ All files in `.claude/agents/`
- ✅ All files in `.claude/commands/`
- ✅ All packages in `packages/`
- ✅ All scripts in `package.json`
- ✅ Built-in agents: general-purpose, statusline-setup, Explore, Plan

If any source is missing items, note what was not found and why.

---

## 10. GAPS & RECOMMENDATIONS

After cataloging, identify:
1. Missing documentation for existing assets
2. Redundant or overlapping capabilities
3. Gaps in tooling coverage
4. Recommendations for CAPABILITIES.md updates

---

## 11. AGENT MEMORY CAPABILITIES (NEW 2025-11-05)

List all memory-related components available to agents:

### Native Memory Integration
- **HybridMemoryManager**: Redis + Native Memory storage
- **PatternLearningEngine**: Cross-session pattern learning
- **ToolHandler**: Process Claude API memory tool uses
- **TenantContext**: Multi-user/project isolation
- **TokenBudgetManager**: Automatic token allocation
- **MemoryEventBus**: Event-driven cache invalidation

### BaseAgent Configuration
Check if BaseAgent exposes memory flags:
- `enableNativeMemory` - Enable hybrid memory storage
- `enablePatternLearning` - Enable pattern learning
- `tenantId` - Multi-tenant isolation
- `memoryScope` - Session/project/longterm scope

### Current Adoption Status
For each agent package, check:
1. Does it extend BaseAgent?
2. Does it enable `enableNativeMemory`?
3. Does it enable `enablePatternLearning`?
4. Does it use `storeMemory()` / `getMemory()` methods?
5. Does it use `recordSuccessPattern()` / `getLearnedPatterns()` methods?

**Report adoption stats**:
- Total agents analyzed: X
- Agents with memory enabled: X
- Agents with pattern learning enabled: X
- Adoption rate: X%

### Integration Guides
- `cheatsheets/agent-memory-integration.md` - Integration guide
- `packages/agent-core/examples/memory-enabled-agent.ts` - Working example
- `NATIVE-MEMORY-INTEGRATION.md` - Architecture documentation
- `MIGRATION-NATIVE-MEMORY.md` - Migration guide

### Slash Commands
- `/enable-agent-memory` - Interactive integration assistant

**Status Summary**: List which agents are ready for autonomous memory usage vs. which need integration.
```

## VALIDATION REQUIREMENTS

Before completing:

1. **Count totals** for each category
2. **Verify completeness** against all sources
3. **Cross-reference** user-level agents from system prompt
4. **List any assets** that couldn't be cataloged (with reason)

## AUTOMATION & SYNC

### Automated Sync Script

The project includes an automated sync script to keep CAPABILITIES.md
up-to-date:

**Commands**:

- `npm run capabilities:sync` - Dry run (shows what would change)
- `npm run capabilities:sync:apply` - Apply changes to CAPABILITIES.md

**What it does**:

- Scans `.claude/agents/` for project agents
- Scans `.claude/commands/` for slash commands
- Scans `packages/` for agent packages
- Counts NPM scripts by category
- Updates "Last Updated" date in CAPABILITIES.md
- Updates agent count (project + user-level + built-in)

**Git Hook Integration**:

- Pre-commit hook auto-runs sync when agents/commands change
- Automatically stages updated CAPABILITIES.md
- No manual intervention needed

**When to use**:

- After adding/removing agents or commands
- Before committing changes to `.claude/` directory
- Weekly/monthly to verify sync

## OPTIONAL FOLLOW-UP

After cataloging, ask the user:

> "I've cataloged [X total] development assets. Would you like me to:
>
> 1. Run `npm run capabilities:sync:apply` to update CAPABILITIES.md
>    automatically?
> 2. Create a condensed quick-reference version?
> 3. Export this catalog to a separate documentation file?"

---

**IMPORTANT**: This command performs a **read-only** comprehensive audit. It
makes NO changes to files unless explicitly requested by the user in a follow-up
action. For automated updates, use `npm run capabilities:sync:apply` or rely on
the git hook.
