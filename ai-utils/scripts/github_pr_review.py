"""
GitHub PR Review Script

Integrates with GitHub Actions to provide AI-powered code reviews
with cross-conversation learning.
"""

import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from code_review_assistant import create_assistant


def get_file_content(filepath: str) -> str:
    """Read file content from repository."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"// Error reading file: {e}"


def format_review_as_markdown(reviews: List[Dict], summary: Dict) -> str:
    """Format review results as GitHub-flavored markdown."""
    lines = []

    # Summary
    lines.append("### Summary")
    lines.append("")
    lines.append(f"- **Files reviewed:** {summary['total_files']}")
    lines.append(f"- **Issues found:** {summary['total_issues']}")
    lines.append(f"- **Token usage:** {summary['token_usage']['input_tokens']:,} input, "
                 f"{summary['token_usage']['output_tokens']:,} output")
    lines.append("")

    if summary['total_issues'] == 0:
        lines.append("✅ **No issues found!** Code looks good.")
        return "\n".join(lines)

    # Individual file reviews
    lines.append("### Detailed Reviews")
    lines.append("")

    for review in reviews:
        if review['issues_found'] == 0:
            lines.append(f"#### ✅ `{review['filename']}` - No issues")
            continue

        lines.append(f"#### `{review['filename']}` - {review['issues_found']} issue(s)")
        lines.append("")
        lines.append("<details>")
        lines.append(f"<summary>Show review</summary>")
        lines.append("")
        lines.append(review['review'])
        lines.append("")
        lines.append("</details>")
        lines.append("")

    # Learning note
    lines.append("---")
    lines.append("")
    lines.append("💡 **Note:** This AI assistant learns from your codebase and improves over time. ")
    lines.append("Patterns identified in this review will be remembered for future PRs.")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="AI-powered GitHub PR review")
    parser.add_argument("--pr-number", required=True, type=int, help="PR number")
    parser.add_argument("--changed-files", required=True, help="Comma-separated list of changed files")
    parser.add_argument("--repo", required=True, help="Repository (owner/repo)")
    args = parser.parse_args()

    # Parse changed files
    changed_files = [f.strip() for f in args.changed_files.split(",") if f.strip()]

    if not changed_files:
        print("No files to review")
        sys.exit(0)

    print(f"Reviewing PR #{args.pr_number} in {args.repo}")
    print(f"Changed files: {len(changed_files)}")

    # Create assistant with persistent memory
    # Memory is stored in the repository so it persists across PR reviews
    assistant = create_assistant(memory_path="./.ai_memory")

    # Load file contents
    files_to_review = []
    for filepath in changed_files:
        # Skip certain files
        if any(skip in filepath for skip in ['node_modules/', 'dist/', '.test.', '.spec.']):
            continue

        content = get_file_content(filepath)
        if not content.startswith("// Error"):
            files_to_review.append({
                "filename": filepath,
                "content": content,
            })

    if not files_to_review:
        print("No reviewable files found")
        sys.exit(0)

    print(f"Reviewing {len(files_to_review)} files...")

    # Perform review
    result = assistant.review_pr(
        files=files_to_review,
        pr_description=f"PR #{args.pr_number}",
        pr_number=args.pr_number,
    )

    # Format as markdown
    markdown = format_review_as_markdown(result['reviews'], result['summary'])

    # Write output
    output_path = Path(__file__).parent.parent / "review_output.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"✓ Review complete")
    print(f"  Issues found: {result['summary']['total_issues']}")
    print(f"  Output: {output_path}")

    # Exit with code 1 if critical issues found (optional)
    # This would fail the CI check
    # if result['summary']['total_issues'] > 0:
    #     sys.exit(1)


if __name__ == "__main__":
    main()
