# AI Prompt Templates

Type-safe prompt template system for venture-specific AI operations.

## Overview

The prompt system provides:
- **Type-safe templates** with Zod validation
- **Variable interpolation** using `{{variable}}` syntax
- **Domain-specific few-shots** for venture capital operations
- **OpenAPI tool integration** for structured tool calling

## Usage

### Basic Template Usage

```typescript
import { PortfolioQATemplate } from '@/ai/prompt/fewshot/portfolio-qa';

const prompt = PortfolioQATemplate.render({
  question: "What is our current TVPI?",
  tvpi: 1.85,
  irr: 0.12,
  dpi: 0.6,
  nav: 1.2,
});

console.log(prompt.system); // System prompt
console.log(prompt.user);   // User prompt with interpolated values
```

### Available Templates

#### Portfolio Q&A (`portfolio-qa`)
LP-facing questions about fund performance.

**Input:**
- `question`: LP's question
- `tvpi`, `irr`, `dpi`, `nav`: Fund metrics
- `fundSize`, `deployedCapital` (optional)

#### Reserve Sizing (`reserve-sizing`)
Follow-on allocation recommendations.

**Input:**
- `totalReserves`: Available capital for follow-ons
- `companies`: Array of portfolio companies with stage, MOIC, graduation probability

#### Waterfall Checks (`waterfall-checks`)
Carry distribution validation.

**Input:**
- `carryPercent`: Carry percentage (0-1)
- `managementFees`: Total fees
- `distributions`: Total distributions
- `fundSize`: Fund size
- `hurdle`, `catchUp` (optional)

### OpenAPI Tool Integration

```typescript
import { buildToolPrompt, buildToolsPrompt } from '@/ai/prompt/tools/openapi-tools';

const operation = {
  operationId: 'getFundMetrics',
  summary: 'Get fund performance metrics',
  parameters: [
    { name: 'fundId', in: 'path', required: true, description: 'Fund ID' }
  ]
};

const toolPrompt = buildToolPrompt(operation);
// Use in AI prompts for structured tool calling
```

## Creating Custom Templates

```typescript
import { z } from 'zod';
import { PromptTemplate } from '@/ai/prompt/PromptTemplate';

export const MyTemplate = new PromptTemplate({
  id: 'my-template',
  inputSchema: z.object({
    companyName: z.string(),
    valuation: z.number(),
  }),
  system: 'You are an expert analyst.',
  user: 'Analyze {{companyName}} at ${{valuation}} valuation.',
});
```

## Best Practices

1. **Always validate inputs** - Templates throw on invalid data
2. **Keep prompts focused** - One clear task per template
3. **Use domain terminology** - IRR, TVPI, MOIC, not generic terms
4. **Test with real data** - Ensure interpolation works correctly
5. **Document expected outputs** - Add JSDoc comments describing results

## Testing

```typescript
import { expect, test } from 'vitest';
import { PortfolioQATemplate } from './portfolio-qa';

test('renders portfolio QA prompt', () => {
  const prompt = PortfolioQATemplate.render({
    question: 'What is TVPI?',
    tvpi: 2.0,
    irr: 0.15,
    dpi: 0.8,
    nav: 1.2,
  });

  expect(prompt.user).toContain('TVPI: 2');
  expect(prompt.system).toContain('venture fund analyst');
});
```
