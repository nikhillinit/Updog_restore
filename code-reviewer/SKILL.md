---
name: code-reviewer
description: Comprehensive multi-AI code review system for Python, JavaScript, and TypeScript. Use when reviewing code for quality, security, performance, or best practices. Includes automated analysis scripts, language-specific patterns, and AI collaboration workflows for complex decisions.
---

# Code Reviewer Skill

Expert code review assistant with automated analysis tools, language-specific best practices, and multi-AI collaboration capabilities.

## When to Use This Skill

Use this skill when:
- Reviewing pull requests or code changes
- Analyzing code for security vulnerabilities
- Checking code quality and maintainability
- Evaluating architecture and design decisions
- Providing feedback on coding standards
- Identifying performance issues or anti-patterns
- Need multiple AI perspectives on complex decisions

## Quick Start

### 1. Automated Analysis

Run automated scans before manual review:

**Complexity Analysis:**
```bash
python scripts/analyze_complexity.py <file_or_directory>
```
Identifies files with high complexity, deep nesting, and long functions.

**Security Scan:**
```bash
python scripts/security_scan.py <file_or_directory>
```
Detects common vulnerabilities: SQL injection, XSS, hardcoded secrets, etc.

### 2. Language-Specific Review

Consult language-specific pattern guides:
- **Python:** Read `references/python_patterns.md` for PEP 8, type hints, security, testing patterns
- **JavaScript/TypeScript:** Read `references/javascript_patterns.md` for modern patterns, React, async/await, security

### 3. Structured Review Process

Follow the comprehensive workflow in `references/review_workflow.md`:
1. High-level architecture review
2. Logic and correctness verification  
3. Security and safety analysis
4. Tests and documentation check
5. Style and best practices validation

## Core Review Methodology

### Multi-Pass Review Strategy

Perform reviews in focused passes rather than trying to catch everything at once:

**Pass 1: Architecture (5 min)** - Overall design, approach validity, structural soundness
**Pass 2: Logic (15-20 min)** - Correctness, edge cases, error handling
**Pass 3: Security (10 min)** - Vulnerabilities, input validation, authentication
**Pass 4: Tests (10 min)** - Coverage, test quality, documentation
**Pass 5: Style (5 min)** - Readability, maintainability, conventions

### AI Collaboration for Complex Reviews

Leverage Multi-AI tools for different aspects:

**For architectural decisions:**
```
ai_consensus: Get consensus on design approach
ai_debate: Explore trade-offs between competing solutions
```

**For security-critical code:**
```
ask_gemini: Deep security analysis with focus="security"
collaborative_solve: Multi-AI approach to complex security issues
```

**For performance optimization:**
```
ask_all_ais: Compare optimization strategies
openai_architecture: System design implications
```

## Providing Feedback

### Feedback Severity Levels

**🔴 Critical** - Must fix before merge (security, data loss, breaking changes)
**🟠 Major** - Should fix (incorrect logic, missing error handling, poor architecture)
**🟡 Minor** - Nice to have (style, naming, minor optimizations)
**🟢 Praise** - Positive reinforcement (elegant solutions, good practices)

### Feedback Template

```
[Severity] [Category]: [Description]

[Specific issue with line numbers]

[Suggested solution with code example]

[Rationale or reference to best practice]
```

### Example Feedback

```
🔴 Critical (Security): SQL Injection Vulnerability

Line 45: String concatenation in SQL query allows injection attacks:
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

Fix:
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))

Reference: See references/python_patterns.md section 5 on SQL injection prevention.
```

## Review Workflow

### Step 1: Understand Context
- What problem is being solved?
- What's the risk level?
- Are there acceptance criteria?

### Step 2: Run Automated Tools
```bash
# Complexity analysis
python scripts/analyze_complexity.py <path>

# Security scan  
python scripts/security_scan.py <path>
```

Review automated findings before manual analysis.

### Step 3: Perform Multi-Pass Review

Execute all five passes methodically. Don't try to catch everything in one pass.

### Step 4: Consult Language-Specific Guides

When reviewing Python code:
- Read `references/python_patterns.md` sections relevant to code being reviewed
- Check anti-patterns section for common mistakes
- Verify security best practices are followed

When reviewing JavaScript/TypeScript:
- Read `references/javascript_patterns.md` for applicable sections
- Check React patterns if reviewing React code
- Verify async/await error handling

### Step 5: Use AI Collaboration for Complex Issues

When encountering difficult decisions:
- Use `ai_consensus` for architectural choices
- Use `ai_debate` to explore trade-offs
- Use `collaborative_solve` for complex problems
- Use `ask_all_ais` to compare multiple perspectives

### Step 6: Provide Structured Feedback

- Categorize by severity (Critical/Major/Minor/Praise)
- Be specific with line numbers
- Provide actionable suggestions
- Include positive feedback
- Reference relevant patterns from guides

## Language Support

### Python
Full support with patterns for:
- PEP 8 style and formatting
- Type hints and documentation
- Error handling best practices
- Performance optimization
- Security considerations
- Testing patterns
- Common anti-patterns

### JavaScript/TypeScript
Full support with patterns for:
- Modern ES6+ features
- TypeScript type system
- Async/await patterns
- React component design
- Security (XSS, injection, auth)
- Performance optimization
- Common pitfalls

### Other Languages
For languages not explicitly supported:
- Run automated tools if compatible
- Apply general principles from workflow guide
- Focus on security, logic, and architecture
- Consider using AI collaboration for language-specific guidance

## Advanced Features

### Multi-AI Collaboration Patterns

**Consensus on Uncertain Decisions:**
When reviewers are split or unsure:
```
ai_consensus(
  question="Should we use composition or inheritance for this design?",
  options="Composition with interfaces OR Inheritance with abstract base"
)
```

**Debate Complex Trade-offs:**
For exploring competing approaches:
```
ai_debate(
  ai1="gemini",
  ai2="grok", 
  topic="Microservices vs monolith for this feature"
)
```

**Collaborative Problem-Solving:**
For complex issues requiring multiple perspectives:
```
collaborative_solve(
  problem="Optimize this query that's slow at scale while maintaining ACID guarantees",
  approach="sequential"  # or "parallel" or "debate"
)
```

### Security Review Workflow

For security-sensitive code:

1. Run automated security scan
2. Manual code review focusing on:
   - Input validation
   - Authentication/authorization
   - Secrets management
   - Error handling (no info leaks)
3. Consult `ask_gemini` with `focus="security"`
4. Check language-specific security section
5. Consider threat modeling for critical paths

### Performance Review Workflow

For performance-critical code:

1. Run complexity analysis
2. Identify algorithmic complexity
3. Check for common performance anti-patterns:
   - N+1 queries
   - Repeated calculations
   - Unnecessary copying
   - Memory leaks
4. Request benchmarks if not provided
5. Use AI collaboration to explore optimization strategies

## Best Practices

### Do's
✅ Run automated tools first to catch obvious issues
✅ Review in multiple focused passes
✅ Be specific and actionable in feedback
✅ Provide code examples for suggestions
✅ Include both criticism and praise
✅ Ask questions to understand intent
✅ Use AI collaboration for complex decisions
✅ Reference language-specific patterns
✅ Check for tests and documentation
✅ Consider the bigger picture (architecture, maintainability)

### Don'ts
❌ Don't try to catch everything in one pass
❌ Don't be vague ("this is bad" without explanation)
❌ Don't nitpick style if there are bigger issues
❌ Don't make assumptions - ask questions
❌ Don't review more than ~500 lines at once without breaks
❌ Don't skip automated tools
❌ Don't forget to acknowledge good work
❌ Don't block on minor style issues

## Resources

**Scripts:**
- `scripts/analyze_complexity.py` - Code complexity metrics
- `scripts/security_scan.py` - Security vulnerability detection

**References:**
- `references/python_patterns.md` - Python best practices and anti-patterns
- `references/javascript_patterns.md` - JavaScript/TypeScript patterns
- `references/review_workflow.md` - Comprehensive review methodology

## Review Checklist

Use this checklist for comprehensive reviews:

**Functionality:**
- [ ] Code solves the stated problem
- [ ] Edge cases handled
- [ ] Error conditions properly managed
- [ ] Tests cover main functionality

**Security:**
- [ ] Input validation present
- [ ] No injection vulnerabilities
- [ ] Secrets not hardcoded
- [ ] Authentication/authorization appropriate

**Quality:**
- [ ] Code is readable and maintainable
- [ ] Follows language conventions
- [ ] No overly complex functions
- [ ] Appropriate abstraction level
- [ ] Documentation exists and is clear

**Testing:**
- [ ] Tests are present
- [ ] Tests cover edge cases
- [ ] Tests are maintainable
- [ ] Tests provide usage examples

**Performance:**
- [ ] No obvious performance issues
- [ ] Appropriate data structures used
- [ ] Algorithmic complexity reasonable
- [ ] Resources properly managed

## Example Review Workflow

```
# 1. Run automated analysis
python scripts/analyze_complexity.py /path/to/code
python scripts/security_scan.py /path/to/code

# 2. Review automated findings
[Review output from tools]

# 3. Read code with multi-pass strategy
[Pass 1: Architecture - 5 min]
[Pass 2: Logic - 15-20 min]
[Pass 3: Security - 10 min] 
[Pass 4: Tests - 10 min]
[Pass 5: Style - 5 min]

# 4. Consult language-specific guide for deeper analysis
[Read relevant sections of python_patterns.md or javascript_patterns.md]

# 5. For complex issues, use AI collaboration
ai_consensus(question="Best approach for handling this race condition?")

# 6. Provide structured, categorized feedback
[Organize feedback by severity, be specific, provide examples]
```

## Summary

This skill provides a complete code review system combining:
1. **Automated tools** for quick wins (complexity, security)
2. **Structured methodology** for thorough review (multi-pass)
3. **Language-specific expertise** for deep analysis (Python, JS/TS)
4. **AI collaboration** for complex decisions
5. **Clear communication** for effective feedback

By following this systematic approach, you can provide high-quality, actionable code reviews that improve code quality, security, and maintainability.
