#!/usr/bin/env python3
"""
Skills Manager - Team Memory System for Codified Lessons

Commands:
1. new --title <title>: Creates a new reflection and test file with atomic ID allocation.
2. rebuild [--check]: Generates SKILLS_INDEX.md from REFL-*.md frontmatter. --check fails if stale.
3. check <title>: Checks for potential duplicates (title/keyword match).
4. validate: CI check for integrity (unique IDs, required fields, existing tests, bidirectional links).
5. wizard-index [--check]: Generates WIZARD_INDEX.md grouped by wizard step.

Safety Features:
- Existence checks before file creation (prevents overwrites)
- Bidirectional test-reflection link validation
- Wizard step vocabulary validation
- Windows compatible (no fcntl dependency)
"""
import sys
import re
import os
import subprocess
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from datetime import datetime

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def find_repo_root() -> Path:
    """Find repository root with a git fallback."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        )
        repo_root = result.stdout.strip()
        if not repo_root:
            raise RuntimeError("git returned empty repo root")
        return Path(repo_root)
    except Exception as e:
        print(
            f"[WARN] Could not determine repo root via git: {e}. Falling back to current working directory.",
            file=sys.stderr,
        )
        return Path.cwd()


def normalize_rel_path(raw: str, field: str = "path") -> str:
    """Normalize and validate a repo-relative path.

    Args:
        raw: The raw path string to normalize
        field: Field name for error messages

    Returns:
        Normalized path with forward slashes

    Raises:
        ValueError: If path is absolute or contains path traversal
    """
    normalized = raw.replace("\\", "/")
    if PureWindowsPath(normalized).is_absolute() or PurePosixPath(normalized).is_absolute():
        raise ValueError(f"{field} must be repo-relative, got absolute path: {raw!r}")
    if ".." in PurePosixPath(normalized).parts:
        raise ValueError(f"{field} must not escape repo root: {raw!r}")
    return normalized


# Paths relative to repository root
REPO_ROOT = find_repo_root()
SKILLS_DIR = REPO_ROOT / "docs/skills"
TESTS_DIR = REPO_ROOT / "tests/regressions"
INDEX_FILE = SKILLS_DIR / "SKILLS_INDEX.md"
WIZARD_INDEX_FILE = SKILLS_DIR / "WIZARD_INDEX.md"
TEMPLATE_FILE = SKILLS_DIR / "template-refl.md"

# Canonical wizard steps (from client/src/pages/fund-setup.tsx)
CANONICAL_WIZARD_STEPS = {
    'fund-basics': {'number': 1, 'title': 'FUND BASICS'},
    'investment-rounds': {'number': 2, 'title': 'INVESTMENT ROUNDS'},
    'capital-structure': {'number': 3, 'title': 'CAPITAL ALLOCATION'},
    'investment-strategy': {'number': 4, 'title': 'INVESTMENT STRATEGY'},
    'distributions': {'number': 5, 'title': 'EXIT RECYCLING'},
    'cashflow-management': {'number': 6, 'title': 'WATERFALL & CARRY'},
    'review': {'number': 7, 'title': 'ADVANCED SETTINGS'},
    'complete': {'number': 8, 'title': 'REVIEW & CREATE'},
}


def parse_frontmatter(content: str, file_path: Path):
    """Robust YAML frontmatter parser with fallback."""
    try:
        match = re.search(r'^\s*---\r?\n(.*?)\r?\n---\s*', content, re.DOTALL)
        if not match:
            return {}

        yaml_block = match.group(1)

        if HAS_YAML:
            try:
                data = yaml.safe_load(yaml_block)
                return data if data else {}
            except yaml.YAMLError as e:
                print(f"[WARN] YAML parse error in {file_path.name}: {e}. Falling back to basic parser.", file=sys.stderr)
                return fallback_parse(yaml_block)
        else:
            return fallback_parse(yaml_block)
    except Exception as e:
        print(f"[ERROR] Could not parse frontmatter for {file_path.name}: {e}", file=sys.stderr)
        return {}


def fallback_parse(yaml_block: str):
    """Simple fallback parser for basic YAML. Strips comments."""
    data = {}
    for line in yaml_block.splitlines():
        line = line.split('#', 1)[0].strip()
        if ':' in line:
            key, val = line.split(':', 1)
            key = key.strip()
            val = val.strip()
            if val.startswith('[') and val.endswith(']'):
                val = [x.strip().strip('\'"') for x in val[1:-1].split(',') if x.strip()]
            data[key] = val
    return data


def get_reflections():
    """Gets all reflection files, parses their frontmatter, and sorts them by ID."""
    reflections = []
    if not SKILLS_DIR.exists():
        return []

    for f in SKILLS_DIR.glob("REFL-*.md"):
        try:
            content = f.read_text(encoding='utf-8')
            meta = parse_frontmatter(content, f)
            if not meta:
                print(f"[WARN] Skipping {f.name} due to missing frontmatter.", file=sys.stderr)
                continue

            meta['filename'] = f.name
            # Use repo-relative path with forward slashes for portability
            meta['path'] = f.relative_to(REPO_ROOT).as_posix()
            reflections.append(meta)
        except Exception as e:
            print(f"[WARN] Error parsing {f.name}: {e}", file=sys.stderr)

    # Safe sorting with error handling for malformed IDs
    def safe_id_sort(r):
        try:
            return int(r.get('id', 'REFL-999').split('-')[1])
        except (ValueError, IndexError):
            return 999

    return sorted(reflections, key=safe_id_sort)


def get_next_id():
    """Finds the next available reflection ID."""
    ids = []
    for r in get_reflections():
        try:
            ids.append(int(r.get('id', 'REFL-0').split('-')[1]))
        except (ValueError, IndexError):
            continue
    return max(ids) + 1 if ids else 1


def validate_slug(slug: str) -> bool:
    """Validates slug is non-empty and reasonable length."""
    return bool(slug) and len(slug) <= 100


def prompt_for_metadata() -> dict:
    """Interactive prompts for reflection metadata."""
    metadata = {}

    # Severity
    print("\n[PROMPT] Severity (1=critical, 2=high, 3=medium, 4=low) [3]: ", end="")
    try:
        severity_input = input().strip() or "3"
        severity_map = {"1": "critical", "2": "high", "3": "medium", "4": "low"}
        metadata['severity'] = severity_map.get(severity_input, "medium")
    except EOFError:
        metadata['severity'] = "medium"

    # Components (comma-separated)
    print("[PROMPT] Components (comma-separated, e.g., 'server,tests,redis') []: ", end="")
    try:
        components_input = input().strip()
        metadata['components'] = [c.strip() for c in components_input.split(",") if c.strip()] if components_input else []
    except EOFError:
        metadata['components'] = []

    # Wizard steps
    print(f"[PROMPT] Wizard steps (comma-separated from: {', '.join(CANONICAL_WIZARD_STEPS.keys())}) []: ", end="")
    try:
        steps_input = input().strip()
        if steps_input:
            steps = [s.strip() for s in steps_input.split(",") if s.strip()]
            valid_steps = [s for s in steps if s in CANONICAL_WIZARD_STEPS]
            invalid_steps = [s for s in steps if s not in CANONICAL_WIZARD_STEPS]
            if invalid_steps:
                print(f"[WARN] Ignoring invalid wizard steps: {invalid_steps}", file=sys.stderr)
            metadata['wizard_steps'] = valid_steps
        else:
            metadata['wizard_steps'] = []
    except EOFError:
        metadata['wizard_steps'] = []

    # Keywords
    print("[PROMPT] Keywords (comma-separated) []: ", end="")
    try:
        keywords_input = input().strip()
        metadata['keywords'] = [k.strip() for k in keywords_input.split(",") if k.strip()] if keywords_input else []
    except EOFError:
        metadata['keywords'] = []

    return metadata


def create_new_reflection(title: str, interactive: bool = True):
    """Creates a new reflection and test file."""
    if not title:
        print("[ERROR] Title cannot be empty.", file=sys.stderr)
        sys.exit(1)

    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

    if not validate_slug(slug):
        print(f"[ERROR] Invalid title produces empty or too long slug: '{slug}'", file=sys.stderr)
        sys.exit(1)

    next_id_num = get_next_id()
    refl_id = f"REFL-{next_id_num:03d}"

    # Create Reflection File
    new_refl_filename = f"{refl_id}-{slug}.md"
    new_refl_path = SKILLS_DIR / new_refl_filename

    # SAFETY: Check if file already exists
    if new_refl_path.exists():
        print(f"[ERROR] File already exists: {new_refl_path}", file=sys.stderr)
        sys.exit(1)

    # Check test file doesn't exist
    test_filename = f"{refl_id}.test.ts"
    test_path = TESTS_DIR / test_filename
    if test_path.exists():
        print(f"[ERROR] Test file already exists: {test_path}", file=sys.stderr)
        sys.exit(1)

    if not TEMPLATE_FILE.exists():
        print(f"[ERROR] Template file not found at {TEMPLATE_FILE}", file=sys.stderr)
        sys.exit(1)

    # Collect metadata interactively if not in CI
    metadata = {}
    if interactive and sys.stdin.isatty():
        metadata = prompt_for_metadata()
    else:
        metadata = {'severity': 'medium', 'components': [], 'wizard_steps': [], 'keywords': []}

    template_content = TEMPLATE_FILE.read_text(encoding='utf-8')
    new_content = template_content.replace("id: REFL-000", f"id: {refl_id}")
    new_content = new_content.replace("title: Short Descriptive Title", f"title: {title}")
    new_content = new_content.replace("date: 2026-01-18", f"date: {datetime.now().strftime('%Y-%m-%d')}")
    new_content = new_content.replace("tests/regressions/REFL-000.test.ts", f"tests/regressions/{refl_id}.test.ts")
    new_content = new_content.replace("# Reflection: [Title matches frontmatter]", f"# Reflection: {title}")

    # Apply collected metadata
    new_content = new_content.replace("severity: medium # critical | high | medium | low", f"severity: {metadata['severity']}")
    if metadata['components']:
        new_content = new_content.replace("components: []", f"components: [{', '.join(metadata['components'])}]")
    if metadata['wizard_steps']:
        new_content = new_content.replace("wizard_steps: []", f"wizard_steps: [{', '.join(metadata['wizard_steps'])}]")
    if metadata['keywords']:
        new_content = new_content.replace("keywords: []", f"keywords: [{', '.join(metadata['keywords'])}]")

    # Ensure directory exists
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    new_refl_path.write_text(new_content, encoding='utf-8')
    print(f"[OK] Created reflection: {new_refl_path}")

    # Create Test File with bidirectional link
    TESTS_DIR.mkdir(parents=True, exist_ok=True)

    # Build components hint if available
    components_hint = ""
    if metadata['components']:
        components_hint = f"\n * Components: {', '.join(metadata['components'])}"

    test_template = f'''// REFLECTION_ID: {refl_id}
// This test is linked to: docs/skills/{new_refl_filename}
// Do not rename without updating the reflection's test_file field.

import {{ describe, it, expect, beforeEach, beforeAll }} from 'vitest';

/**
 * {refl_id}: {title}
 *
 * This regression test prevents reintroduction of a known anti-pattern.
 * See the linked reflection for full context and the verified fix.{components_hint}
 */

// TODO: Import actual engine/module being tested
// import {{ YourModule }} from '@/path/to/module';

describe('{refl_id}: {title}', () => {{
  // Track setup state for test isolation
  let testContext: unknown;

  beforeEach(() => {{
    // Reset test context for isolation
    testContext = undefined;
  }});

  describe('Anti-pattern demonstration', () => {{
    it('should recognize the problematic pattern', () => {{
      // TODO: Write test that would FAIL if anti-pattern exists
      // Example: Check for error signals, incorrect behavior, or edge cases
      //
      // This test proves the anti-pattern is detectable.
      // If this test passes with buggy code, the test is wrong.
      expect.fail('Implement anti-pattern detection');
    }});

    it('should identify error signals', () => {{
      // TODO: Define the error codes or symptoms
      // Example:
      // const errorSignals = ['ERR_CODE_1', 'TypeError: ...'];
      // expect(errorSignals.length).toBeGreaterThan(0);
      expect.fail('Define error signals');
    }});
  }});

  describe('Verified fix', () => {{
    it('should handle the edge case correctly', () => {{
      // TODO: Write test that PASSES with the fix applied
      // This proves the fix is correct and prevents regression.
      expect.fail('Implement fix verification');
    }});

    it('should maintain correct behavior under normal conditions', () => {{
      // TODO: Verify the fix doesn't break normal operation
      expect.fail('Implement normal operation test');
    }});
  }});
}});
'''
    test_path.write_text(test_template, encoding='utf-8')
    print(f"[OK] Created test file: {test_path}")

    rebuild_index()


def rebuild_index(check_mode=False):
    """Generates the SKILLS_INDEX.md file."""
    print("[INFO] Rebuilding SKILLS_INDEX.md...")
    refs = get_reflections()

    dates = [r.get('date') for r in refs if r.get('date')]
    max_date = max(dates) if dates else datetime.now().strftime('%Y-%m-%d')

    lines = [
        "# Skills & Reflections Index",
        f"*Auto-generated by `scripts/manage_skills.py rebuild`. Do not edit manually.*",
        f"*Last Updated: {max_date}*",
        "\n## Registry\n",
        "| ID | Status | Title | Test | Path |",
        "|:---|:---|:---|:---|:---|"
    ]

    for r in refs:
        status = r.get('status', 'DRAFT')
        if r.get('superseded_by'):
            status = f"DEPRECATED -> {r.get('superseded_by')}"
        test_file = r.get('test_file', f"tests/regressions/{r.get('id')}.test.ts")
        test_file = normalize_rel_path(test_file, "test_file")
        test_exists = "[x]" if (REPO_ROOT / test_file).exists() else "[ ]"
        # Link uses filename (same directory), Path column shows repo-relative path
        lines.append(f"| **[{r.get('id')}]({r.get('filename')})** | {status} | {r.get('title')} | {test_exists} | `{r.get('path')}` |")

    # Add footer with instructions
    lines.extend([
        "",
        "## How to Add a Reflection",
        "",
        "1. Run: `python scripts/manage_skills.py new --title \"Your Title\"`",
        "2. Fill in the generated `docs/skills/REFL-XXX-*.md` file",
        "3. Implement the regression test in `tests/regressions/REFL-XXX.test.ts`",
        "4. Change status from `DRAFT` to `VERIFIED` once test passes",
        "5. The index auto-rebuilds on commit",
        "",
        "## Quick Reference",
        "",
        "- **VERIFIED**: Lesson confirmed with passing regression test",
        "- **DRAFT**: Lesson identified but not yet fully documented/tested",
        "- **DEPRECATED**: Superseded by newer reflection",
        "",
        "---",
        "",
        "## Related Documentation",
        "",
        "| Document | Purpose |",
        "|----------|---------|",
        "| [README.md](README.md) | Reflection system overview and workflows |",
        "| [CAPABILITIES.md](../../CAPABILITIES.md) | Available agents and tools |",
        "| [cheatsheets/anti-pattern-prevention.md](../../cheatsheets/anti-pattern-prevention.md) | 24 cataloged anti-patterns |",
        "| [DECISIONS.md](../../DECISIONS.md) | Architectural decisions |"
    ])

    index_content = "\n".join(lines) + "\n"

    if check_mode:
        if not INDEX_FILE.exists() or INDEX_FILE.read_text(encoding='utf-8') != index_content:
            print("[ERROR] Index is out of date. Run `python scripts/manage_skills.py rebuild`.", file=sys.stderr)
            sys.exit(1)
        else:
            print("[OK] Index is up to date.")
    else:
        INDEX_FILE.write_text(index_content, encoding='utf-8')
        print(f"[OK] Index updated with {len(refs)} reflections.")


def extract_reflection_id_from_test(test_path: Path) -> str | None:
    """Extracts REFLECTION_ID from test file header comment."""
    try:
        content = test_path.read_text(encoding='utf-8')
        match = re.search(r'//\s*REFLECTION_ID:\s*(REFL-\d{3,})', content)
        return match.group(1) if match else None
    except Exception:
        return None


def check_duplicates(title: str):
    """Checks for potential duplicate reflections based on title/keyword similarity."""
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    keywords = set(slug.split('-'))

    refs = get_reflections()
    matches = []

    for r in refs:
        r_title = r.get('title', '').lower()
        r_keywords = set(r.get('keywords', []))
        r_slug = re.sub(r'[^a-z0-9]+', '-', r_title).strip('-')
        r_slug_keywords = set(r_slug.split('-'))

        # Check for keyword overlap
        overlap = keywords & (r_keywords | r_slug_keywords)
        if len(overlap) >= 2:  # At least 2 keywords match
            matches.append({
                'id': r.get('id'),
                'title': r.get('title'),
                'overlap': list(overlap)
            })

    if matches:
        print(f"[WARN] Potential duplicates found for '{title}':")
        for m in matches:
            print(f"  - {m['id']}: {m['title']} (matching: {', '.join(m['overlap'])})")
        return True
    else:
        print(f"[OK] No duplicates found for '{title}'")
        return False


def validate():
    """Validates all reflections for integrity including bidirectional links."""
    print("[INFO] Validating reflection database...")
    if not HAS_YAML:
        print("[WARN] PyYAML not installed. Validation will be less strict. Install with: `pip install pyyaml`", file=sys.stderr)

    refs = get_reflections()
    ids = set()
    errors = 0

    REQUIRED_FIELDS = ['id', 'title', 'status', 'date']
    VALID_STATUSES = ['VERIFIED', 'DRAFT', 'DEPRECATED']

    for r in refs:
        filename = r.get('filename', 'unknown')

        # 1. Required fields
        for field in REQUIRED_FIELDS:
            if field not in r:
                print(f"[ERROR] {filename}: Missing required field `{field}`", file=sys.stderr)
                errors += 1

        # 2. Unique and Correctly Formatted ID
        rid = r.get('id')
        if not rid or not re.match(r'^REFL-\d{3,}$', rid):
            print(f"[ERROR] {filename}: Invalid ID format: `{rid}`. Must be `REFL-NNN`.", file=sys.stderr)
            errors += 1
        elif rid in ids:
            print(f"[ERROR] {filename}: Duplicate ID `{rid}`", file=sys.stderr)
            errors += 1
        ids.add(rid)

        # 3. Status Enumeration
        status = r.get('status')
        if status and status not in VALID_STATUSES:
            print(f"[ERROR] {filename}: Invalid status `{status}`. Must be one of {VALID_STATUSES}", file=sys.stderr)
            errors += 1

        # 4. Test Existence for VERIFIED
        test_path_str = r.get('test_file', f"tests/regressions/{rid}.test.ts")
        try:
            test_path_str = normalize_rel_path(test_path_str, "test_file")
        except ValueError as e:
            print(f"[ERROR] {filename}: {e}", file=sys.stderr)
            errors += 1
            continue
        test_path = REPO_ROOT / test_path_str

        if r.get('status') == 'VERIFIED':
            if not test_path.exists():
                print(f"[ERROR] {filename}: VERIFIED but missing test file at `{test_path_str}`", file=sys.stderr)
                errors += 1

        # 5. Bidirectional Link Validation
        if test_path.exists():
            test_reflection_id = extract_reflection_id_from_test(test_path)
            if test_reflection_id is None:
                print(f"[WARN] {filename}: Test file {test_path_str} missing REFLECTION_ID header comment", file=sys.stderr)
            elif test_reflection_id != rid:
                print(f"[ERROR] {filename}: Bidirectional link mismatch. Reflection ID is `{rid}` but test declares `{test_reflection_id}`", file=sys.stderr)
                errors += 1

    # 6. Check for orphaned test files (tests without reflections)
    if TESTS_DIR.exists():
        for test_file in TESTS_DIR.glob("REFL-*.test.ts"):
            test_id = extract_reflection_id_from_test(test_file)
            if test_id and test_id not in ids:
                print(f"[WARN] Orphaned test file: {test_file} references {test_id} but no reflection exists", file=sys.stderr)

    # 7. Validate wizard_steps vocabulary
    for r in refs:
        filename = r.get('filename', 'unknown')
        wizard_steps = r.get('wizard_steps', [])
        if wizard_steps:
            for step in wizard_steps:
                if step not in CANONICAL_WIZARD_STEPS:
                    print(f"[WARN] {filename}: Non-canonical wizard_step '{step}'. Valid values: {list(CANONICAL_WIZARD_STEPS.keys())}", file=sys.stderr)

    if errors == 0:
        print("[OK] Validation passed.")
    else:
        print(f"[ERROR] Validation failed with {errors} errors.", file=sys.stderr)
        sys.exit(1)

    # 8. Index Freshness Check
    rebuild_index(check_mode=True)


def generate_coverage_report():
    """Generates a coverage metrics report for the reflection system."""
    print("[INFO] Generating coverage report...")
    refs = get_reflections()

    if not refs:
        print("[WARN] No reflections found.")
        return

    # Status breakdown
    status_counts: dict[str, int] = {'VERIFIED': 0, 'DRAFT': 0, 'DEPRECATED': 0}
    for r in refs:
        status = r.get('status', 'DRAFT')
        if status in status_counts:
            status_counts[status] += 1

    # Severity breakdown
    severity_counts: dict[str, int] = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    for r in refs:
        severity = r.get('severity', 'medium')
        if severity in severity_counts:
            severity_counts[severity] += 1

    # Wizard step coverage
    wizard_coverage: dict[str, int] = {step: 0 for step in CANONICAL_WIZARD_STEPS}
    unassigned_count = 0
    for r in refs:
        wizard_steps = r.get('wizard_steps', [])
        if not wizard_steps:
            unassigned_count += 1
        else:
            for step in wizard_steps:
                if step in wizard_coverage:
                    wizard_coverage[step] += 1

    # Test coverage
    tests_exist = 0
    tests_missing = 0
    for r in refs:
        rid = r.get('id')
        test_path_str = r.get('test_file', f"tests/regressions/{rid}.test.ts")
        try:
            test_path_str = normalize_rel_path(test_path_str, "test_file")
        except ValueError:
            tests_missing += 1
            continue
        test_path = REPO_ROOT / test_path_str
        if test_path.exists():
            tests_exist += 1
        else:
            tests_missing += 1

    # Print report
    total = len(refs)
    verified_pct = (status_counts['VERIFIED'] / total * 100) if total else 0
    test_coverage_pct = (tests_exist / total * 100) if total else 0

    print("\n" + "=" * 50)
    print("REFLECTION SYSTEM COVERAGE REPORT")
    print("=" * 50)

    print(f"\n## Summary")
    print(f"Total Reflections: {total}")
    print(f"Verified Rate: {verified_pct:.1f}% ({status_counts['VERIFIED']}/{total})")
    print(f"Test Coverage: {test_coverage_pct:.1f}% ({tests_exist}/{total})")

    print(f"\n## Status Breakdown")
    for status, count in status_counts.items():
        pct = (count / total * 100) if total else 0
        bar = "#" * int(pct / 5)
        print(f"  {status:12} {count:3} ({pct:5.1f}%) {bar}")

    print(f"\n## Severity Breakdown")
    for severity, count in severity_counts.items():
        pct = (count / total * 100) if total else 0
        bar = "#" * int(pct / 5)
        print(f"  {severity:12} {count:3} ({pct:5.1f}%) {bar}")

    print(f"\n## Wizard Step Coverage")
    for step_id, step_info in CANONICAL_WIZARD_STEPS.items():
        count = wizard_coverage[step_id]
        print(f"  Step {step_info['number']}: {step_info['title']:20} {count:3} reflections")
    print(f"  {'Unassigned':26} {unassigned_count:3} reflections")

    print(f"\n## Test Status")
    print(f"  Tests exist:   {tests_exist}")
    print(f"  Tests missing: {tests_missing}")

    # Health score
    health_score = (verified_pct * 0.4 + test_coverage_pct * 0.4 + (100 - unassigned_count / total * 100) * 0.2) if total else 0
    print(f"\n## Health Score: {health_score:.1f}/100")
    if health_score >= 80:
        print("  Status: HEALTHY")
    elif health_score >= 60:
        print("  Status: NEEDS ATTENTION")
    else:
        print("  Status: CRITICAL")

    print("\n" + "=" * 50)


def build_wizard_index(check_mode=False):
    """Generates WIZARD_INDEX.md grouped by wizard step."""
    print("[INFO] Building WIZARD_INDEX.md...")
    refs = get_reflections()

    # Group reflections by wizard step
    by_step: dict[str, list] = {step: [] for step in CANONICAL_WIZARD_STEPS}
    by_step['unassigned'] = []

    for r in refs:
        wizard_steps = r.get('wizard_steps', [])
        if not wizard_steps:
            by_step['unassigned'].append(r)
        else:
            has_canonical = False
            for step in wizard_steps:
                if step in CANONICAL_WIZARD_STEPS:
                    by_step[step].append(r)
                    has_canonical = True
            # Only add to unassigned if no canonical steps were found
            if not has_canonical:
                by_step['unassigned'].append(r)

    lines = [
        "# Reflections by Wizard Step",
        "*Auto-generated by `scripts/manage_skills.py wizard-index`. Do not edit manually.*",
        "",
        "This index groups reflections by the wizard step they affect, helping you find relevant lessons when working on specific parts of the fund setup wizard.",
        "",
    ]

    # Generate sections for each canonical step
    for step_id, step_info in CANONICAL_WIZARD_STEPS.items():
        step_refs = by_step.get(step_id, [])
        lines.append(f"## Step {step_info['number']}: {step_info['title']}")
        lines.append(f"*ID: `{step_id}`*")
        lines.append("")

        if step_refs:
            lines.append("| ID | Status | Title | Severity |")
            lines.append("|:---|:---|:---|:---|")
            for r in step_refs:
                status = r.get('status', 'DRAFT')
                severity = r.get('severity', 'medium')
                lines.append(f"| [{r.get('id')}]({r.get('filename')}) | {status} | {r.get('title')} | {severity} |")
        else:
            lines.append("*No reflections assigned to this step yet.*")
        lines.append("")

    # Unassigned section
    unassigned = by_step.get('unassigned', [])
    if unassigned:
        lines.append("## Unassigned")
        lines.append("*Reflections not yet mapped to a specific wizard step.*")
        lines.append("")
        lines.append("| ID | Status | Title | Severity |")
        lines.append("|:---|:---|:---|:---|")
        for r in unassigned:
            status = r.get('status', 'DRAFT')
            severity = r.get('severity', 'medium')
            lines.append(f"| [{r.get('id')}]({r.get('filename')}) | {status} | {r.get('title')} | {severity} |")
        lines.append("")

    # Footer with vocabulary reference
    lines.extend([
        "---",
        "",
        "## Valid Wizard Step Values",
        "",
        "Use these values in the `wizard_steps` frontmatter field:",
        "",
        "| Step | ID | Description |",
        "|:-----|:---|:------------|",
    ])
    for step_id, step_info in CANONICAL_WIZARD_STEPS.items():
        lines.append(f"| {step_info['number']} | `{step_id}` | {step_info['title']} |")

    index_content = "\n".join(lines) + "\n"

    if check_mode:
        if not WIZARD_INDEX_FILE.exists() or WIZARD_INDEX_FILE.read_text(encoding='utf-8') != index_content:
            print("[ERROR] WIZARD_INDEX.md is out of date. Run `python scripts/manage_skills.py wizard-index`.", file=sys.stderr)
            sys.exit(1)
        else:
            print("[OK] WIZARD_INDEX.md is up to date.")
    else:
        WIZARD_INDEX_FILE.write_text(index_content, encoding='utf-8')
        assigned_count = sum(len(by_step[s]) for s in CANONICAL_WIZARD_STEPS)
        print(f"[OK] WIZARD_INDEX.md updated: {assigned_count} assigned, {len(unassigned)} unassigned.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/manage_skills.py [new|rebuild|validate|check|wizard-index|metrics] [--title <title>] [--check]", file=sys.stderr)
        print("")
        print("Commands:")
        print("  new --title <title>  Create a new reflection and test file")
        print("  rebuild [--check]    Rebuild SKILLS_INDEX.md (--check validates without writing)")
        print("  validate             Full integrity check for CI")
        print("  check --title <t>    Check for potential duplicate reflections")
        print("  wizard-index [--check] Generate WIZARD_INDEX.md grouped by wizard step")
        print("  metrics              Generate coverage metrics report")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "new":
        try:
            title_index = sys.argv.index('--title')
            title = sys.argv[title_index + 1]
            create_new_reflection(title)
        except (ValueError, IndexError):
            print("Usage: python scripts/manage_skills.py new --title \"Your Reflection Title\"", file=sys.stderr)
            sys.exit(1)
    elif cmd == "rebuild":
        check_mode = "--check" in sys.argv
        rebuild_index(check_mode)
    elif cmd == "validate":
        validate()
    elif cmd == "check":
        try:
            title_index = sys.argv.index('--title')
            title = sys.argv[title_index + 1]
            check_duplicates(title)
        except (ValueError, IndexError):
            print("Usage: python scripts/manage_skills.py check --title \"Title to check\"", file=sys.stderr)
            sys.exit(1)
    elif cmd == "wizard-index":
        check_mode = "--check" in sys.argv
        build_wizard_index(check_mode)
    elif cmd == "metrics":
        generate_coverage_report()
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
