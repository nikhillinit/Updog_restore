import { z } from 'zod';
import { PromptTemplate } from '../PromptTemplate';

/**
 * Portfolio Q&A Template
 * For LP-facing questions about fund performance and metrics
 */

export const PortfolioQATemplate = new PromptTemplate({
  id: 'portfolio-qa',
  inputSchema: z.object({
    question: z.string(),
    tvpi: z.number().nullable(),
    irr: z.number().nullable(),
    dpi: z.number().nullable(),
    nav: z.number().nullable(),
    fundSize: z.number().optional(),
    deployedCapital: z.number().optional(),
  }),
  system: 'You are a venture fund analyst. Provide precise, concise answers using standard venture capital terminology. Focus on IRR, TVPI, DPI, NAV, and MOIC metrics when relevant.',
  user: `LP question: {{question}}

Current fund metrics:
- TVPI: {{tvpi}}
- IRR: {{irr}}
- DPI: {{dpi}}
- NAV: {{nav}}
{{#if fundSize}}- Fund Size: {{fundSize}}{{/if}}
{{#if deployedCapital}}- Deployed Capital: {{deployedCapital}}{{/if}}

Answer using standard venture capital terms. Be concise and accurate.`,
});
