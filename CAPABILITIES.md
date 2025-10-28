# Claude Code Capability Inventory

_Last Updated: 2025-10-28_

This document provides a persistent reference of ALL available capabilities to
ensure optimal tool selection and prevent redundant implementations.

## 🎯 BEFORE STARTING ANY TASK

1. Check this inventory for existing solutions
2. Verify if an agent/tool already handles the requirement
3. Look for similar patterns that can be adapted
4. Only build new if nothing exists

## 📋 Available Agents (30+)

### Financial & Domain Experts

- **waterfall-specialist** - Waterfall/carry calculations (ALREADY HANDLES ALL
  WATERFALL LOGIC)
- **kellogg-bidding-advisor** - MBA course bidding strategies

### Testing & Quality

- **test-automator** ⭐ - Comprehensive test generation, TDD, coverage
- **pr-test-analyzer** - PR test coverage review
- **code-reviewer** - Code quality and style checking
- **code-simplifier** - Simplify complex code
- **comment-analyzer** - Comment accuracy verification
- **type-design-analyzer** - Type design quality assessment
- **silent-failure-hunter** - Find suppressed errors

### Architecture & Development

- **architect-review** ⭐ - Architectural decisions and review
- **code-explorer** - Understand existing implementations
- **context-orchestrator** ⭐ - Multi-agent workflow orchestration
- **knowledge-synthesizer** - Extract patterns from interactions
- **legacy-modernizer** - Refactor and modernize code
- **dx-optimizer** - Developer experience improvements

### Database & Infrastructure

- **database-expert** - Schema design, optimization
- **database-admin** - Operations, HA, DR
- **devops-troubleshooter** - Production issues
- **incident-responder** - P0 incident management
- **chaos-engineer** - Resilience testing
- **db-migration** - Schema migrations
- **perf-guard** - Performance regression detection

### API & Backend

- **api-scaffolding:backend-architect** - Scalable API design
- **api-scaffolding:django-pro** - Django development
- **api-scaffolding:fastapi-pro** - FastAPI async patterns
- **api-scaffolding:graphql-architect** - GraphQL systems
- **api-scaffolding:fastapi-templates** - FastAPI project templates

### Documentation & Analysis

- **docs-architect** ⭐ - Comprehensive documentation
- **tutorial-engineer** - Educational content
- **debug-expert** - Error analysis
- **test-repair** - Fix failing tests

### Security

- **security-scanning:security-auditor** - DevSecOps and compliance
- **security-scanning:sast-configuration** - Static analysis setup

## 🛠 Built-in Tools

### File Operations

- **Read** - Read any file (prefer over Bash cat)
- **Write** - Create files (prefer over Bash echo)
- **Edit** - Modify files (prefer over sed/awk)
- **Glob** - Find files by pattern (prefer over find)
- **Grep** - Search content (prefer over grep command)

### Development

- **Bash** - System commands
- **Task** - Launch specialized agents ⭐
- **TodoWrite** - Task management
- **SlashCommand** - Execute custom commands
- **Skill** - Launch skills

### External

- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web
- **AskUserQuestion** - Get user clarification

## 🤖 MCP Tools (Multi-AI Collaboration)

- **mcp**multi-ai-collab**ask_gemini** - Ask Gemini
- **mcp**multi-ai-collab**ask_openai** - Ask OpenAI
- **mcp**multi-ai-collab**gemini_code_review** - Gemini code review
- **mcp**multi-ai-collab**gemini_think_deep** - Deep analysis
- **mcp**multi-ai-collab**gemini_brainstorm** - Creative solutions
- **mcp**multi-ai-collab**gemini_debug** - Debug assistance
- **mcp**multi-ai-collab**ai_debate** - AI debate
- **mcp**multi-ai-collab**collaborative_solve** - Multi-AI problem solving

## 📝 Slash Commands

### Testing & Quality

- **/test-smart** - Intelligent test selection based on changes
- **/fix-auto** - Automated repair of lint/format/test failures
- **/deploy-check** - Pre-deployment validation
- **/perf-guard** - Performance regression detection

### Development

- **/dev-start** - Optimized environment setup
- **/workflows** - Interactive helper for tools

### Documentation (Memory)

- **/log-change** - Update CHANGELOG.md ⭐
- **/log-decision** - Update DECISIONS.md ⭐
- **/create-cheatsheet [topic]** - Create documentation

### Custom Commands

- **/evaluate-tools** - Run tool evaluation framework (NEW)

## 💾 Memory Systems

### Project Memory

- **CLAUDE.md** - Core architecture (THIS FILE'S NEIGHBOR!)
- **CHANGELOG.md** - All timestamped changes
- **DECISIONS.md** - Architectural decisions
- **cheatsheets/** - Detailed guides and patterns

### Persistent Storage

- **Todo lists** - Task tracking across sessions
- **File system** - Any file can be persistent storage
- **Git history** - Version control as memory

### Context Awareness

- **git status/diff** - Current work context
- **Recent test failures** - Pattern recognition
- **Package.json scripts** - Available commands

## 🔄 Workflow Patterns

### BEFORE IMPLEMENTING ANYTHING:

1. **Check existing agents**: Is there already an agent for this?
2. **Check MCP tools**: Can Gemini or OpenAI help?
3. **Check slash commands**: Is there a command that does this?
4. **Check npm scripts**: Is there already a script?

### Common Mistakes to Avoid:

- ❌ Using Bash for file operations (use Read/Write/Edit)
- ❌ Implementing financial calculations (use waterfall-specialist)
- ❌ Writing test generation (use test-automator)
- ❌ Manual code review (use code-reviewer)
- ❌ Building evaluation frameworks (use existing evaluators)
- ❌ Creating new memory systems (use CHANGELOG/DECISIONS)

### Optimal Patterns:

- ✅ Use Task tool to launch specialized agents
- ✅ Run agents in parallel when independent
- ✅ Use MCP tools for second opinions
- ✅ Update CHANGELOG/DECISIONS for persistence
- ✅ Check this file FIRST before any task

## 🎯 Decision Tree

```
User Request
    ↓
[Check CAPABILITIES.md]
    ↓
Has existing agent? → YES → Use Task tool
    ↓ NO
Needs multiple agents? → YES → Use context-orchestrator
    ↓ NO
Needs external AI? → YES → Use MCP tools
    ↓ NO
File operation? → YES → Use Read/Write/Edit/Glob/Grep
    ↓ NO
System command? → YES → Use Bash
    ↓ NO
[Only then implement new solution]
```

## 📚 External Resources

### Available Cookbook Patterns (C:\dev\anthropic-cookbook)

- Tool evaluation framework
- Memory system implementation
- Extended thinking patterns
- Evaluator-optimizer loops
- Agent routing patterns
- Financial modeling examples (DCF, sensitivity)

### When to Reference Cookbook:

- For implementation patterns (not domain knowledge)
- For architectural inspiration
- For production-ready code examples
- NOT for basic financial calculations (we have agents)

## 🔍 Quick Reference Questions

Before any task, ask yourself:

1. **Do I have an agent for this?** → Check agent list above
2. **Have I done this before?** → Check CHANGELOG.md
3. **Is there a decision about this?** → Check DECISIONS.md
4. **Can another AI help?** → Check MCP tools
5. **Is there a slash command?** → Check command list
6. **Is there an npm script?** → Check package.json

## 📌 Most Commonly Forgotten

These are the capabilities most often overlooked:

1. **context-orchestrator** - Handles multi-agent coordination automatically
2. **/log-change** and **/log-decision** - Built-in memory system
3. **test-automator** - Generates comprehensive tests with TDD
4. **MCP tools** - Get second opinions from Gemini/OpenAI
5. **code-explorer** - Understand existing code before modifying

---

**IMPORTANT**: This file should be checked at the START of every conversation
and before implementing any new functionality. Update it whenever new
capabilities are added.
