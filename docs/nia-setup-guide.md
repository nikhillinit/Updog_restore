# Nia MCP Setup Guide

**Quick setup guide for integrating Nia context-augmentation MCP server with the
Press On Ventures platform.**

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Nia MCP Server

```bash
pipx install nia-mcp-server
```

**Verify installation:**

```bash
pipx list | grep nia-mcp-server
```

---

### Step 2: Get API Key

1. Visit https://app.trynia.ai/
2. Sign up (free tier: 3 indexing jobs, unlimited package search)
3. Copy your API key

---

### Step 3: Configure Environment

**Option A: Add to `.env` (Recommended)**

```bash
# Add to .env file (already in .gitignore)
NIA_API_KEY=your_api_key_here
```

**Option B: System Environment Variable**

```bash
# Windows PowerShell
$env:NIA_API_KEY="your_api_key_here"

# Windows CMD
set NIA_API_KEY=your_api_key_here

# Linux/Mac
export NIA_API_KEY=your_api_key_here
```

---

### Step 4: Verify MCP Configuration

The MCP configuration is already set up in
[.claude/mcp.json](../.claude/mcp.json):

```json
{
  "mcpServers": {
    "nia": {
      "command": "pipx",
      "args": ["run", "--no-cache", "nia-mcp-server"],
      "env": {
        "NIA_API_KEY": "${NIA_API_KEY}",
        "NIA_API_URL": "https://apigcp.trynia.ai/"
      }
    }
  }
}
```

✅ No changes needed - configuration is complete!

---

### Step 5: Test Connection

Restart Claude Code, then test with a package search (no indexing required):

```
"Use nia package search to find transaction examples in drizzle-orm"
```

If successful, you'll see code examples from the drizzle-orm package source
code.

---

## 📚 Index Common Documentation (Optional)

Run the initialization script to index frequently-referenced external docs:

```bash
node scripts/nia-init-docs.mjs
```

**What it indexes (free tier: top 3):**

1. React 18 documentation
2. Drizzle ORM documentation
3. BullMQ documentation

**Check progress:**

```
"List my resources"
"Check the status of my indexing jobs"
```

---

## 🔍 Quick Usage Examples

### Package Search (Unlimited, No Indexing!)

```
"Use nia_package_search_hybrid to find retry patterns in bullmq"
"Search npm package 'express' for middleware examples"
"Use nia_package_search_grep to find /transaction.*begin/ in drizzle-orm"
```

### Documentation Search (After Indexing)

```
"Search documentation for React concurrent rendering best practices"
"Search drizzle docs for migration patterns"
"Search bullmq docs for job retry configuration"
```

### Deep Research (For Architecture Decisions)

```
"Use nia_deep_research_agent to compare charting libraries for financial data visualization"
"Compare state management approaches: zustand vs valtio vs jotai"
```

---

## 📖 Full Documentation

- **Complete Guide:**
  [cheatsheets/nia-mcp-usage.md](../cheatsheets/nia-mcp-usage.md)
- **Project Context:** [CLAUDE.md](../CLAUDE.md#nia-mcp-integration)
- **MCP Config:** [.claude/mcp.json](../.claude/mcp.json)

---

## 🎯 Use Cases for This Project

### 1. Understanding Dependencies

```
Scenario: Need to understand BullMQ retry configuration

Command: "Use nia_package_search to find retry examples in bullmq package"
Result: Actual source code with retry patterns
Apply to: server/workers/reserve-worker.ts
```

### 2. External Documentation Lookup

```
Scenario: Optimizing React 18 rendering performance

Commands:
1. Index (one-time): "Index https://react.dev/"
2. Search: "Search documentation for concurrent rendering optimization"
Apply to: client/src/components/
```

### 3. Evaluating Alternatives

```
Scenario: Choosing between charting libraries

Commands:
1. "Use nia_deep_research_agent to compare recharts vs d3 vs victory"
2. "Index https://github.com/recharts/recharts"
3. "Visualize recharts codebase structure"
Document in: DECISIONS.md
```

---

## 🛠️ Troubleshooting

### "Cannot connect to Nia server"

```bash
# Check API key
echo $NIA_API_KEY

# Verify installation
pipx list | grep nia-mcp-server

# Reinstall
pipx install --force nia-mcp-server
```

### "Indexing job failed"

```
Check status: "Check the status of my indexing jobs"
Delete: "Delete resource [name]"
Retry: "Index [url] again"
```

### "API key invalid"

1. Visit https://app.trynia.ai/
2. Generate new API key
3. Update .env: `NIA_API_KEY=new_key`
4. Restart Claude Code

---

## 💰 Free Tier Limits

- **Package Search:** ♾️ Unlimited (no indexing required!)
- **Web Search:** ♾️ Unlimited
- **Deep Research:** ♾️ Unlimited
- **Documentation Indexing:** 3 jobs (React, Drizzle, BullMQ recommended)

**Pro Tip:** Start with package search (unlimited), only index docs you'll query
repeatedly.

---

## ✅ Integration Checklist

- [x] MCP configuration created (`.claude/mcp.json`)
- [x] Usage cheatsheet written (`cheatsheets/nia-mcp-usage.md`)
- [x] Init script created (`scripts/nia-init-docs.mjs`)
- [x] CLAUDE.md updated with Nia section
- [x] StatusLine updated with Nia tools
- [ ] Install nia-mcp-server: `pipx install nia-mcp-server`
- [ ] Get API key from https://app.trynia.ai/
- [ ] Add `NIA_API_KEY` to .env
- [ ] Test connection with package search
- [ ] (Optional) Run `node scripts/nia-init-docs.mjs`
- [ ] (Optional) Index additional docs as needed

---

## 🎬 Next Steps

1. **Install & Configure** (Steps 1-3 above)
2. **Test with package search** (no indexing needed)
3. **Index top 3 docs** (React, Drizzle, BullMQ)
4. **Bookmark** [cheatsheets/nia-mcp-usage.md](../cheatsheets/nia-mcp-usage.md)
5. **Start using** in your workflow!

---

**Last Updated:** 2025-10-26 **Status:** ✅ Configuration complete (user setup
required)
