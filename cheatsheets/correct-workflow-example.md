# Correct Workflow Example

This demonstrates the CORRECT workflow that checks capabilities FIRST.

## ❌ WRONG WAY (What keeps happening)

```
User: "I need to test our waterfall calculations and generate documentation"

Claude: *Immediately creates todo list*
TodoWrite:
- [ ] Implement waterfall calculation function
- [ ] Create test suite for waterfall
- [ ] Write test cases
- [ ] Generate documentation
- [ ] Format output

*Starts implementing from scratch*
```

**Problem**: Didn't check that we already have:

- `waterfall-specialist` agent
- `test-automator` agent
- `docs-architect` agent

## ✅ RIGHT WAY (Check capabilities first)

```
User: "I need to test our waterfall calculations and generate documentation"

Claude: Let me check our existing capabilities first...
*Reads CAPABILITIES.md*

I see we have:
- waterfall-specialist: Already handles waterfall/carry calculations
- test-automator: Generates comprehensive tests with TDD
- docs-architect: Creates technical documentation

TodoWrite:
- [ ] Use waterfall-specialist agent to validate calculations
- [ ] Use test-automator to generate test suite
- [ ] Use docs-architect to create documentation
- [ ] Review and integrate results

*Uses existing agents via Task tool*
```

## The Difference

| Wrong Way                        | Right Way              |
| -------------------------------- | ---------------------- |
| Builds from scratch              | Uses existing tools    |
| Recreates existing functionality | Leverages 30+ agents   |
| Takes longer                     | Much faster            |
| User has to interrupt            | Self-sufficient        |
| Forgets capabilities             | Checks inventory first |

## Implementation Example

```typescript
// WRONG: Building from scratch
function calculateWaterfall(fundSize: number, carry: number) {
  // ... implementing logic that already exists
}

// RIGHT: Using existing agent
await Task({
  subagent_type: 'waterfall-specialist',
  prompt: 'Calculate waterfall for $100M fund with 20% carry',
  description: 'Waterfall calculation',
});
```

## Key Takeaway

**ALWAYS check CAPABILITIES.md FIRST** - It will:

1. Show you what already exists
2. Prevent redundant work
3. Make your todos more accurate
4. Save time and effort
