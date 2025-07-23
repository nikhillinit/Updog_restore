# @povc/test-repair-agent

AI agent for automated test failure detection and repair with draft PR creation.

## Features

- **Test Failure Detection**: Automatically detects and classifies test failures
- **Intelligent Repair**: Generates targeted fixes for common test failure patterns
- **Draft PR Creation**: Creates draft pull requests with automated repairs
- **Failure Classification**: Categorizes failures as syntax, assertion, runtime, or timeout
- **Structured Logging**: Comprehensive logging of analysis and repair operations

## Core Logic (~30 lines)

The agent implements focused repair strategies:

1. **Detect Failures** (~10 lines): Parse test output, classify failure types
2. **Generate Repairs** (~20 lines): Apply repair patterns based on failure classification
3. **Create PR**: Automated branch creation and draft PR submission

## Usage

```typescript
import { TestRepairAgent } from '@povc/test-repair-agent';

const agent = new TestRepairAgent({
  maxRetries: 1,
  timeout: 180000, // 3 minutes
});

const result = await agent.execute({
  projectRoot: process.cwd(),
  testPattern: 'portfolio', // optional
  maxRepairs: 5,
  draftPR: true,
});

if (result.success) {
  console.log(`Repaired ${result.data.repairs.length} test failures`);
  if (result.data.prUrl) {
    console.log(`Draft PR created: ${result.data.prUrl}`);
  }
}
```

## CLI Integration

```bash
# Repair all failing tests
npm run ai repair

# Repair specific test pattern with draft PR
npm run ai repair "portfolio" --draft-pr --max-repairs=3

# Verbose output
npm run ai repair --verbose
```

## Failure Classification

- **Syntax**: Missing semicolons, unexpected tokens
- **Assertion**: Expected vs received value mismatches  
- **Runtime**: Null reference errors, function not found
- **Timeout**: Slow async operations, infinite loops

## Repair Strategies

- **Syntax Repairs**: Add missing syntax elements
- **Assertion Fixes**: Update expectations to match reality
- **Runtime Fixes**: Add null checks, fix imports
- **Timeout Fixes**: Increase timeouts, optimize async code

## Draft PR Features

- Automatic branch creation with descriptive names
- Structured commit messages with repair summaries
- Draft PR creation with detailed repair descriptions
- Integration with GitHub CLI (`gh` command)

## Configuration

```typescript
interface RepairInput {
  projectRoot: string;     // Project directory
  testPattern?: string;    // Test pattern filter
  maxRepairs?: number;     // Max repairs to attempt (default: 5)
  draftPR?: boolean;      // Create draft PR (default: false)
}
```

## Requirements

- Node.js 18+
- Git repository
- GitHub CLI (`gh`) for PR creation
- npm test scripts configured

## Development

```bash
# Build the package
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```