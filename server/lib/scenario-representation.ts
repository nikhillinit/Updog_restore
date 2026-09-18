import type { Request, Response } from 'express';
import { CAPITAL_PLAN_REPRESENTATION } from '@shared/contracts/fund-scenario-sets-v1.contract';

export type ScenarioRepresentation =
  typeof CAPITAL_PLAN_REPRESENTATION | 'capital-plan-v2' | undefined;

/** null means the malformed selector has already received its response. */
export function parseScenarioRepresentation(
  req: Request,
  res: Response
): ScenarioRepresentation | null {
  // Express's simple parser retains bracketed selectors as literal query keys.
  const hasBracketedSelector = Object.keys(req.query).some((key) =>
    key.startsWith('representation[')
  );
  if (!hasBracketedSelector && !Object.prototype.hasOwnProperty.call(req.query, 'representation'))
    return undefined;
  const suppliedValue = hasBracketedSelector
    ? Object.fromEntries(
        Object.entries(req.query).filter(
          ([key]) => key === 'representation' || key.startsWith('representation[')
        )
      )
    : req.query['representation'];
  if (
    !hasBracketedSelector &&
    (suppliedValue === CAPITAL_PLAN_REPRESENTATION || suppliedValue === 'capital-plan-v2')
  )
    return suppliedValue;
  res.status(400).json({
    error: 'invalid_representation',
    message: 'Invalid scenario representation',
    parameter: 'representation',
    suppliedValue,
    allowedValues: [CAPITAL_PLAN_REPRESENTATION, 'capital-plan-v2'],
  });
  return null;
}
