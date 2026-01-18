#!/usr/bin/env python3
"""
Skills Manager - Team Memory System for Codified Lessons

Commands:
1. new --title <title>: Creates a new reflection and test file with atomic ID allocation.
2. rebuild [--check]: Generates SKILLS_INDEX.md from REFL-*.md frontmatter. --check fails if stale.
3. check <title>: Checks for potential duplicates (title/keyword match).
4. validate: CI check for integrity (unique IDs, required fields, existing tests, bidirectional links).

Safety Features:
- Atomic ID generation with file locking (prevents race conditions)
- Existence checks before file creation (prevents overwrites)
- Bidirectional test-reflection link validation
"""
import sys
import re
import os
import tempfile
from pathlib import Path

# fcntl is Unix-only; Windows uses msvcrt or no locking
try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False
from datetime import datetime
from contextlib import contextmanager

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

SKILLS_DIR = Path("docs/skills")
TESTS_DIR = Path("tests/regressions")
INDEX_FILE = SKILLS_DIR / "SKILLS_INDEX.md"
TEMPLATE_FILE = SKILLS_DIR / "template-refl.md"
LOCK_FILE = Path(".reflection-lock")

# --- File Locking for Atomic Operations ---

@contextmanager
def atomic_lock():
    """Cross-process file lock for atomic ID generation."""
    if not HAS_FCNTL:
        # Windows: proceed without locking (single-user typical)
        yield
        return

    lock_path = SKILLS_DIR / ".lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    lock_fd = None
    try:
        lock_fd = open(lock_path, 'w')
        fcntl.flock(lock_fd.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if lock_fd:
            fcntl.flock(lock_fd.fileno(), fcntl.LOCK_UN)
            lock_fd.close()


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
            # Use path relative to script location, not CWD
            try:
                meta['path'] = f.relative_to(Path.cwd())
            except ValueError:
                # Fallback: use path relative to SKILLS_DIR parent
                meta['path'] = f.relative_to(SKILLS_DIR.parent.parent) if SKILLS_DIR.parent.parent.exists() else f
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
    """Creates a new reflection and test file with atomic ID allocation."""
    if not title:
        print("[ERROR] Title cannot be empty.", file=sys.stderr)
        sys.exit(1)

    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

    if not validate_slug(slug):
        print(f"[ERROR] Invalid title produces empty or too long slug: '{slug}'", file=sys.stderr)
        sys.exit(1)

    # Use file locking for atomic ID generation
    try:
        with atomic_lock():
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

            # Atomic write using temp file + rename
            with tempfile.NamedTemporaryFile(mode='w', dir=SKILLS_DIR, suffix='.md', delete=False, encoding='utf-8') as tmp:
                tmp.write(new_content)
                tmp_path = tmp.name
            os.rename(tmp_path, new_refl_path)
            print(f"[OK] Created reflection: {new_refl_path}")

            # Create Test File with bidirectional link
            TESTS_DIR.mkdir(exist_ok=True)
            test_template = f'''// REFLECTION_ID: {refl_id}
// This test is linked to: docs/skills/{new_refl_filename}
// Do not rename without updating the reflection's test_file field.

import {{ describe, it, expect, beforeEach }} from 'vitest';

// TODO: Import actual engine instead of mocking
// import {{ DeterministicReserveEngine }} from '@/core/engines/reserve-engine';
// import {{ EngineError }} from '@/core/errors';

describe('{refl_id}: {title}', () => {{
  // TODO: Replace with real engine instance
  // let engine: DeterministicReserveEngine;

  beforeEach(() => {{
    // engine = new DeterministicReserveEngine();
  }});

  it('should prevent the anti-pattern (demonstrates the bug)', () => {{
    // TODO: Write test that would FAIL with the old buggy code
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
            # Atomic write for test file
            with tempfile.NamedTemporaryFile(mode='w', dir=TESTS_DIR, suffix='.ts', delete=False, encoding='utf-8') as tmp:
                tmp.write(test_template)
                tmp_path = tmp.name
            os.rename(tmp_path, test_path)
            print(f"[OK] Created test file: {test_path}")

    except (IOError, OSError) as e:
        if 'fcntl' in str(type(e).__module__):
            # Fallback for Windows (no fcntl)
            print("[WARN] File locking not available on this platform. Proceeding without lock.", file=sys.stderr)
            _create_reflection_unlocked(title, slug)
        else:
            raise

    rebuild_index()


def _create_reflection_unlocked(title: str, slug: str):
    """Fallback creation without locking (for Windows)."""
    next_id_num = get_next_id()
    refl_id = f"REFL-{next_id_num:03d}"

    new_refl_filename = f"{refl_id}-{slug}.md"
    new_refl_path = SKILLS_DIR / new_refl_filename

    if new_refl_path.exists():
        print(f"[ERROR] File already exists: {new_refl_path}", file=sys.stderr)
        sys.exit(1)

    test_filename = f"{refl_id}.test.ts"
    test_path = TESTS_DIR / test_filename
    if test_path.exists():
        print(f"[ERROR] Test file already exists: {test_path}", file=sys.stderr)
        sys.exit(1)

    template_content = TEMPLATE_FILE.read_text(encoding='utf-8')
    new_content = template_content.replace("id: REFL-000", f"id: {refl_id}")
    new_content = new_content.replace("title: Short Descriptive Title", f"title: {title}")
    new_content = new_content.replace("date: 2026-01-18", f"date: {datetime.now().strftime('%Y-%m-%d')}")
    new_content = new_content.replace("tests/regressions/REFL-000.test.ts", f"tests/regressions/{refl_id}.test.ts")

    new_refl_path.write_text(new_content, encoding='utf-8')
    print(f"[OK] Created reflection: {new_refl_path}")

    TESTS_DIR.mkdir(exist_ok=True)
    test_template = f'''// REFLECTION_ID: {refl_id}
// This test is linked to: docs/skills/{new_refl_filename}

import {{ describe, it, expect, beforeEach }} from 'vitest';

describe('{refl_id}: {title}', () => {{
  it('should prevent the anti-pattern and verify the fix', () => {{
    expect.fail('Implement regression test');
  }});
}});
'''
    test_path.write_text(test_template, encoding='utf-8')
    print(f"[OK] Created test file: {test_path}")


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

    index_content = "\n".join(lines) + "\n"

    if check_mode:
        if not INDEX_FILE.exists() or INDEX_FILE.read_text(encoding='utf-8') != index_content:
            print("[ERROR] Index is out of date. Run `python3 scripts/manage_skills.py rebuild`.", file=sys.stderr)
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
        print("Usage: ./manage_skills.py [new|rebuild|validate] [--title <title>] [--check]", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "new":
        try:
            title_index = sys.argv.index('--title')
            title = sys.argv[title_index + 1]
            create_new_reflection(title)
        except (ValueError, IndexError):
            print("Usage: ./manage_skills.py new --title \"Your Reflection Title\"", file=sys.stderr)
            sys.exit(1)
    elif cmd == "rebuild":
        check_mode = "--check" in sys.argv
        rebuild_index(check_mode)
    elif cmd == "validate":
        validate()
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
