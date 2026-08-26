"""
Review staged files before commit.

This script reviews only the files that are staged in git,
providing quick feedback before you commit.
"""

import sys
import subprocess
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from code_review_assistant import create_assistant


def get_staged_files():
    """Get list of staged TypeScript/JavaScript files."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            capture_output=True,
            text=True,
            check=True,
        )

        files = result.stdout.strip().split("\n")

        # Filter for TS/JS files only
        code_files = [
            f for f in files
            if f and any(f.endswith(ext) for ext in [".ts", ".tsx", ".js", ".jsx"])
            and "node_modules" not in f
            and not any(skip in f for skip in [".test.", ".spec.", "dist/"])
        ]

        return code_files
    except subprocess.CalledProcessError:
        return []


def main():
    """Review staged files."""
    import argparse

    parser = argparse.ArgumentParser(description="Review staged files")
    parser.add_argument("--quick", action="store_true", help="Quick mode: only critical issues")
    parser.add_argument("--fail-on-issues", action="store_true", help="Exit with code 1 if issues found")
    args = parser.parse_args()

    staged_files = get_staged_files()

    if not staged_files:
        print("✅ No TypeScript/JavaScript files staged")
        return 0

    print(f"🔍 Reviewing {len(staged_files)} staged file(s)...")
    print()

    # Create assistant with session memory
    assistant = create_assistant(memory_path="./.ai_memory")

    total_issues = 0
    critical_issues = 0

    for filepath in staged_files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            print(f"⚠️  {filepath}: Cannot read ({e})")
            continue

        result = assistant.review_code(
            code=content,
            filename=filepath,
            description="Pre-commit review",
        )

        issues = result["issues_found"]
        total_issues += issues

        # Count critical issues (🔴 emoji)
        critical = result["review"].count("🔴")
        critical_issues += critical

        if issues > 0:
            print(f"📄 {filepath}")
            print(f"   Issues: {issues} ({critical} critical)")

            if not args.quick:
                # Show first 200 chars of review
                preview = result["review"][:200] + "..." if len(result["review"]) > 200 else result["review"]
                print(f"   {preview}")

            print()

    # Summary
    print("─" * 60)
    if total_issues == 0:
        print("✅ No issues found in staged files")
        return 0
    else:
        print(f"⚠️  Found {total_issues} issue(s) ({critical_issues} critical)")
        print()
        print("To see full review: python ai-utils/examples/pr_review.py")

        if args.fail_on_issues and critical_issues > 0:
            print()
            print("❌ Critical issues found - commit blocked")
            return 1

        return 0


if __name__ == "__main__":
    sys.exit(main())
