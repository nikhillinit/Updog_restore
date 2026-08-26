"""
Documentation validation using LLM-as-Judge pattern.
Adapted from Anthropic Cookbook: capabilities/summarization/evaluation/custom_evals/llm_eval.py
"""
import anthropic
import os
import json
from typing import Dict, Union, Any


def llm_eval_documentation(output, doc_content, truth_cases, schema):
    """
    Evaluate documentation quality using Claude (LLM-as-Judge pattern).

    Args:
        output (str): Claude's analysis of the documentation
        doc_content (str): The original documentation being validated
        truth_cases (str): JSON string of truth case scenarios
        schema (str): JSON Schema for truth cases

    Returns:
        tuple: (score, explanation) where score is 0-1 and explanation is detailed reasoning
    """
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt = f"""Evaluate this technical documentation analysis based on these Phase 1 criteria:

1. Entity Truthfulness (1-5): Are function names, signatures, and code references accurate?
2. Mathematical Accuracy (1-5): Are formulas and calculations correctly described?
3. Schema Compliance (1-5): Do examples match the truth cases and schema structure?
4. Integration Clarity (1-5): Are file paths, dependencies, and integrations clearly explained?
5. Explanation: Overall assessment of the documentation quality

Evaluation Guidelines:
- Check if the analysis mentions key functions and their correct signatures
- Verify mathematical formulas are accurately described
- Confirm truth case scenarios are referenced appropriately
- Validate that integration points and file paths are mentioned

Original Documentation:
{doc_content[:2000]}... [truncated]

Truth Cases (for reference):
{truth_cases[:1000]}... [truncated]

Analysis to Evaluate:
{output}

Provide a score for each criterion in JSON format. Format:

<json>
{{
  "entity_truthfulness": <number 1-5>,
  "mathematical_accuracy": <number 1-5>,
  "schema_compliance": <number 1-5>,
  "integration_clarity": <number 1-5>,
  "explanation": "<detailed reasoning>"
}}
</json>

Evaluation (JSON format):"""

    response = client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=2000,
        temperature=0,
        messages=[
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": "<json>"}
        ],
        stop_sequences=["</json>"],
    )

    evaluation = json.loads(response.content[0].text)

    # Calculate weighted domain score
    # Entity (30%), Math (25%), Schema (25%), Integration (20%)
    domain_score = (
        evaluation["entity_truthfulness"] * 0.30 +
        evaluation["mathematical_accuracy"] * 0.25 +
        evaluation["schema_compliance"] * 0.25 +
        evaluation["integration_clarity"] * 0.20
    )

    # Normalize to 0-1 scale (scores are 1-5)
    normalized_score = domain_score / 5.0

    return normalized_score, evaluation["explanation"]


def get_assert(output: str, context, threshold=0.75) -> Union[bool, float, Dict[str, Any]]:
    """
    Promptfoo evaluator function.

    Args:
        output: The LLM output to evaluate
        context: Promptfoo context with vars
        threshold: Pass threshold (0-1 scale)

    Returns:
        Dict with pass, score, and reason
    """
    # Extract vars from Promptfoo context
    doc_content = context["vars"].get("doc_content", "")
    truth_cases = context["vars"].get("truth_cases", "[]")
    schema = context["vars"].get("schema", "{}")

    # Run LLM evaluation
    score, explanation = llm_eval_documentation(output, doc_content, truth_cases, schema)

    if score >= threshold:
        return {
            "pass": True,
            "score": score,
            "reason": f"Domain score: {score:.2%} (threshold: {threshold:.0%})\n{explanation}"
        }
    else:
        return {
            "pass": False,
            "score": score,
            "reason": f"Domain score: {score:.2%} below threshold ({threshold:.0%})\n{explanation}"
        }
