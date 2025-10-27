# NotebookLM Documentation Commands - Setup & Testing Guide

**Status**: ✅ Commands Created (2025-10-26) **Location**: `.claude/commands/`
**Author**: AI-assisted implementation

---

## 📦 What Was Created

Three production-ready slash commands for NotebookLM documentation generation:

### 1. `/notebooklm-generate [component]`

**File**: `.claude/commands/notebooklm-generate.md` **Purpose**: Multi-agent
orchestration for comprehensive documentation generation **Key Features**:

- 8-phase workflow (dependency analysis → validation → assembly)
- Topological processing (DocAgent's 8% accuracy improvement)
- 95%+ accuracy validation gate
- Iterative refinement loops
- ~300 lines, copy-paste ready

### 2. `/doc-validate [file]`

**File**: `.claude/commands/doc-validate.md` **Purpose**: Validate existing
documentation for accuracy **Key Features**:

- Three-dimensional quality (Truthfulness + Completeness + Helpfulness)
- Entity verification (DocAgent's Existence Ratio metric)
- AST-based validation (prevents hallucination)
- Structured reporting (ASCII-art output)
- ~250 lines, copy-paste ready

### 3. `/behavioral-spec [test-file]`

**File**: `.claude/commands/behavioral-spec.md` **Purpose**: Extract behavioral
specifications from Vitest tests **Key Features**:

- Test assertion → behavioral spec conversion
- Edge case identification
- Test coverage analysis
- Dependency mapping (test → implementation)
- ~200 lines, copy-paste ready

---

## ✅ Verification Steps

### Step 1: Confirm Files Exist

```bash
# From project root (c:\dev\Updog_restore\)
ls .claude/commands/notebooklm-*.md
ls .claude/commands/doc-validate.md
ls .claude/commands/behavioral-spec.md

# Expected output:
.claude/commands/notebooklm-generate.md
.claude/commands/doc-validate.md
.claude/commands/behavioral-spec.md
```

### Step 2: Verify File Contents

```bash
# Check file sizes (should be substantial)
Get-ChildItem .claude/commands/notebooklm-*.md, .claude/commands/doc-validate.md, .claude/commands/behavioral-spec.md | Select-Object Name, Length

# Expected:
Name                       Length
----                       ------
notebooklm-generate.md     ~24000 bytes
doc-validate.md            ~20000 bytes
behavioral-spec.md         ~17000 bytes
```

### Step 3: Verify YAML Frontmatter

```bash
# Check that each file has valid frontmatter
head -n 3 .claude/commands/notebooklm-generate.md
head -n 3 .claude/commands/doc-validate.md
head -n 3 .claude/commands/behavioral-spec.md

# Each should show:
---
description: [One-sentence description]
---
```

---

## 🧪 Testing the Commands

### Test 1: Command Discovery

**In Claude Code chat**:

```
User: "What slash commands are available for NotebookLM?"
```

**Expected Response**: Claude should list:

- `/notebooklm-generate` - Generate documentation
- `/doc-validate` - Validate documentation
- `/behavioral-spec` - Extract test specifications

**✅ Pass Criteria**: All 3 commands mentioned

---

### Test 2: `/notebooklm-generate` - Workflow Execution

**Test Case**: Generate documentation for waterfall.ts

```
User: "/notebooklm-generate client/src/lib/waterfall.ts"
```

**Expected Workflow** (Claude should execute these phases):

1. **Phase 1: Dependency Analysis**
   - ✅ Finds waterfall.ts
   - ✅ Identifies dependencies (shared/db/schema/waterfalls.ts)
   - ✅ Produces topological order

2. **Phase 2: Code Structure Extraction**
   - ✅ Uses code-explorer agent (or reads file directly)
   - ✅ Extracts functions: applyWaterfallChange, changeWaterfallType
   - ✅ Extracts types: WaterfallType, WaterfallField

3. **Phase 3: Behavioral Spec Extraction**
   - ✅ Finds test file: waterfall.test.ts
   - ✅ Extracts 19 test cases
   - ✅ Identifies edge cases (hurdle clamping, etc.)

4. **Phase 4: Documentation Generation**
   - ✅ Uses docs-architect agent
   - ✅ Generates comprehensive markdown
   - ✅ Includes all required sections

5. **Phase 5: Validation**
   - ✅ Verifies entities (95%+ accuracy)
   - ✅ Checks completeness (100% required sections)
   - ✅ Evaluates helpfulness (4.0/5.0)

6. **Phase 6: Iterative Refinement** (if <95%)
   - ⏸️ Triggers if validation fails
   - ✅ Re-extracts context
   - ✅ Regenerates documentation

7. **Phase 7: Final Assembly**
   - ✅ Formats for NotebookLM
   - ✅ Saves to docs/notebooklm-sources/
   - ✅ Generates summary report

8. **Phase 8: Human Review Checkpoint**
   - ⏸️ Pauses for expert review
   - ✅ Provides review checklist

**✅ Pass Criteria**:

- All 8 phases execute successfully
- Final accuracy ≥ 95%
- Documentation saved to docs/notebooklm-sources/waterfall.md
- Total time < 5 minutes

**Example Success Output**:

```
📄 Documentation Generated: waterfall.ts

✅ Truthfulness: 96.3% (52/54 entities verified)
✅ Completeness: 100% (7/7 sections present)
✅ Helpfulness: 4.2/5.0
✅ Test Coverage: 19 test cases documented
✅ Total Time: 2m 14s

Output: docs/notebooklm-sources/waterfall.md

⏸️ HUMAN REVIEW CHECKPOINT
Please review documentation before ingesting into NotebookLM.
```

---

### Test 3: `/doc-validate` - Validation Execution

**Test Case**: Validate existing waterfall documentation

```
User: "/doc-validate docs/waterfall-guide.md"
```

**Expected Workflow**:

1. **Phase 1: Entity Extraction & Verification**
   - ✅ Extracts entities from documentation
   - ✅ Builds ground truth from code (AST parsing)
   - ✅ Calculates Existence Ratio

2. **Phase 2: Completeness Validation**
   - ✅ Identifies required sections
   - ✅ Checks present sections
   - ✅ Calculates completeness score

3. **Phase 3: Helpfulness Evaluation**
   - ✅ LLM-as-judge evaluation
   - ✅ Scores clarity, examples, parameters, context
   - ✅ Calculates average helpfulness

**Expected Output** (ASCII-art report):

```
╔══════════════════════════════════════════════════════════╗
║              DOCUMENTATION VALIDATION REPORT              ║
╠══════════════════════════════════════════════════════════╣
║ File: docs/waterfall-guide.md                            ║
║ Source: client/src/lib/waterfall.ts                      ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║ 📊 TRUTHFULNESS (Entity Verification)                    ║
║    ✅ 96.2% (50/52 entities verified)                    ║
║                                                           ║
║ 📋 COMPLETENESS (Required Sections)                      ║
║    ✅ 100% (7/7 required sections present)               ║
║                                                           ║
║ 💡 HELPFULNESS (LLM-as-Judge)                            ║
║    ✅ 4.2/5.0 (Good to Excellent)                        ║
║                                                           ║
╠══════════════════════════════════════════════════════════╣
║ ✅ VALIDATION PASSED                                     ║
╚══════════════════════════════════════════════════════════╝
```

**✅ Pass Criteria**:

- Truthfulness score calculated
- Completeness score calculated
- Helpfulness score calculated
- Validation result clear (PASS/FAIL)
- Unverified entities listed (if any)

---

### Test 4: `/behavioral-spec` - Spec Extraction

**Test Case**: Extract specs from waterfall tests

```
User: "/behavioral-spec client/src/lib/__tests__/waterfall.test.ts"
```

**Expected Workflow**:

1. **Phase 1: Test File Discovery**
   - ✅ Finds waterfall.test.ts

2. **Phase 2: Test Structure Parsing**
   - ✅ Identifies describe blocks
   - ✅ Extracts it/test blocks
   - ✅ Captures test names

3. **Phase 3: Assertion Analysis**
   - ✅ Parses expect() statements
   - ✅ Extracts expected values
   - ✅ Identifies edge cases

4. **Phase 4: Behavioral Spec Generation**
   - ✅ Converts test names to specs
   - ✅ Maps assertions to behaviors
   - ✅ Generates structured output

5. **Phase 5: Dependency Mapping**
   - ✅ Maps test → implementation file
   - ✅ Identifies coverage gaps

**Expected Output**:

```
╔══════════════════════════════════════════════════════════╗
║         BEHAVIORAL SPECIFICATIONS EXTRACTED              ║
╠══════════════════════════════════════════════════════════╣
║ Test File: client/src/lib/__tests__/waterfall.test.ts   ║
║ Source: client/src/lib/waterfall.ts                     ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║ 📊 SUMMARY                                               ║
║    Total Test Cases: 19                                 ║
║    Behavioral Specs: 19                                 ║
║    Edge Cases: 7                                        ║
║    Functions Tested: 2                                  ║
║    Test Coverage: 67% (2/3 exported functions)          ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║ ✅ EXTRACTION COMPLETE                                   ║
╚══════════════════════════════════════════════════════════╝
```

**✅ Pass Criteria**:

- All test cases extracted
- Edge cases identified
- Behavioral specs generated
- Coverage calculated
- Output saved to docs/behavioral-specs/

---

## 🚨 Common Issues & Solutions

### Issue 1: "Command not found"

**Symptom**:

```
User: "/notebooklm-generate waterfall"
Claude: "I don't recognize that command"
```

**Diagnosis**:

1. Check file location: Files must be in `.claude/commands/` (not subdirectory)
2. Check file extension: Must be `.md`
3. Check file permissions: Ensure readable

**Solution**:

```bash
# Verify files exist in correct location
ls .claude/commands/ | grep -E "(notebooklm|doc-validate|behavioral)"

# Expected output:
notebooklm-generate.md
doc-validate.md
behavioral-spec.md
```

---

### Issue 2: "YAML frontmatter invalid"

**Symptom**: Claude reads the file but doesn't recognize it as a command

**Diagnosis**: Check YAML frontmatter format

**Expected Format**:

```yaml
---
description: One-sentence description here
---
```

**Common Mistakes**: ❌ Missing closing `---` ❌ Extra spaces before description
❌ Multiline description (must be single line)

**Solution**:

```bash
# Check first 3 lines of each file
head -n 3 .claude/commands/notebooklm-generate.md

# Should show exactly:
---
description: Generate comprehensive, validated documentation for NotebookLM with 95%+ accuracy through multi-agent orchestration and topological processing
---
```

---

### Issue 3: "Phase X execution fails"

**Symptom**: Command starts but fails at specific phase (e.g., Phase 5:
Validation)

**Diagnosis**:

- Phase 1 (Dependency Analysis): File not found or imports broken
- Phase 2 (Code Extraction): File not readable or not TypeScript
- Phase 3 (Behavioral Spec): Test file not found
- Phase 4 (Documentation Generation): docs-architect agent unavailable
- Phase 5 (Validation): AST parsing failed

**Solution**:

1. **Check file paths**: Ensure files exist at specified paths
2. **Check file syntax**: Ensure valid TypeScript/Vitest syntax
3. **Check agent availability**: Some phases use agents (code-explorer,
   docs-architect)

---

### Issue 4: "Validation always fails (<95% accuracy)"

**Symptom**:

```
❌ Validation Failed: 60-70% accuracy
```

**Diagnosis**: Topological processing not working (Phase 1 skipped or failed)

**Solution**:

1. Ensure Phase 1 (Dependency Analysis) completes successfully
2. Check dependency graph output shows correct order
3. Verify Phase 4 uses dependency-ordered context (not random)

**Why This Matters** (DocAgent research):

- Random order: 86.75% accuracy
- Topological order: 94.64% accuracy
- **8% improvement** from proper ordering

---

## 📊 Performance Benchmarks

### Expected Performance Targets

| Command                              | Target Time | Actual (Baseline)                   |
| ------------------------------------ | ----------- | ----------------------------------- |
| `/notebooklm-generate` (single file) | <5 min      | TBD (measure on waterfall.ts)       |
| `/doc-validate` (single doc)         | <15 sec     | TBD (measure on waterfall-guide.md) |
| `/behavioral-spec` (single test)     | <5 sec      | TBD (measure on waterfall.test.ts)  |

### Accuracy Targets

| Metric           | Target  | Source                   |
| ---------------- | ------- | ------------------------ |
| **Truthfulness** | 95%+    | DocAgent Existence Ratio |
| **Completeness** | 100%    | AST-based validation     |
| **Helpfulness**  | 4.0/5.0 | LLM-as-judge             |

---

## 🔗 Integration with Existing Infrastructure

### Commands These Work With

- ✅ **/test-smart**: Use to find test files for /behavioral-spec
- ✅ **/fix-auto**: Can fix documentation formatting issues
- ✅ **/deploy-check**: Can integrate doc validation as phase

### Agents These Coordinate

- ✅ **code-explorer**: Code structure extraction (Phase 2)
- ✅ **docs-architect**: Documentation generation (Phase 4)
- ✅ **waterfall-specialist**: Domain validation for waterfall docs
- ✅ **test-automator**: Test coverage analysis
- ✅ **architect-review**: Architectural context

### Memory System Integration

- ✅ **/log-change**: Document when docs generated
- ✅ **CHANGELOG.md**: Track accuracy metrics over time
- ✅ **DECISIONS.md**: Document architecture choices

---

## 📝 Next Steps

### Immediate (After Setup)

1. **Run Test 2** (`/notebooklm-generate waterfall`)
   - Validates full workflow
   - Produces first documentation artifact
   - Establishes baseline metrics

2. **Run Test 3** (`/doc-validate docs/waterfall-guide.md`)
   - If waterfall-guide.md exists, validate it
   - If not, validate output from Test 2

3. **Run Test 4** (`/behavioral-spec waterfall.test.ts`)
   - Extract behavioral specs
   - Compare with Test 2 output (should match)

### Short-Term (Week 1)

4. **Document ReserveEngine Family**
   - `/notebooklm-generate ReserveEngine`
   - Validates topological processing (base → derived classes)

5. **Document PacingEngine**
   - `/notebooklm-generate PacingEngine`
   - Tests engine documentation patterns

6. **Validate All Documentation**
   - `/doc-validate docs/notebooklm-sources/*.md`
   - Ensure 95%+ accuracy across all docs

### Medium-Term (Month 1)

7. **Full Codebase Documentation**
   - Core engines (Reserve, Pacing, Cohort)
   - Waterfall system (schema → helpers → UI)
   - API routes (server/routes/)

8. **Weekly Drift Detection**
   - Re-run `/doc-validate` on all docs
   - Identify documentation drift (code changes invalidating docs)

9. **CI/CD Integration**
   - Add `/doc-validate` to pre-PR checks
   - Fail PR if doc accuracy <95%

---

## 🎯 Success Criteria

### Commands Are Working If:

✅ All 3 commands discoverable in Claude Code ✅ `/notebooklm-generate` produces
docs with 95%+ accuracy ✅ `/doc-validate` detects fabricated entities (100%
precision) ✅ `/behavioral-spec` extracts all test cases correctly ✅ Execution
times meet performance targets ✅ Output quality matches or exceeds DocAgent
benchmarks

---

## 📚 Related Documentation

- **DocAgent ACL 2025 Paper**:
  [https://arxiv.org/abs/2504.08725](https://arxiv.org/abs/2504.08725)
  - Section 3.2: Navigator (topological processing)
  - Section 3.3: Verifier (entity verification)
  - Table 2: Accuracy benchmarks (94.64% with topological processing)

- **wshobson/agents**:
  [https://github.com/wshobson/agents](https://github.com/wshobson/agents)
  - Plugin architecture patterns
  - Multi-agent orchestration
  - Progressive disclosure (token optimization)

- **Your Existing Commands** (for pattern reference):
  - `.claude/commands/test-smart.md`
  - `.claude/commands/deploy-check.md`
  - `.claude/commands/fix-auto.md`

---

## 🤝 Support

If you encounter issues not covered in this guide:

1. **Check command output**: Look for specific error messages
2. **Review phase logs**: Identify which phase failed
3. **Verify file paths**: Ensure all referenced files exist
4. **Check agent availability**: Some phases require agents

**Document issues**: Update this guide with solutions for future reference

---

**Status**: ✅ Commands Created & Documented (2025-10-26) **Next Action**: Run
Test 2 (`/notebooklm-generate waterfall`)
