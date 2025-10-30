"""
Promptfoo prompt functions for documentation validation.
Adapted from Anthropic Cookbook summarization patterns.
"""

def exit_recycling_prompt(doc_content):
    """
    Simplified prompt function for exit recycling documentation validation.

    Note: Only receives doc_content. Truth cases, schema, and doc_type are
    passed to the custom scorer (doc_domain_scorer.mjs) via vars.

    This prompt asks the LLM to explain the documentation content in terms
    of the expected categories, which the scorer then validates.
    """

    prompt = f"""You are a technical documentation analyst for a venture capital fund modeling platform.

Your task: Analyze and explain this exit recycling documentation, focusing on the key categories and concepts.

## Documentation Content
{doc_content}

---

## Analysis Instructions

Please provide a structured analysis covering these aspects:

1. **Capacity Calculation Features**
   - What functions handle recycling capacity?
   - How is the maximum recyclable capital calculated?
   - What formulas are used?

2. **Schedule Calculation Logic**
   - How are recycling schedules generated?
   - What chronological processing occurs?
   - How are exit events processed?

3. **Cap Enforcement Mechanisms**
   - How is the recycling cap enforced?
   - What happens when the cap is reached?
   - How is remaining capacity tracked?

4. **Term Validation Rules**
   - What defines the recycling period?
   - How is exit eligibility determined?
   - Are there critical boundary conditions? (e.g., ER-015: year 5 in 5-year period)

5. **Code References and Integration**
   - What are the main file locations?
   - What functions are exposed?
   - How does this integrate with other modules?

---

## Output Format

Provide a clear, technical explanation covering all five areas above. Include:
- Function names and signatures where relevant
- Formulas and calculation logic
- Critical edge cases and boundary conditions
- Integration points and dependencies

Focus on accuracy and completeness. Reference specific truth case IDs (e.g., ER-001, ER-015) where relevant to boundary conditions.
"""

    return prompt


def fee_prompt(doc_content):
    """
    Prompt function for fee documentation validation.

    Analyzes management and performance fee documentation to ensure
    accurate description of calculations, timing, and integration.
    """

    prompt = f"""You are a technical documentation analyst for a venture capital fund modeling platform.

Your task: Analyze and explain this fee calculation documentation, focusing on the key categories and concepts.

## Documentation Content
{doc_content}

---

## Analysis Instructions

Please provide a structured analysis covering these aspects:

1. **Management Fee Calculations**
   - What functions handle management fee computation?
   - How is the management fee basis calculated?
   - What formulas are used?
   - How is fee timing handled?

2. **Performance Fee (Carry) Calculations**
   - How are performance fees computed?
   - What is the hurdle rate mechanism?
   - How is catch-up calculated?
   - What formulas govern carry distribution?

3. **Fee Basis and Timing**
   - What are the different fee basis options (committed capital, invested capital, NAV)?
   - How is fee timing controlled?
   - Are fees calculated annually, quarterly, or on-demand?

4. **Integration with Waterfall**
   - How do fees integrate with waterfall calculations?
   - What is the relationship between performance fees and carry distribution?
   - Are there special cases or edge conditions?

5. **Code References and Integration**
   - What are the main file locations?
   - What functions are exposed?
   - How does this integrate with other modules?

---

## Output Format

Provide a clear, technical explanation covering all five areas above. Include:
- Function names and signatures where relevant
- Formulas and calculation logic
- Critical edge cases and boundary conditions
- Integration points and dependencies

Focus on accuracy and completeness. Reference specific truth case IDs where relevant to boundary conditions.
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


def capital_allocation_prompt(doc_content: str) -> str:
    """
    Capital Allocation validation prompt (single-var pattern).
    Multi-var context (truth_cases, schema, doc_type) handled by custom scorer.
    """
    return f"""
You are a meticulous documentation validator for the **Capital Allocation** module.

Goals:
1) Summarize three engines: Reserve, Pacing, Cohort
2) Explain key formulas (reserve target/floor, pacing with carryover, cohort caps/rounding)
3) State precedence rules (Reserve > Pacing > Cohort) and recycling interaction
4) Reference code/docs with ≥3 trace anchors (file:line style)
5) Demonstrate understanding via ≥1 boundary behavior (cap binds, reserve precedence, carryover)

Output structure:
- **Domain Summary** (6-10 bullets covering engines, precedence, edge cases)
- **Key Formulas** (≥5 formulas with variable definitions)
- **Rules & Precedence** (clear, testable statements)
- **Traceability** (≥3 file:line anchors to code/schema/docs)

Only use information from the document below. Do not invent APIs not present in it.

<document>
{doc_content}
</document>
"""
