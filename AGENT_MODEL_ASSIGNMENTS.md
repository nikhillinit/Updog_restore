# Optimized Agent-Model Assignments for TypeScript Fix

## Model Capabilities Matrix

### Tier 1: Complex Schema & Architecture
- **Claude Opus**: Deep reasoning, complex refactoring
- **Gemini Code Assistant**: Specialized for code understanding & refactoring
- **Moonshot Kimi K2**: Strong mathematical reasoning & code analysis
- **Claude Sonnet 3.5**: Balance of speed and capability
- **Zencoder**: Code-specific optimizations and patterns

### Tier 2: Systematic Changes
- **Llama 3.1 Nemotron Ultra**: High-performance systematic refactoring
- **Llama 3.3 Nemotron Super**: Excellent for pattern-based fixes
- **Claude Sonnet 3.0**: Reliable for structured tasks
- **Gemini 2.0 Flash**: Very fast for well-defined tasks

### Tier 3: Simple/Repetitive Tasks
- **Claude Haiku**: Quick fixes, simple patterns
- **Llama 3.1 Nemotron**: Standard repetitive changes
- **Gemini 1.5 Flash**: Rapid simple edits

---

## Agent Assignments with Model Rotation

### Agent 1: Schema & Interface Alignment Specialist
**Complexity**: HIGH - 40+ interconnected property mismatches
**Primary Model**: **Gemini Code Assistant** (specialized for large-scale refactoring)
**Backup Models**: 
1. **Claude Opus** (complex reasoning if needed)
2. **Zencoder** (code-specific patterns)

**Why**: This requires understanding the entire data flow and making architectural decisions about DraftFund vs Fund vs CompleteFundSetup relationships. Gemini Code Assistant excels at understanding large codebases and refactoring patterns.

---

### Agent 2: TypeScript Configuration & Build Engineer  
**Complexity**: MEDIUM - Well-defined config changes
**Primary Model**: **Llama 3.3 Nemotron Super** (excellent at config patterns)
**Backup Models**:
1. **Llama 3.1 Nemotron Ultra** (systematic changes)
2. **Gemini 2.0 Flash** (fast config updates)

**Why**: Configuration changes follow established patterns that Llama excels at. Fast iteration needed.

---

### Agent 3: Component Type Safety Specialist
**Complexity**: MEDIUM-HIGH - React patterns + discriminated unions
**Primary Model**: **Claude Sonnet 3.5** (excellent React understanding)
**Backup Models**:
1. **Gemini 2.0 Flash Thinking** (for complex type unions)
2. **Claude Sonnet 3.0** (reliable fallback)

**Why**: Needs to understand React patterns and create elegant discriminated unions. Sonnet 3.5 has strong React knowledge.

---

### Agent 4: API & Data Flow Specialist
**Complexity**: HIGH - Async types, runtime validation
**Primary Model**: **Zencoder** (specialized in API patterns and type flow)
**Backup Models**:
1. **Gemini Code Assistant** (codebase-wide type understanding)
2. **Claude Opus** (complex async flow reasoning)

**Why**: API boundaries need careful thought about runtime vs compile-time guarantees. Zencoder specializes in understanding data flow and API patterns.

---

## Parallel Sub-Agents for Quick Wins

### Sub-Agent A: Import Sorter
**Task**: Add eslint-plugin-typescript-sort across all files
**Model**: **Llama 3.1 Nemotron** (systematic, repetitive)
**Branch**: `ts-fix/imports`

### Sub-Agent B: Dead Code Eliminator  
**Task**: Run ts-prune and remove unused exports
**Model**: **Claude Haiku** (quick analysis)
**Branch**: `ts-fix/dead-code`

### Sub-Agent C: Type Coverage Reporter
**Task**: Set up type-coverage tooling and reporting
**Model**: **Gemini 1.5 Flash** (tool configuration)
**Branch**: `ts-fix/coverage-tools`

### Sub-Agent D: Pattern-Based Fix Specialist
**Task**: Fix all implicit any types and missing property patterns
**Model**: **Llama 3.1 Nemotron Ultra** (high-performance pattern matching)
**Branch**: `ts-fix/implicit-any`

---

## Execution Strategy

### Phase 1: Parallel Quick Wins (30 min)
- **Llama 3.1 8B**: Import sorting
- **Claude Haiku**: Dead code removal  
- **Gemini 1.5 Flash**: Coverage setup
- **Llama 3.3 70B**: TypeScript config

### Phase 2: Core Fixes (2-3 hours)
- **Claude Opus**: Fund schema architecture
- **Gemini 2.0 Flash Thinking**: API patterns exploration
- **Claude Sonnet 3.5**: Component type safety
- **Gemini 2.0 Flash**: Build validation

### Phase 3: Integration & Polish (1 hour)
- **Claude Sonnet 3.5**: Integration branch management
- **Gemini 2.0 Flash**: Final type coverage push
- **Llama 3.3 70B**: Performance validation

---

## Model-Specific Instructions

### For Gemini 2.0 Flash Thinking
```
<thinking>
Explore multiple approaches to the type problem before implementing.
Consider runtime vs compile-time tradeoffs.
</thinking>
```

### For Claude Models
```
Focus on maintainability and type safety.
Prefer discriminated unions over type assertions.
Document complex type decisions.
```

### For Llama Models
```
Follow established patterns in the codebase.
Focus on consistency across similar fixes.
Use existing utilities where available.
```

---

## Load Balancing Strategy

If primary model is busy/slow:
1. Check if task can be decomposed
2. Use backup model for exploration
3. Return to primary for final implementation
4. Document any model-specific quirks

## Success Metrics by Model

- **Opus**: Architectural elegance score
- **Gemini Thinking**: Ideas explored vs implemented
- **Sonnet 3.5**: Type coverage increase
- **Llama 3.3**: Build time improvement
- **Others**: Error count reduction

---

## Communication Protocol

Each agent posts to Slack/Discord:
```
[Model: Gemini 2.0] [Agent 4] 
Starting API boundary analysis
Branch: ts-fix/api-data
Errors: 35 → targeting 0
```

Updates every 30 min or major milestone.