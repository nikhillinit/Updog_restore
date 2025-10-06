import { z } from 'zod';
import { PromptTemplate } from '../PromptTemplate';

/**
 * Waterfall Validation Template
 * For carry distribution and waterfall calculation validation
 */

export const WaterfallChecksTemplate = new PromptTemplate({
  id: 'waterfall-checks',
  inputSchema: z.object({
    carryPercent: z.number().min(0).max(1),
    managementFees: z.number(),
    distributions: z.number(),
    fundSize: z.number(),
    hurdle: z.number().min(0).max(1).optional(),
    catchUp: z.number().min(0).max(1).optional(),
  }),
  system: 'You are a venture fund finance expert. Validate carry waterfall calculations and flag any inconsistencies or potential issues with fee structures, hurdle rates, and catch-up provisions.',
  user: `Carry waterfall parameters:
- Carry: {{carryPercent}}%
- Management Fees: ${{managementFees}}
- Distributions: ${{distributions}}
- Fund Size: ${{fundSize}}
{{#if hurdle}}- Hurdle Rate: {{hurdle}}%{{/if}}
{{#if catchUp}}- Catch-Up: {{catchUp}}%{{/if}}

Validate the carry waterfall and list any discrepancies, missing information, or potential issues. Check for:
1. Hurdle rate calculations
2. Catch-up provision accuracy
3. Fee allocation correctness
4. Distribution sequence compliance`,
});
