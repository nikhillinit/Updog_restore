"""
Fee Documentation Domain Score Evaluator

Adapted from Anthropic Cookbook summarization evaluation framework.
Evaluates Phase 1 documentation against the 4-dimensional rubric:
1. Entity Truthfulness (30%) - AST-verified function signatures & types
2. Mathematical Accuracy (25%) - Formula correctness vs Excel standards
3. Schema Compliance (25%) - Truth cases validate against JSON Schema
4. Integration Clarity (20%) - Cross-references and waterfall integration

Target: 92%+ domain score (96%+ is gold standard matching Phase 1A XIRR)
"""

import anthropic
import os
import json
from typing import Dict, Union, Any, Tuple


def fee_doc_domain_eval(documentation: str, truth_cases: str, schema: str, source_files: str = "") -> Tuple[float, Dict[str, Any]]:
    """
    Evaluate fee documentation using Claude with Phase 1 rubric.

    Args:
        documentation (str): The generated documentation (fees.md or ADR-006)
        truth_cases (str): Content of fees.truth-cases.json
        schema (str): Content of fee-truth-case.schema.json
        source_files (str): Optional - actual implementation files for AST verification

    Returns:
        tuple: (domain_score, dimension_details)
            - domain_score: 0-100 weighted score
            - dimension_details: dict with individual dimension scores and explanations
    """
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt = f"""You are a financial modeling expert evaluating technical documentation for a venture capital fund modeling platform.

Evaluate the following fee calculation documentation based on these 4 dimensions from the Phase 1 rubric:

**1. Entity Truthfulness (Weight: 30%)**
Score 1-5 based on:
- Are function signatures accurate and AST-verifiable?
- Do TypeScript interfaces match actual implementation?
- Are type definitions correct (input/output types)?
- Are file paths and line numbers accurate?
- Score 5 = All entities verified, no hallucinations
- Score 1 = Multiple incorrect signatures or types

**2. Mathematical Accuracy (Weight: 25%)**
Score 1-5 based on:
- Are fee calculation formulas correct vs Excel standards?
- Do management fee formulas handle step-downs correctly?
- Is carried interest waterfall integration mathematically sound?
- Are edge cases (zero values, boundaries) handled correctly?
- Score 5 = All formulas correct, Excel parity achieved
- Score 1 = Major mathematical errors or missing formulas

**3. Schema Compliance (Weight: 25%)**
Score 1-5 based on:
- Do truth case examples validate against the JSON Schema?
- Are all required fields documented?
- Are input/output structures consistent with schema?
- Do examples cover all 5 fee categories?
- Score 5 = All examples schema-compliant, comprehensive coverage
- Score 1 = Schema violations or missing categories

**4. Integration Clarity (Weight: 20%)**
Score 1-5 based on:
- Are waterfall module references clear and accurate?
- Is fund calculator integration well-documented?
- Are cross-references to other modules valid?
- Is the integration story coherent?
- Score 5 = Clear integration narrative, all references accurate
- Score 1 = Unclear integration or broken references

**Additional Considerations:**
- Does the documentation accurately capture the 6 fee basis types?
- Are step-down mechanics explained with clear examples?
- Is catch-up provision logic documented correctly?
- Are fee recycling cap and term constraints clear?
- Does the documentation enable a developer to implement the system?

Provide scores (1-5) for each dimension in JSON format:

<json>
{{
  "entity_truthfulness": <number 1-5>,
  "entity_truthfulness_explanation": "<string>",
  "mathematical_accuracy": <number 1-5>,
  "mathematical_accuracy_explanation": "<string>",
  "schema_compliance": <number 1-5>,
  "schema_compliance_explanation": "<string>",
  "integration_clarity": <number 1-5>,
  "integration_clarity_explanation": "<string>",
  "overall_assessment": "<string - comprehensive evaluation>",
  "strengths": ["<list of key strengths>"],
  "weaknesses": ["<list of areas for improvement>"]
}}
</json>

**Documentation to Evaluate:**
{documentation}

**Truth Cases (for Schema Compliance check):**
{truth_cases[:2000]}... (truncated for length)

**JSON Schema (for validation reference):**
{schema[:1000]}... (truncated for length)

Evaluation (JSON format):"""

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        temperature=0,
        messages=[
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": "<json>"}
        ],
        stop_sequences=["</json>"],
    )

    evaluation = json.loads(response.content[0].text)

    # Calculate weighted domain score (0-100 scale)
    weights = {
        "entity_truthfulness": 0.30,
        "mathematical_accuracy": 0.25,
        "schema_compliance": 0.25,
        "integration_clarity": 0.20
    }

    dimension_scores = {
        "entity_truthfulness": evaluation["entity_truthfulness"],
        "mathematical_accuracy": evaluation["mathematical_accuracy"],
        "schema_compliance": evaluation["schema_compliance"],
        "integration_clarity": evaluation["integration_clarity"]
    }

    # Calculate weighted average and convert to 0-100 scale
    weighted_sum = sum(dimension_scores[dim] * weights[dim] for dim in weights.keys())
    domain_score = (weighted_sum / 5.0) * 100  # Normalize from 5-point scale to 100-point scale

    dimension_details = {
        "domain_score": round(domain_score, 1),
        "dimensions": {
            dim: {
                "score": dimension_scores[dim],
                "weight": weights[dim],
                "weighted_contribution": round(dimension_scores[dim] * weights[dim] * 20, 1),  # contribution to 100-point scale
                "explanation": evaluation[f"{dim}_explanation"]
            }
            for dim in weights.keys()
        },
        "overall_assessment": evaluation["overall_assessment"],
        "strengths": evaluation["strengths"],
        "weaknesses": evaluation["weaknesses"],
        "passes_threshold": domain_score >= 92.0,  # Phase 1 minimum threshold
        "gold_standard": domain_score >= 96.0  # Phase 1A XIRR baseline
    }

    return domain_score, dimension_details


def get_assert(output: str, context, threshold=0.92) -> Union[bool, float, Dict[str, Any]]:
    """
    Promptfoo assertion function for fee documentation validation.

    Args:
        output (str): Generated documentation content
        context (dict): Promptfoo context with vars (truth_cases, schema)
        threshold (float): Minimum domain score (0.92 = 92%)

    Returns:
        dict: Promptfoo result with pass/fail, score, and detailed feedback
    """
    truth_cases = context["vars"].get("truth_cases", "")
    schema = context["vars"].get("schema", "")
    source_files = context["vars"].get("source_files", "")

    domain_score, dimension_details = fee_doc_domain_eval(
        documentation=output,
        truth_cases=truth_cases,
        schema=schema,
        source_files=source_files
    )

    # Convert to 0-1 scale for Promptfoo
    normalized_score = domain_score / 100.0

    if normalized_score >= threshold:
        return {
            "pass": True,
            "score": normalized_score,
            "reason": f"Domain Score: {domain_score}% (threshold: {threshold*100}%)\n\n{dimension_details['overall_assessment']}",
            "metadata": dimension_details
        }
    else:
        return {
            "pass": False,
            "score": normalized_score,
            "reason": f"Domain Score: {domain_score}% < {threshold*100}% threshold\n\nWeaknesses:\n" + "\n".join(f"- {w}" for w in dimension_details['weaknesses']),
            "metadata": dimension_details
        }


if __name__ == "__main__":
    # CLI usage for manual testing
    import sys

    if len(sys.argv) < 4:
        print("Usage: python fee_doc_domain_scorer.py <doc_path> <truth_cases_path> <schema_path>")
        sys.exit(1)

    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        doc = f.read()
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        truth_cases = f.read()
    with open(sys.argv[3], 'r', encoding='utf-8') as f:
        schema = f.read()

    domain_score, details = fee_doc_domain_eval(doc, truth_cases, schema)

    print(f"\n{'='*60}")
    print(f"Fee Documentation Domain Score: {domain_score}%")
    print(f"{'='*60}\n")

    for dim, data in details['dimensions'].items():
        print(f"{dim.replace('_', ' ').title()}:")
        print(f"  Score: {data['score']}/5 (weight: {data['weight']*100}%)")
        print(f"  Contribution: {data['weighted_contribution']}/100")
        print(f"  {data['explanation']}\n")

    print(f"\nOverall Assessment:\n{details['overall_assessment']}\n")
    print(f"Strengths:\n" + "\n".join(f"- {s}" for s in details['strengths']))
    print(f"\nWeaknesses:\n" + "\n".join(f"- {w}" for w in details['weaknesses']))
    print(f"\nPasses 92% threshold: {details['passes_threshold']}")
    print(f"Gold standard (96%+): {details['gold_standard']}")
