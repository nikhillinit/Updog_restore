"""
Promptfoo prompt functions for documentation validation.
Adapted from Anthropic Cookbook summarization patterns.
"""

def validate_exit_recycling_doc(doc_content, truth_cases, schema, doc_type):
    """
    Validate exit recycling documentation against Phase 1 rubric.

    Args match the order in YAML vars: doc_content, truth_cases, schema, doc_type

    Uses a summarization approach to stay within token limits:
    1. Extract validation points from doc
    2. Score against rubric dimensions
    3. Return structured evaluation
    """

    prompt = f"""You are a technical documentation validator for a venture capital fund modeling platform.

Your task: Evaluate the quality and accuracy of this exit recycling documentation using a 4-dimensional rubric.

---

## Documentation Type
{doc_type}

## Documentation Content
{doc_content}

## Truth Cases Reference
{truth_cases}

## Schema Reference
{schema}

---

## Evaluation Rubric (Phase 1 Standard)

Score each dimension from 0.0 to 1.0:

### 1. Entity Truthfulness (30% weight)
- Function names match source code exactly
- TypeScript signatures accurate (parameters, return types)
- Interface definitions match implementation
- No hallucinated functions or features
- Code references (file:line) are correct

### 2. Mathematical Accuracy (25% weight)
- Formulas match implementation logic
- Calculation examples produce correct results
- Algorithm descriptions accurate
- Edge cases properly documented
- Numeric precision handling explained

### 3. Schema Compliance (25% weight)
- Truth cases validate against JSON Schema
- Input/output structures match
- Type constraints correct
- Required fields documented
- Optional fields handled properly

### 4. Integration Clarity (20% weight)
- Cross-references to related modules accurate
- File paths correct
- Integration points explained
- Dependencies documented
- API boundaries clear

---

## Validation Instructions

1. **Extract key validation points:**
   - List all function names mentioned
   - List all formulas/calculations
   - Count code references (file:line)
   - Note cross-references to other modules

2. **Check against truth cases:**
   - Do documented scenarios match truth cases?
   - Are input/output structures consistent?
   - Are calculation results verifiable?

3. **Score each dimension:**
   - Give specific reasons for score
   - Note any errors or inaccuracies
   - Highlight exemplary aspects

4. **Calculate domain score:**
   - Domain Score = (Entity × 0.30) + (Math × 0.25) + (Schema × 0.25) + (Integration × 0.20)
   - Express as percentage

---

## Required Output Format

Return your evaluation as JSON:

```json
{{
  "entity_truthfulness": {{
    "score": 0.0-1.0,
    "evidence": ["specific examples"],
    "issues": ["any problems found"]
  }},
  "mathematical_accuracy": {{
    "score": 0.0-1.0,
    "evidence": ["correct formulas found"],
    "issues": ["any incorrect formulas"]
  }},
  "schema_compliance": {{
    "score": 0.0-1.0,
    "evidence": ["validation checks passed"],
    "issues": ["validation problems"]
  }},
  "integration_clarity": {{
    "score": 0.0-1.0,
    "evidence": ["clear cross-references"],
    "issues": ["unclear integrations"]
  }},
  "domain_score": 0.0-1.0,
  "domain_score_percentage": 0-100,
  "summary": "Brief evaluation summary",
  "recommendation": "pass" or "revise"
}}
```

---

Begin your evaluation now.
"""

    return prompt


def summarize_doc_for_validation(doc_content):
    """
    Stage 1: Summarize documentation into validation-ready format.
    Use this for very long documents (>2000 lines).
    """

    prompt = f"""Extract validation points from this technical documentation.

Documentation:
{doc_content}

---

Return a structured summary with:

1. **Functions Documented** (list with signatures)
2. **Core Concepts** (list)
3. **Mathematical Formulas** (list with formula text)
4. **Code References** (file:line citations)
5. **Cross-References** (to other modules)
6. **API Completeness** (estimated % coverage)

Keep response concise and structured. No commentary.
"""

    return prompt
