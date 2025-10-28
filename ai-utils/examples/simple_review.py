"""
Simple code review example demonstrating memory & context management.

This shows how Claude learns from reviewing code and applies that knowledge
in subsequent reviews.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from code_review_assistant import create_assistant

# Load environment variables
load_dotenv()

# Sample code with a race condition bug
CODE_WITH_BUG = """
import asyncio
from typing import List, Dict, Any

class DataProcessor:
    def __init__(self):
        self.results = []  # Shared state!
        self.error_count = 0

    async def process_item(self, item: Dict[str, Any]) -> None:
        try:
            # Simulate processing
            await asyncio.sleep(0.1)
            self.results.append(item)  # RACE CONDITION!
        except Exception:
            self.error_count += 1  # RACE CONDITION!

    async def process_batch(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        tasks = [self.process_item(item) for item in items]
        await asyncio.gather(*tasks)
        return self.results
"""

# Similar code with the same pattern
CODE_SIMILAR = """
from concurrent.futures import ThreadPoolExecutor
from typing import List

class TaskRunner:
    def __init__(self):
        self.completed_tasks = []

    def run_task(self, task_id: int) -> dict:
        # Do work...
        result = {"id": task_id, "status": "done"}
        self.completed_tasks.append(result)  # BUG: Race condition!
        return result

    def run_all(self, task_ids: List[int]) -> List[dict]:
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(self.run_task, tid) for tid in task_ids]
            for future in futures:
                future.result()
        return self.completed_tasks
"""


def main():
    print("=" * 70)
    print("CODE REVIEW ASSISTANT - MEMORY & CONTEXT MANAGEMENT DEMO")
    print("=" * 70)
    print()

    # Create assistant
    print("Initializing code review assistant...")
    assistant = create_assistant(memory_path="./demo_memory")
    print("✓ Assistant ready\n")

    # Session 1: Review code with bug
    print("=" * 70)
    print("SESSION 1: Learning from a bug")
    print("=" * 70)
    print()

    result1 = assistant.review_code(
        code=CODE_WITH_BUG,
        filename="data_processor.py",
        description="Async data processor that sometimes loses results",
    )

    print(f"📝 Review for data_processor.py:")
    print(f"Issues found: {result1['issues_found']}")
    print(f"Tokens used: {result1['token_usage']['input_tokens']:,} input, "
          f"{result1['token_usage']['output_tokens']:,} output")
    print()
    print(result1['review'][:500] + "..." if len(result1['review']) > 500 else result1['review'])
    print()

    # Session 2: Review similar code (new conversation)
    print("=" * 70)
    print("SESSION 2: Applying learned pattern")
    print("=" * 70)
    print()

    # Clear conversation but keep memory
    assistant.clear_conversation()

    result2 = assistant.review_code(
        code=CODE_SIMILAR,
        filename="task_runner.py",
        description="Thread-based task runner",
    )

    print(f"📝 Review for task_runner.py:")
    print(f"Issues found: {result2['issues_found']}")
    print(f"Tokens used: {result2['token_usage']['input_tokens']:,} input, "
          f"{result2['token_usage']['output_tokens']:,} output")
    print()
    print(result2['review'][:500] + "..." if len(result2['review']) > 500 else result2['review'])
    print()

    # Show memory stats
    print("=" * 70)
    print("MEMORY STATISTICS")
    print("=" * 70)
    stats = assistant.get_memory_stats()
    print(f"Memory files: {stats['total_files']}")
    print(f"Memory size: {stats['total_size_kb']} KB")
    print()

    print("✅ Demo complete!")
    print()
    print("Next steps:")
    print("1. Check ./demo_memory/memories/ to see what Claude learned")
    print("2. Run again to see Claude apply the learned patterns faster")
    print("3. Try reviewing your own code!")


if __name__ == "__main__":
    main()
