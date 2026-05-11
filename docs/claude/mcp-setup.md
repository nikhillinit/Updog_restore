---
last_updated: 2026-05-11
---

# MCP Server Setup

This document describes optional MCP (Model Context Protocol) server
integrations for enhanced Claude Code capabilities.

> **Note**: The core control plane does NOT depend on MCP. These are optional
> enhancements.

## PostgreSQL / Neon Integration

This repo uses Neon PostgreSQL. For live database introspection during
verification:

### Setup

```bash
# Install the Postgres MCP server
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres "$DATABASE_URL"
```

### Usage

Once configured, Claude can:

- Inspect live schema state
- Verify migration status
- Check table structures before changes
- Validate assumptions about DB shape

### Fallback Behavior

If MCP is not configured, verification steps fall back to:

- Reading `shared/db-schema.ts` for schema definitions
- Checking migration files in `drizzle/`
- Using `npm run db:studio` output

## Competitive Research (Optional)

For `/bias-audit` claim verification:

### Apify MCP Server

```bash
# Set up Apify for web scraping/verification
claude mcp add apify -- npx -y @apify/actors-mcp-server --token $APIFY_TOKEN
```

### Web Search Fallback

If Apify is not configured, claim verification uses:

- Built-in web search capabilities
- Manual citation requests

## Vercel Integration (Optional)

For deployment verification:

```bash
# Add Vercel MCP server
claude mcp add vercel
```

Enables:

- Deployment status checks
- Log inspection
- Environment variable verification

## Configuration Location

MCP servers are configured in:

- Global: `~/.claude/settings.json`
- Project: `.claude/settings.json` or `.claude/settings.local.json`

## Verification Without MCP

The control plane is designed to work without MCP:

| Verification Type  | With MCP      | Without MCP            |
| ------------------ | ------------- | ---------------------- |
| Schema check       | Live DB query | Read schema files      |
| API shape          | N/A           | Grep route definitions |
| Claim verification | Apify scrape  | Web search             |
| Deploy status      | Vercel API    | Manual check           |

## Security Notes

- Never commit MCP tokens to the repository
- Use environment variables for credentials
- MCP servers run with the same permissions as Claude Code
- Review MCP server sources before installation
