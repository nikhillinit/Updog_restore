"""
Pull Request review example - integrates with your existing codebase.

This demonstrates reviewing multiple files from a PR and building
project-specific knowledge over time.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from code_review_assistant import create_assistant

# Load environment variables
load_dotenv()


def load_file_for_review(filepath: str) -> str:
    """Load a file from your repository for review."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return f"// File not found: {filepath}"


def review_pr_from_git_diff():
    """
    Example: Review files changed in the current git branch.

    In a real integration, you'd:
    1. Get changed files from git diff or GitHub API
    2. Load each file's content
    3. Send to the assistant for review
    4. Post results as PR comments
    """
    print("=" * 70)
    print("PULL REQUEST REVIEW EXAMPLE")
    print("=" * 70)
    print()

    # Create assistant
    print("Initializing code review assistant...")
    assistant = create_assistant(memory_path="./pr_memory")
    print("✓ Assistant ready\n")

    # Example: Review specific files from your project
    files_to_review = [
        {
            "filename": "client/src/lib/waterfall.ts",
            "content": load_file_for_review("../client/src/lib/waterfall.ts"),
        },
        {
            "filename": "client/src/lib/__tests__/waterfall.test.ts",
            "content": load_file_for_review("../client/src/lib/__tests__/waterfall.test.ts"),
        },
    ]

    # Filter out files that weren't found
    files_to_review = [f for f in files_to_review if not f["content"].startswith("// File not found")]

    if not files_to_review:
        print("⚠️ No files found to review. Make sure you're running from ai-utils/examples/")
        print("   and the project files exist.")
        return

    print(f"Reviewing {len(files_to_review)} files...\n")

    # Review the PR
    result = assistant.review_pr(
        files=files_to_review,
        pr_description="Waterfall calculation improvements and bug fixes",
        pr_number=123,
    )

    # Display results
    print("=" * 70)
    print("REVIEW RESULTS")
    print("=" * 70)
    print()

    for review in result["reviews"]:
        print(f"📄 {review['filename']}")
        print(f"   Issues: {review['issues_found']}")
        print()
        # Show first 300 chars of review
        preview = review['review'][:300] + "..." if len(review['review']) > 300 else review['review']
        print(f"   {preview}")
        print()

    # Summary
    summary = result["summary"]
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Files reviewed: {summary['total_files']}")
    print(f"Total issues: {summary['total_issues']}")
    print(f"Input tokens: {summary['token_usage']['input_tokens']:,}")
    print(f"Output tokens: {summary['token_usage']['output_tokens']:,}")
    print(f"Context cleared: {'Yes' if summary['context_cleared'] else 'No'}")
    print()

    # Memory stats
    stats = assistant.get_memory_stats()
    print(f"Memory files: {stats['total_files']}")
    print(f"Memory size: {stats['total_size_kb']} KB")
    print()

    print("✅ PR review complete!")


def review_waterfall_code():
    """
    Specialized review for waterfall (carry distribution) code.

    This demonstrates domain-specific reviews that learn your project's
    patterns and conventions.
    """
    print("=" * 70)
    print("WATERFALL CODE REVIEW (Domain-Specific)")
    print("=" * 70)
    print()

    assistant = create_assistant(memory_path="./waterfall_memory")

    # Load waterfall code
    waterfall_file = "../client/src/lib/waterfall.ts"
    try:
        with open(waterfall_file, "r", encoding="utf-8") as f:
            waterfall_code = f.read()
    except FileNotFoundError:
        print(f"⚠️ File not found: {waterfall_file}")
        print("   Make sure you're running from ai-utils/examples/")
        return

    print("Reviewing waterfall.ts with domain expertise...\n")

    result = assistant.review_code(
        code=waterfall_code,
        filename="waterfall.ts",
        description="Core waterfall calculation logic with type-safe helpers",
        context={
            "domain": "Venture capital carry distribution",
            "conventions": "Use applyWaterfallChange() and changeWaterfallType() helpers",
            "patterns": "Immutable updates, schema validation, value clamping",
        },
    )

    print(f"📝 Review Results:")
    print(f"Issues found: {result['issues_found']}")
    print(f"Tokens used: {result['token_usage']['input_tokens']:,} input, "
          f"{result['token_usage']['output_tokens']:,} output")
    print()

    # Show full review
    print(result['review'])
    print()

    print("✅ Domain-specific review complete!")
    print()
    print("💡 The assistant now knows your waterfall patterns and will apply")
    print("   this knowledge in future reviews of similar code.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="PR review examples")
    parser.add_argument(
        "--mode",
        choices=["pr", "waterfall"],
        default="pr",
        help="Review mode: 'pr' for full PR review, 'waterfall' for domain-specific",
    )
    args = parser.parse_args()

    if args.mode == "pr":
        review_pr_from_git_diff()
    else:
        review_waterfall_code()
