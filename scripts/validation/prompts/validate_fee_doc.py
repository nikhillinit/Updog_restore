"""
Prompt templates for fee documentation validation.
"""


def validate_fee_documentation(truth_cases, schema):
    """
    Generate prompt for validating fees.md documentation.

    Args:
        truth_cases: Content of fees.truth-cases.json
        schema: Content of fee-truth-case.schema.json

    Returns:
        str: Formatted prompt for Claude
    """
    # Note: The actual documentation will be passed as the main content by Promptfoo
    # This function just returns configuration/context that gets injected
    return f"""You are evaluating technical documentation for a VC fund modeling platform's fee calculation module.

Context files for validation:
- Truth Cases: {len(truth_cases)} characters
- JSON Schema: {len(schema)} characters

The documentation should comprehensively cover:
1. 6 fee basis types (committed, called, FMV, NAV, invested, drawn)
2. Step-down mechanics with examples
3. Catch-up provisions (full, partial, none)
4. Fee recycling with cap enforcement
5. Admin expense growth modeling
6. Fee impact analysis (MOIC, fee drag)
7. Integration with waterfall module
8. Complete API reference with TypeScript signatures

Evaluate the documentation content (provided separately) against the Phase 1 rubric."""


def validate_adr_006(truth_cases, schema):
    """
    Generate prompt for validating ADR-006.

    Args:
        truth_cases: Content of fees.truth-cases.json
        schema: Content of fee-truth-case.schema.json

    Returns:
        str: Formatted prompt for Claude
    """
    return f"""You are evaluating an Architecture Decision Record (ADR) for fee calculation standards.

The ADR should document:
1. Fee Basis Type System (6 types) - Decision rationale
2. Step-Down Implementation Strategy
3. Fee Recycling Model
4. Carried Interest Integration (reuses waterfall.ts)
5. Precision and Decimal.js Usage
6. Fee Impact Metrics Design
7. Validation Strategy

Each decision should include:
- Context and problem statement
- Decision made
- Alternatives considered
- Consequences (positive, negative, neutral)
- Code references with file:line notation

Context files:
- Truth Cases: {len(truth_cases)} characters
- JSON Schema: {len(schema)} characters

Evaluate the ADR content (provided separately) for completeness and clarity."""
