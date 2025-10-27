# Nia MCP Usage Guide

**Context-augmentation layer for coding agents that improves performance by
27%.**

## Quick Reference

| Tool Category           | When to Use                | Example                                               |
| ----------------------- | -------------------------- | ----------------------------------------------------- |
| **Package Search**      | Understanding dependencies | "Search drizzle-orm for transaction patterns"         |
| **Documentation**       | External docs lookup       | "Search React docs for concurrent rendering"          |
| **Repository Analysis** | Evaluating alternatives    | "Compare state management in zustand vs valtio"       |
| **Deep Research**       | Architecture decisions     | "Compare financial modeling libraries for TypeScript" |

---

## Installation

### 1. Install Nia MCP Server

```bash
pipx install nia-mcp-server
```

### 2. Get API Key

1. Visit https://app.trynia.ai/
2. Sign up (free tier: 3 indexing jobs)
3. Copy your API key

### 3. Configure Environment

Add to your `.env` (or set as system environment variable):

```bash
NIA_API_KEY=your_api_key_here
```

### 4. Verify Installation

```bash
# Check MCP configuration
cat .claude/mcp.json

# Test connection
"Use nia package search to test connection"
```

---

## Core Tools by Use Case

### 📦 Package Search (No Indexing Required!)

#### **nia_package_search_grep** - Regex-based deterministic search

```
Example: "Use nia_package_search_grep to find retry configuration in bullmq package"

Use for:
- Specific code patterns
- Function definitions
- API usage examples
- Configuration patterns

Registries:
- py_pi (Python)
- npm (JavaScript/TypeScript)
- crates_io (Rust)
- golang_proxy (Go)
```

#### **nia_package_search_hybrid** - Semantic + regex search

```
Example: "Use nia_package_search_hybrid to understand how drizzle-orm handles transactions"

Use for:
- Understanding implementation patterns
- Finding usage examples
- Exploring architecture
- Learning best practices

Best for: 1-5 natural language questions about a package
```

#### **nia_package_search_read_file** - Read exact file sections

```
Example: "Use nia_package_search_read_file to get the full context around line 42 in express/lib/router.js"

Use for:
- Getting complete context around code snippets
- Reading specific file sections
- Understanding implementation details
```

---

### 📚 Documentation Management

#### **index_documentation** - Index websites and docs

```
Example: "Index https://react.dev/ for our project"

Recommended external docs to index:
1. https://react.dev/ (React 18 docs)
2. https://orm.drizzle.team/ (Drizzle ORM)
3. https://docs.bullmq.io/ (BullMQ job queues)
4. https://www.postgresql.org/docs/current/ (PostgreSQL)
5. https://vitejs.dev/guide/ (Vite bundler)
6. https://ui.shadcn.com/ (shadcn/ui components)
7. https://tanstack.com/query/latest (TanStack Query)
8. https://recharts.org/en-US/ (Recharts)

Parameters:
- url: Documentation site URL
- url_patterns: Include patterns (e.g., ["/docs/*"])
- exclude_patterns: Exclude patterns (e.g., ["/blog/*"])
- only_main_content: Extract main content only (default: true)
```

#### **search_documentation** - Search indexed docs

```
Example: "Search documentation for React Server Components best practices"

Use for:
- Natural language queries across docs
- Finding best practices
- API reference lookup
- Pattern discovery
```

#### **list_resources** - List all indexed resources

```
Example: "List my indexed resources"

Use for:
- Checking what's indexed
- Finding resource UUIDs
- Managing indexed content
```

---

### 🔍 Repository Management

#### **index_repository** - Index GitHub repositories

```
Example: "Index https://github.com/pmndrs/zustand for state management comparison"

Use for:
- Evaluating alternative libraries
- Understanding competitor implementations
- Learning patterns from popular repos
- Architecture research

⚠️ Don't index your own repo - Claude Code already understands it well!
```

#### **search_codebase** - Search indexed repositories

```
Example: "Search zustand codebase for middleware implementation patterns"

Use for:
- Natural language code queries
- Finding specific implementations
- Understanding architecture
- Pattern discovery
```

#### **visualize_codebase** - Interactive graph visualization

```
Example: "Visualize zustand codebase structure"

Use for:
- Understanding repository structure
- Exploring relationships
- Interactive navigation
- Architecture overview
```

---

### 🌐 Web Search & Research

#### **nia_web_search** - AI-powered search

```
Example: "Use nia_web_search to find GraphRAG frameworks with low latency"

Use for:
- Finding repositories
- Discovering documentation
- Trending technologies
- Similar content

Parameters:
- query: Natural language search
- num_results: Number of results (max: 10)
- category: Filter by type (github, company, etc.)
- days_back: Recent content only
```

#### **nia_deep_research_agent** - Multi-step research

```
Example: "Use nia_deep_research_agent to compare financial modeling libraries for TypeScript"

Use for:
- Comparative analysis
- Technology selection
- Pros/cons evaluation
- Architecture decisions

Best for: Complex questions requiring multi-step analysis
```

---

## Project-Specific Workflows

### Workflow 1: Understanding Dependencies

```
Scenario: Need to understand how drizzle-orm handles migrations

Steps:
1. "Use nia_package_search_hybrid to find migration patterns in drizzle-orm"
2. "Use nia_package_search_read_file to read the full migration implementation"
3. Apply findings to server/db/migrations/

Use Cases:
- BullMQ job retry configuration
- Express middleware patterns
- React Hook Form validation
- Zod schema composition
```

### Workflow 2: External Documentation Lookup

```
Scenario: Optimizing React 18 rendering in client/

Steps:
1. Index React docs (one-time): "Index https://react.dev/"
2. Query: "Search documentation for concurrent rendering optimization patterns"
3. Apply to client/src/components/

Use Cases:
- TanStack Query best practices
- Recharts performance optimization
- shadcn/ui customization patterns
- Vite build configuration
```

### Workflow 3: Evaluating Alternatives

```
Scenario: Considering alternative to Zustand for state management

Steps:
1. Research: "Use nia_deep_research_agent to compare zustand vs valtio vs jotai"
2. Index top choice: "Index https://github.com/pmndrs/valtio"
3. Compare: "Search valtio codebase for middleware patterns"
4. Visualize: "Visualize valtio codebase structure"
5. Document decision in DECISIONS.md

Use Cases:
- Charting library selection (Recharts vs D3 vs Victory)
- Form library comparison (React Hook Form vs Formik)
- Testing framework evaluation (Vitest vs Jest)
```

### Workflow 4: Domain-Specific Research

```
Scenario: Implementing advanced financial calculations

Steps:
1. "Use nia_web_search to find TypeScript libraries for IRR calculations"
2. "Use nia_deep_research_agent to compare financial modeling approaches"
3. "Index top library for reference"
4. Apply to client/src/core/engines/

Use Cases:
- Monte Carlo simulation optimization
- Waterfall calculation patterns
- Portfolio analytics algorithms
- Time-series data handling
```

---

## Integration with Existing Tools

### Claude Code Agents + Nia

```
# Before implementing waterfall changes
1. Use nia to research carry calculation patterns
2. Apply changes using waterfall-specialist agent
3. Review with code-reviewer agent
4. Test with test-repair agent

# Example
"Use nia_package_search to find European waterfall implementations in finance libraries"
→ Apply findings to client/src/lib/waterfall.ts
→ "Review waterfall changes with waterfall-specialist"
```

### Custom Slash Commands + Nia

```
# Research before /deploy-check
1. Use nia to research deployment best practices
2. Apply findings
3. Run /deploy-check for validation

# Example
"Use nia_deep_research_agent to find Node.js deployment optimization strategies"
→ Apply to server/bootstrap.ts
→ /deploy-check
```

---

## Best Practices

### ✅ DO

- Use package search FIRST (no indexing needed)
- Index external docs you reference frequently (React, Drizzle, BullMQ)
- Use deep research for architecture decisions during rebuild
- Index competing libraries when evaluating alternatives
- Keep indexed resources organized (use rename_resource)

### ❌ DON'T

- Index your own repo (Claude Code handles this)
- Over-index (free tier: 3 jobs)
- Use for general web search (WebSearch tool is faster)
- Duplicate project documentation (use cheatsheets/)

---

## Troubleshooting

### "Cannot connect to Nia server"

```bash
# Check environment variable
echo $NIA_API_KEY

# Verify pipx installation
pipx list | grep nia-mcp-server

# Reinstall if needed
pipx install --force nia-mcp-server
```

### "Indexing job failed"

```bash
# Check status
"Check the status of my indexing jobs"

# View resources
"List my resources"

# Delete and retry
"Delete resource [name]"
"Index [url] again"
```

### "API key invalid"

1. Visit https://app.trynia.ai/
2. Generate new API key
3. Update .env: `NIA_API_KEY=new_key`
4. Restart Claude Code

---

## Resource Management

### Check Indexed Resources

```
"List my resources"
→ Shows all indexed repos + docs with status
```

### Monitor Indexing Progress

```
"Check the status of my indexing job for react.dev"
→ Shows progress percentage
```

### Organize Resources

```
"Rename resource [UUID] to 'React 18 Docs'"
→ Easier to reference later
```

### Clean Up

```
"Delete resource [name]"
→ Free up indexing quota
```

---

## Quick Start Checklist

- [ ] Install: `pipx install nia-mcp-server`
- [ ] Get API key from https://app.trynia.ai/
- [ ] Add `NIA_API_KEY` to .env
- [ ] Test connection: "Use nia package search to test"
- [ ] Index React docs: "Index https://react.dev/"
- [ ] Index Drizzle docs: "Index https://orm.drizzle.team/"
- [ ] Index BullMQ docs: "Index https://docs.bullmq.io/"
- [ ] Bookmark this cheatsheet in statusLine

---

## Example Session

```
User: "I need to understand how to optimize BullMQ job processing"

You: "Let me use nia_package_search_hybrid to find job processing optimization patterns in the bullmq package"
→ Returns: Code examples, best practices, performance tips

You: "Now let me search our indexed BullMQ documentation for advanced queue patterns"
→ Returns: Official docs on concurrency, priorities, rate limiting

You: "Based on this research, I'll update server/workers/reserve-worker.ts with these optimizations..."
```

---

## Cost Management

**Free Tier:** 3 indexing jobs (no credit card)

**Recommended Free Tier Usage:**

1. React documentation (most referenced)
2. Drizzle ORM documentation (database layer)
3. BullMQ documentation (worker system)

**Unlimited (No Indexing):**

- Package search tools (all unlimited!)
- Web search
- Deep research agent

**Pro Tip:** Use package search first (unlimited), only index docs you'll query
repeatedly.

---

## Integration Status

- [x] MCP configuration created (.claude/mcp.json)
- [x] Cheatsheet documented (cheatsheets/nia-mcp-usage.md)
- [ ] API key configured (user action required)
- [ ] External docs indexed (optional, user choice)
- [ ] Tested with package search (pending API key)

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Core project architecture
- [cheatsheets/api.md](api.md) - API conventions
- [cheatsheets/testing.md](testing.md) - Test strategies
- [.claude/mcp.json](../.claude/mcp.json) - MCP server configuration

---

**Last Updated:** 2025-10-26 **Status:** ✅ Ready for use (API key setup
required)
