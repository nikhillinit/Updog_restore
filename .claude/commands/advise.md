# /advise

Pre-flight check before coding in high-risk domains.

## Usage

```
/advise "Description of what you're about to implement"
```

## Protocol

When invoked, follow this workflow:

### 1. Identify Domain Risk

Determine if the task involves HIGH-RISK DOMAINS:

| Domain | Risk Level | Examples |
|--------|------------|----------|
| Fund Logic | CRITICAL | Waterfalls, Reserves, Fees, Carry, Distributions |
| State Management | HIGH | Hydration, Persistence, Wizard State |
| Math/Currency | HIGH | Rounding, Precision, XIRR, NPV calculations |
| Portfolio Calculations | HIGH | Capital allocation, Exit recycling |
| API Mutations | MEDIUM | Create/Update/Delete operations |

### 2. Scan Reflections

Read `docs/skills/SKILLS_INDEX.md` and identify relevant `REFL-ID`s based on:
- Wizard steps mentioned
- Error codes related
- Components involved
- Keywords matching

### 3. Fetch Matched Reflections

Read only the matched `REFL-*.md` files from `docs/skills/`.

### 4. Output Pre-Flight Check

Present findings in this format:

```
[PRE-FLIGHT CHECK]

Task: <summary of planned work>
Risk Level: <CRITICAL|HIGH|MEDIUM>

Relevant Reflections:
- REFL-001: <title> - <key constraint>
- REFL-003: <title> - <key constraint>

CONSTRAINTS TO FOLLOW:
1. <specific constraint from REFL-001>
2. <specific constraint from REFL-003>

ANTI-PATTERNS TO AVOID:
- Do NOT <anti-pattern from reflections>
- Do NOT <anti-pattern from reflections>

VERIFIED PATTERNS TO USE:
- DO use <pattern from reflections>
- DO use <pattern from reflections>

[READY TO PROCEED]
```

### 5. CRITICAL: Refuse Anti-Patterns

If the user's proposed approach matches a documented anti-pattern:

```
[WARNING: ANTI-PATTERN DETECTED]

Your proposed approach matches the anti-pattern in REFL-XXX:
<description>

This can cause:
<financial/system impact>

Recommended approach instead:
<verified fix pattern>

Do you want to proceed with the recommended approach? (y/n)
```

## Auto-Trigger Domains

This command should be automatically suggested when detecting work in:

- `client/src/core/engines/` - Calculation engines
- `server/services/waterfall/` - Waterfall calculations
- `server/services/reserve/` - Reserve calculations
- `shared/schemas/` - Zod validation schemas
- Files containing: `XIRR`, `IRR`, `NPV`, `waterfall`, `reserve`, `fee`, `carry`

## Example

```
/advise "I am about to implement GP catch-up logic for European waterfall with preferred return"
```

Response:
```
[PRE-FLIGHT CHECK]

Task: GP catch-up logic for European waterfall
Risk Level: CRITICAL

Relevant Reflections:
- REFL-001: Zero IRR Edge Case - Handle division by zero
- REFL-002: Preferred Return Calculation Order - Apply hurdle before catch-up

CONSTRAINTS TO FOLLOW:
1. Always check if IRR === 0 before calculating catch-up percentage
2. Apply preferred return to LP capital first, then calculate GP catch-up
3. Validate total distributions equal proceeds before returning

ANTI-PATTERNS TO AVOID:
- Do NOT calculate catch-up as percentage of total without checking hurdle status
- Do NOT use floating point equality checks for money values

VERIFIED PATTERNS TO USE:
- DO use Decimal.js for all monetary calculations
- DO throw EngineError with specific error codes for validation failures

[READY TO PROCEED]
```
