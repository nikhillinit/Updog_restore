# CLAUDE.md Guidelines - Preventing Noise

## What BELONGS in CLAUDE.md

✅ **High-level project overview** (1-2 paragraphs max) ✅ **Core architecture**
(bullet points, not essays) ✅ **Tech stack** (just the essentials) ✅
**Critical conventions** (only the must-follows) ✅ **Pointers to other docs**
(not the content itself)

## What DOESN'T belong in CLAUDE.md

❌ Implementation details ❌ Step-by-step guides ❌ Code examples ❌ Historical
changes ❌ Debugging notes ❌ Feature-specific documentation

## Keep CLAUDE.md Signal-Rich

1. **One-page rule**: Should fit on one screen
2. **Bullet points**: Not paragraphs
3. **Links, not content**: Point to cheatsheets for details
4. **Essentials only**: If Claude can work without it, it goes elsewhere

## Where Details Go Instead

| Content Type      | Goes In                   |
| ----------------- | ------------------------- |
| What changed      | CHANGELOG.md              |
| Why we chose X    | DECISIONS.md              |
| How to do X       | cheatsheets/[topic].md    |
| API details       | cheatsheets/api.md        |
| Testing guide     | cheatsheets/testing.md    |
| Complex workflows | cheatsheets/[workflow].md |

## Example: Adding Redis Caching

### ❌ BAD (Too much detail in CLAUDE.md):

```md
## Tech Stack

- Redis for caching Monte Carlo results using Bull queue with TTL of 3600
  seconds and connection pooling configured with max 10 connections...
```

### ✅ GOOD (High-level in CLAUDE.md):

```md
## Tech Stack

- **Backend**: Node.js, Express.js, PostgreSQL, Redis, BullMQ
```

### Then create `cheatsheets/redis-caching.md` for details:

```md
# Redis Caching Setup

- Monte Carlo results: 1hr TTL
- Connection pool: max 10
- Queue: BullMQ for background jobs ...
```

## Review Checklist

Before adding to CLAUDE.md, ask:

1. Is this architectural or implementation?
2. Will this matter in 6 months?
3. Can this go in a cheatsheet instead?
4. Am I adding more than 2-3 lines?

If any answer is "implementation", "no", "yes", or "yes" → use a cheatsheet!
