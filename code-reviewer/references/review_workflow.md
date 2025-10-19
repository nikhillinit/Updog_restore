# Code Review Workflow Guide

## Table of Contents
1. Review Preparation
2. Multi-Pass Review Strategy
3. AI Collaboration Patterns
4. Feedback Communication
5. Review Levels by Context

## 1. Review Preparation

### Before Starting Review

1. **Understand the Context**
   - What problem is being solved?
   - What are the acceptance criteria?
   - Are there related issues or PRs?
   - What's the expected impact and risk level?

2. **Assess Code Size**
   - Small change (<100 lines): Quick review
   - Medium change (100-500 lines): Standard review
   - Large change (>500 lines): Break into logical chunks
   - Very large change (>1000 lines): Consider requesting split

3. **Identify Review Focus Areas**
   - New feature → Functionality, architecture, tests
   - Bug fix → Root cause, edge cases, regression prevention
   - Refactoring → Improved design, maintained behavior
   - Performance → Benchmarks, profiling results
   - Security → Threat modeling, input validation

## 2. Multi-Pass Review Strategy

### Pass 1: High-Level Architecture (5 minutes)
**Goal:** Understand overall design and identify major issues

**Check for:**
- Overall approach makes sense
- Fits within existing architecture
- No obvious design flaws
- Appropriate abstraction levels
- Files organized logically

**Questions to ask:**
- Is this the right solution to the problem?
- Are there simpler alternatives?
- Does it follow existing patterns?
- Will it scale appropriately?

### Pass 2: Logic and Correctness (15-20 minutes)
**Goal:** Verify the code does what it's supposed to

**Check for:**
- Core logic is correct
- Edge cases handled
- Error handling appropriate
- Null/undefined checks where needed
- Race conditions or timing issues
- Off-by-one errors
- Resource leaks

**Focus areas:**
- Conditional logic (if/else, switch)
- Loop boundaries
- Async operations
- State management
- Data transformations

### Pass 3: Security and Safety (10 minutes)
**Goal:** Identify security vulnerabilities

**Run automated scan:**
```bash
# Use the security scan script
python scripts/security_scan.py <file_or_directory>
```

**Manual checks:**
- Input validation present
- SQL/NoSQL injection prevention
- XSS prevention
- Authentication/authorization checks
- Secrets not hardcoded
- Proper error messages (no sensitive info leak)
- Rate limiting where needed
- CSRF protection for state changes

### Pass 4: Tests and Documentation (10 minutes)
**Goal:** Ensure code is testable and understandable

**Check for:**
- Tests cover main functionality
- Edge cases tested
- Tests are maintainable
- Documentation updated
- Comments explain "why" not "what"
- Public APIs documented
- Breaking changes noted

**Ask:**
- Can I understand what this does without running it?
- Are the test names clear?
- Do tests provide good examples of usage?

### Pass 5: Style and Best Practices (5 minutes)
**Goal:** Ensure code maintainability

**Check for:**
- Follows language conventions
- Naming is clear and consistent
- No overly complex functions
- DRY principle followed
- Performance considerations reasonable
- No code smells

**Run complexity analysis:**
```bash
# Use the complexity analysis script
python scripts/analyze_complexity.py <file_or_directory>
```

## 3. AI Collaboration Patterns

The Multi-AI Collaboration tools can be leveraged for different aspects of review:

### Pattern 1: Consensus on Architecture
When unsure about architectural decisions:

```
Use: ai_consensus
Question: "Should this feature use a service layer or direct database access?"
Options: "Service layer with dependency injection OR Direct database access with repository pattern"
```

### Pattern 2: Security Deep Dive
For security-critical code:

```
Use: ask_gemini with focus="security"
Prompt: "Review this authentication handler for security vulnerabilities"
```

### Pattern 3: Comparative Analysis
For complex refactoring decisions:

```
Use: ask_all_ais
Prompt: "What are the trade-offs of implementing caching at the database layer vs application layer for this use case?"
```

### Pattern 4: Debate Complex Trade-offs
When there are competing approaches:

```
Use: ai_debate
Topic: "Microservices vs Monolith for this new feature given our team size and timeline"
```

### Pattern 5: Collaborative Problem Solving
For complex bugs or optimizations:

```
Use: collaborative_solve
Problem: "This query is slow at scale. How can we optimize it while maintaining data consistency?"
```

## 4. Feedback Communication

### Feedback Levels

**🔴 Critical (Must Fix)**
- Security vulnerabilities
- Data corruption risks
- Breaking changes without migration
- Critical bugs
- Memory leaks or resource exhaustion

Example:
> 🔴 **Critical:** This allows SQL injection. Use parameterized queries:
> ```python
> cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
> ```

**🟠 Major (Should Fix)**
- Incorrect logic
- Missing error handling
- Performance issues
- Missing tests for core functionality
- Poor architecture choices

Example:
> 🟠 **Major:** This function doesn't handle the case when the array is empty, which will cause a crash. Add a guard clause:
> ```javascript
> if (items.length === 0) return defaultValue;
> ```

**🟡 Minor (Nice to Have)**
- Style inconsistencies
- Suboptimal but working code
- Missing edge case tests
- Documentation improvements
- Naming suggestions

Example:
> 🟡 **Minor:** Consider using a more descriptive name like `calculateUserMetrics` instead of `process`.

**🟢 Praise (Positive Feedback)**
- Elegant solutions
- Good test coverage
- Clear documentation
- Performance improvements
- Security considerations

Example:
> 🟢 **Nice!** Great use of the factory pattern here. This makes testing much easier.

### Feedback Structure

**1. Start with Context**
Explain what you're seeing and why it matters.

❌ "This is wrong."
✅ "This function doesn't validate the input, which means invalid data could corrupt the database."

**2. Be Specific**
Point to exact lines and explain the issue.

❌ "Fix the error handling."
✅ "Line 45: This catch block swallows the exception. Either log it or re-throw:
```python
except ValueError as e:
    logger.error(f"Invalid input: {e}")
    raise
```"

**3. Suggest Solutions**
Provide actionable alternatives.

❌ "This is inefficient."
✅ "This loops through all items twice (O(n²)). Consider using a Set for O(n):
```python
seen = set()
unique_items = [x for x in items if x not in seen and not seen.add(x)]
```"

**4. Ask Questions**
Seek to understand before judging.

❌ "Why did you do it this way?"
✅ "I'm curious about the choice to use polling here. Have you considered using event listeners instead? Is there a specific reason polling is preferred?"

**5. Acknowledge Good Work**
Positive reinforcement improves code quality over time.

✅ "The test coverage here is excellent. I especially appreciate the edge case tests for empty inputs."

## 5. Review Levels by Context

### Level 1: Quick Review (<5 minutes)
**When:**
- Hotfix or urgent change
- Documentation only
- Very small change (<20 lines)
- Low risk area

**Focus:**
- Does it solve the immediate problem?
- Are there obvious bugs?
- Basic security check

### Level 2: Standard Review (15-30 minutes)
**When:**
- Regular feature work
- Typical bug fixes
- Most PRs

**Focus:**
- All five passes (Architecture, Logic, Security, Tests, Style)
- Run automated tools
- Provide comprehensive feedback

### Level 3: Deep Review (1-2 hours)
**When:**
- Core infrastructure changes
- Security-sensitive code
- Complex algorithms
- Major refactoring
- Public API changes

**Focus:**
- Multiple reviewers
- Pair programming session
- Performance profiling
- Security audit
- Consider AI collaboration for multiple perspectives
- Comprehensive test scenarios

### Level 4: Architecture Review (2-4 hours)
**When:**
- New service or major component
- Significant architectural changes
- System design decisions

**Focus:**
- Design document review
- Stakeholder alignment
- Scalability analysis
- Cost implications
- Use ai_consensus or ai_debate for major decisions
- Consider proof-of-concept

## Review Workflow Summary

```
1. Preparation (5 min)
   ↓
2. Automated Scans (2 min)
   - complexity_analyzer.py
   - security_scan.py
   ↓
3. Multi-Pass Review (30 min)
   - Architecture
   - Logic
   - Security
   - Tests
   - Style
   ↓
4. AI Consultation (optional, 5-10 min)
   - For complex decisions
   - For security verification
   - For architectural validation
   ↓
5. Provide Feedback (10 min)
   - Categorize by severity
   - Be specific and actionable
   - Include praise
   ↓
6. Follow-up (ongoing)
   - Track addressed issues
   - Verify fixes
   - Learn from patterns
```

## Red Flags Checklist

Stop and escalate if you see:

- [ ] Credentials or secrets in code
- [ ] SQL injection vulnerabilities
- [ ] No input validation on user data
- [ ] Disabled security features
- [ ] eval() or exec() with user input
- [ ] No tests for critical functionality
- [ ] Recursive functions without base case
- [ ] Infinite loop potential
- [ ] Race conditions in concurrent code
- [ ] Breaking changes without deprecation
- [ ] Extremely high complexity (>500 lines in one function)
- [ ] Copied-pasted code from unknown sources
