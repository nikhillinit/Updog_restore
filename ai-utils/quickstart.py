"""
Quick Start Script for AI Code Review

This script helps you get started with the AI code review system.
It will check your setup and run a simple demo.
"""

import os
import sys
from pathlib import Path

def check_environment():
    """Check if environment is properly configured."""
    print("=" * 70)
    print("AI CODE REVIEW - SETUP CHECK")
    print("=" * 70)
    print()

    errors = []
    warnings = []

    # Check Python version
    print("1. Checking Python version...")
    version_info = sys.version_info
    if version_info >= (3, 8):
        print(f"   ✓ Python {version_info.major}.{version_info.minor}.{version_info.micro}")
    else:
        errors.append(f"Python 3.8+ required, found {version_info.major}.{version_info.minor}")

    # Check dependencies
    print("\n2. Checking dependencies...")
    try:
        import anthropic
        print(f"   ✓ anthropic ({anthropic.__version__})")
    except ImportError:
        errors.append("anthropic package not installed. Run: pip install -r requirements.txt")

    try:
        import dotenv
        print(f"   ✓ python-dotenv")
    except ImportError:
        errors.append("python-dotenv not installed. Run: pip install -r requirements.txt")

    # Check API key
    print("\n3. Checking API key...")
    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        masked = api_key[:10] + "..." + api_key[-4:]
        print(f"   ✓ API key found: {masked}")
    else:
        errors.append("ANTHROPIC_API_KEY not found. Copy .env.example to .env and add your key")

    # Check files
    print("\n4. Checking required files...")
    required_files = [
        "memory_tool.py",
        "code_review_assistant.py",
        "requirements.txt",
        ".env.example",
    ]

    for filename in required_files:
        filepath = Path(__file__).parent / filename
        if filepath.exists():
            print(f"   ✓ {filename}")
        else:
            errors.append(f"Missing file: {filename}")

    # Summary
    print("\n" + "=" * 70)
    if errors:
        print("❌ SETUP INCOMPLETE")
        print("\nErrors:")
        for error in errors:
            print(f"  • {error}")
        if warnings:
            print("\nWarnings:")
            for warning in warnings:
                print(f"  • {warning}")
        return False
    else:
        print("✅ SETUP COMPLETE")
        if warnings:
            print("\nWarnings:")
            for warning in warnings:
                print(f"  • {warning}")
        return True


def run_demo():
    """Run a simple demo review."""
    print("\n" + "=" * 70)
    print("RUNNING DEMO")
    print("=" * 70)
    print()

    # Import here after checks pass
    from code_review_assistant import create_assistant

    # Sample code with issues
    sample_code = """
async function processItems(items: Item[]): Promise<Result[]> {
    const results = [];

    for (const item of items) {
        const result = await processOne(item);
        results.push(result);  // Sequential processing - slow!
    }

    return results;
}
"""

    print("Creating code review assistant...")
    assistant = create_assistant(memory_path="./quickstart_memory")

    print("Reviewing sample code...\n")

    result = assistant.review_code(
        code=sample_code,
        filename="processor.ts",
        description="Async item processor",
    )

    print("=" * 70)
    print("REVIEW RESULTS")
    print("=" * 70)
    print()
    print(f"Issues found: {result['issues_found']}")
    print(f"Input tokens: {result['token_usage']['input_tokens']:,}")
    print(f"Output tokens: {result['token_usage']['output_tokens']:,}")
    print()

    # Show first 500 chars of review
    preview_length = 800
    review_text = result['review']
    if len(review_text) > preview_length:
        print(review_text[:preview_length] + "\n\n[... truncated ...]")
    else:
        print(review_text)

    print()
    print("=" * 70)
    print("✅ DEMO COMPLETE")
    print("=" * 70)
    print()
    print("Next steps:")
    print("1. Check ./quickstart_memory/memories/ to see what Claude learned")
    print("2. Run: python examples/simple_review.py")
    print("3. Run: python examples/pr_review.py --mode waterfall")
    print("4. Read ai-utils/README.md for full documentation")


def main():
    """Main entry point."""
    print()

    # Check setup
    if not check_environment():
        print()
        print("Please fix the errors above and try again.")
        sys.exit(1)

    # Ask to run demo
    print()
    response = input("Setup looks good! Run a demo review? (y/n): ").strip().lower()

    if response in ('y', 'yes'):
        try:
            run_demo()
        except Exception as e:
            print()
            print(f"❌ Demo failed: {e}")
            print()
            print("This might be due to:")
            print("  • Invalid API key")
            print("  • Network issues")
            print("  • API rate limits")
            print()
            print("Check your API key and try again.")
            sys.exit(1)
    else:
        print()
        print("Skipping demo. You can run it later with: python quickstart.py")
        print()
        print("To get started:")
        print("  cd examples")
        print("  python simple_review.py")

    print()


if __name__ == "__main__":
    main()
