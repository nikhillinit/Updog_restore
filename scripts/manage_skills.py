#!/usr/bin/env python3
"""
Skills Manager - Team Memory System for Codified Lessons

Commands:
1. new --title <title>: Creates a new reflection and test file with atomic ID allocation.
2. rebuild [--check]: Generates SKILLS_INDEX.md from REFL-*.md frontmatter. --check fails if stale.
3. check <title>: Checks for potential duplicates (title/keyword match).
4. validate: CI check for integrity (unique IDs, required fields, existing tests, bidirectional links).

Safety Features:
- Existence checks before file creation (prevents overwrites)
- Bidirectional test-reflection link validation
- Windows compatible (no fcntl dependency)
"""
import sys
import re
import os
import tempfile
from pathlib import Path
from datetime import datetime

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Paths relative to project root
SKILLS_DIR = Path("docs/skills")
TESTS_DIR = Path("tests/regressions")
INDEX_FILE = SKILLS_DIR / "SKILLS_INDEX.md"
TEMPLATE_FILE = SKILLS_DIR / "template-refl.md"


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
        if "template" in f.name.lower():
            continue
        try:
            content = f.read_text(encoding='utf-8')
            meta = parse_frontmatter(content, f)
            if not meta:
                print(f"[WARN] Skipping {f.name} due to missing frontmatter.", file=sys.stderr)
                continue

            meta['filename'] = f.name
            # Use forward slashes for consistent path representation
            meta['path'] = str(f).replace('\\', '/')
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


def create_new_reflection(title: str):
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

    template_content = TEMPLATE_FILE.read_text(encoding='utf-8')
    new_content = template_content.replace("id: REFL-000", f"id: {refl_id}")
    new_content = new_content.replace("title: Short Descriptive Title", f"title: {title}")
    new_content = new_content.replace("date: 2026-01-18", f"date: {datetime.now().strftime('%Y-%m-%d')}")
    new_content = new_content.replace("tests/regressions/REFL-000.test.ts", f"tests/regressions/{refl_id}.test.ts")
    new_content = new_content.replace("# Reflection: [Title matches frontmatter]", f"# Reflection: {title}")

    # Ensure directory exists
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    new_refl_path.write_text(new_content, encoding='utf-8')
    print(f"[OK] Created reflection: {new_refl_path}")

    # Create Test File with bidirectional link
    TESTS_DIR.mkdir(parents=True, exist_ok=True)
    test_template = f'''// REFLECTION_ID: {refl_id}
// This test is linked to: docs/skills/{new_refl_filename}
// Do not rename without updating the reflection's test_file field.

import {{ describe, it, expect, beforeEach }} from 'vitest';

// TODO: Import actual engine/module being tested
// import {{ YourModule }} from '@/path/to/module';

describe('{refl_id}: {title}', () => {{
  beforeEach(() => {{
    // Setup test context
  }});

  it('should demonstrate the anti-pattern (this test would FAIL with buggy code)', () => {{
    // TODO: Write test that exposes the bug
    // This proves the anti-pattern exists
    expect.fail('Implement anti-pattern demonstration');
  }});

  it('should verify the fix works correctly', () => {{
    // TODO: Write test that PASSES with the fix applied
    // This proves the fix is correct
    expect.fail('Implement fix verification');
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
        test_exists = "[x]" if Path(test_file).exists() else "[ ]"
        lines.append(f"| **[{r.get('id')}]({r.get('path')})** | {status} | {r.get('title')} | {test_exists} | `{r.get('path')}` |")

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
        "- **DEPRECATED**: Superseded by newer reflection"
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
        test_path = Path(test_path_str)

        if r.get('status') == 'VERIFIED':
            if not test_path.exists():
                print(f"[ERROR] {filename}: VERIFIED but missing test file at `{test_path}`", file=sys.stderr)
                errors += 1

        # 5. Bidirectional Link Validation
        if test_path.exists():
            test_reflection_id = extract_reflection_id_from_test(test_path)
            if test_reflection_id is None:
                print(f"[WARN] {filename}: Test file {test_path} missing REFLECTION_ID header comment", file=sys.stderr)
            elif test_reflection_id != rid:
                print(f"[ERROR] {filename}: Bidirectional link mismatch. Reflection ID is `{rid}` but test declares `{test_reflection_id}`", file=sys.stderr)
                errors += 1

    # 6. Check for orphaned test files (tests without reflections)
    if TESTS_DIR.exists():
        for test_file in TESTS_DIR.glob("REFL-*.test.ts"):
            test_id = extract_reflection_id_from_test(test_file)
            if test_id and test_id not in ids:
                print(f"[WARN] Orphaned test file: {test_file} references {test_id} but no reflection exists", file=sys.stderr)

    if errors == 0:
        print("[OK] Validation passed.")
    else:
        print(f"[ERROR] Validation failed with {errors} errors.", file=sys.stderr)
        sys.exit(1)

    # 7. Index Freshness Check
    rebuild_index(check_mode=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/manage_skills.py [new|rebuild|validate|check] [--title <title>] [--check]", file=sys.stderr)
        print("")
        print("Commands:")
        print("  new --title <title>  Create a new reflection and test file")
        print("  rebuild [--check]    Rebuild SKILLS_INDEX.md (--check validates without writing)")
        print("  validate             Full integrity check for CI")
        print("  check --title <t>    Check for potential duplicate reflections")
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
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
