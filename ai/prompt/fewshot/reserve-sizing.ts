import { z } from 'zod';
import { PromptTemplate } from '../PromptTemplate';

/**
 * Reserve Sizing Template
 * For follow-on investment recommendations using MOIC on Planned Reserves
 */

export const ReserveSizingTemplate = new PromptTemplate({
  id: 'reserve-sizing',
  inputSchema: z.object({
    totalReserves: z.number(),
    companies: z.array(z.object({
      id: z.string(),
      name: z.string(),
      stage: z.string(),
      currentInvestment: z.number(),
      exitMoicPlanned: z.number().nullable(),
      graduationProbability: z.number().min(0).max(1).optional(),
    })),
  }),
  system: 'You are a venture capital portfolio manager. Recommend follow-on allocations using "Exit MOIC on Planned Reserves" methodology and graduation probability analysis. Prioritize companies with highest expected value and reasonable risk profiles.',
  user: `Total available reserves: ${{totalReserves}}

Portfolio companies:
{{companies}}

Provide a ranked list of follow-on allocation recommendations with:
1. Company name and recommended allocation amount
2. Rationale based on Exit MOIC on Planned Reserves
3. Risk assessment and graduation probability
4. Expected return improvement

Focus on maximizing portfolio-level returns while managing concentration risk.`,
});
