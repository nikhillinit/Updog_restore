---
name: bias-audit
description:
  Evidence and audience enforcement for audit/playbook/claims-heavy work
---

# Bias Audit Skill

Use this skill for any work involving:

- Audit reports
- Playbooks and guides
- Market claims or competitive analysis
- Content with factual assertions

## Required Output Format

Every bias audit must produce these sections:

### 1. Audience Statement

Clearly state:

- **Who this is for:** Primary audience with their context and expertise level
- **Who this is NOT for:** Explicitly exclude audiences to avoid scope creep

Example:

```
WHO THIS IS FOR: Series A GPs evaluating reserve strategies, familiar with standard VC terminology
WHO THIS IS NOT FOR: LPs seeking fund performance reports, seed-stage operators
```

### 2. Claim Inventory

List ALL claims of the following types:

- "only" claims (unique, sole, exclusive)
- "first" claims (pioneering, original)
- "best" claims (superior, leading, top)
- Comparative claims (better than, outperforms)
- Statistical claims (X% of, most, majority)

Format:

```
| Claim | Type | Location | Evidence Status |
|-------|------|----------|-----------------|
| "only platform to..." | only | intro p1 | citation_required |
| "fastest in class" | best | features | inference_allowed |
```

### 3. Evidence Status Classification

Each claim must be classified:

- **citation_required**: External, verifiable source needed
  - Market statistics
  - Competitive comparisons
  - Historical facts
  - Regulatory claims

- **inference_allowed**: Derivable from available data
  - Internal metrics with methodology
  - Logical conclusions from stated premises
  - Technical capabilities with demonstration

- **opinion_only**: Subjective assessment, must be labeled
  - Predictions
  - Recommendations
  - Qualitative judgments

### 4. Verification Actions

For each `citation_required` claim:

1. Specify the verification method (web search, API check, doc reference)
2. Note if verified or pending
3. If unverifiable, recommend rewording

## Usage

```
/bias-audit target="path/to/document.md"
```

Or invoke during content creation:

```
When generating this competitive analysis, apply /bias-audit principles
```

## Scout-Mindset Principles

1. **Seek disconfirmation**: Actively look for evidence against claims
2. **Steel-man alternatives**: Present the strongest version of competing views
3. **Quantify uncertainty**: Use ranges, confidence levels, or explicit unknowns
4. **Separate facts from inference**: Make derivation chains explicit
5. **Cite primary sources**: Prefer original data over summaries

## Telemetry

Emits: `bias_audit_completed` with claim counts and evidence status breakdown
