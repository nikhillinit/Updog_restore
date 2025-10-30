"""
Code Review Assistant with Memory & Context Management

Integrates with your VC fund modeling platform to provide intelligent
code reviews that learn and improve over time.
"""

import os
from typing import List, Dict, Any, Optional, cast
from anthropic import Anthropic
from anthropic.types import Message, ToolUseBlock, TextBlock
from memory_tool import MemoryToolHandler


# Context management configuration
CONTEXT_MANAGEMENT = {
    "edits": [
        {
            "type": "clear_tool_uses_20250919",
            "trigger": {"type": "input_tokens", "value": 50000},  # Trigger at 50k tokens
            "keep": {"type": "tool_uses", "value": 5},  # Keep last 5 tool uses
            "clear_at_least": {"type": "input_tokens", "value": 3000},  # Clear at least 3k tokens
        }
    ]
}


class CodeReviewAssistant:
    """
    AI-powered code review assistant with cross-conversation learning.

    Features:
    - Learns patterns from past reviews
    - Recognizes similar issues instantly
    - Builds project-specific knowledge
    - Manages context automatically for long sessions
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "claude-sonnet-4-5",
        memory_storage_path: str = "./memory_storage",
    ):
        """
        Initialize the code review assistant.

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
            model: Claude model to use
            memory_storage_path: Directory for memory storage
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not found in environment")

        self.model = model
        self.client = Anthropic(api_key=self.api_key)
        self.memory_handler = MemoryToolHandler(base_path=memory_storage_path)
        self.messages: List[Dict[str, Any]] = []

    def _create_system_prompt(self) -> str:
        """Create the system prompt for code reviews."""
        return """You are an expert code reviewer for a TypeScript/Node.js VC fund modeling platform.

Your role is to:
1. **Learn from patterns**: Use your memory tool to store and recall code patterns, bugs, and solutions
2. **Review code thoroughly**: Check for bugs, security issues, performance problems, and style violations
3. **Be specific**: Reference exact file locations and line numbers
4. **Focus on critical issues first**: Prioritize security, correctness, then performance, then style

When you encounter a new pattern or issue:
- Check your memory first to see if you've seen it before
- Document the pattern in your memory for future reference
- Build up your knowledge of this specific codebase

Memory organization suggestions:
- `/memories/patterns/` - Code patterns and anti-patterns
- `/memories/bugs/` - Common bugs and their fixes
- `/memories/project_rules/` - Project-specific conventions
- `/memories/review_history.md` - Track review progress

Be concise but thorough. Always use your memory tool to improve over time."""

    def review_code(
        self,
        code: str,
        filename: str,
        description: str = "",
        context: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Review a code file with AI assistance.

        Args:
            code: The code content to review
            filename: Name of the file being reviewed
            description: Optional description of the changes
            context: Optional additional context (related files, PR description, etc.)

        Returns:
            Dict containing:
                - review: The AI's review text
                - issues_found: Number of issues identified
                - token_usage: Token consumption stats
                - context_cleared: Whether context was cleared during review
        """
        # Build the review request
        request_parts = [f"Review this file: **{filename}**"]

        if description:
            request_parts.append(f"\n**Description**: {description}")

        if context:
            request_parts.append("\n**Context**:")
            for key, value in context.items():
                request_parts.append(f"- {key}: {value}")

        request_parts.append(f"\n```typescript\n{code}\n```")

        # Add message to conversation
        self.messages.append({
            "role": "user",
            "content": "\n".join(request_parts),
        })

        # Run conversation loop with tool execution
        response, review_text, context_cleared = self._run_conversation_loop()

        # Count issues (heuristic: count of 🔴, ⚠️, 💡 emojis)
        issues_found = (
            review_text.count("🔴") +
            review_text.count("⚠️") +
            review_text.count("💡")
        )

        return {
            "review": review_text,
            "issues_found": issues_found,
            "token_usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            "context_cleared": context_cleared,
        }

    def review_pr(
        self,
        files: List[Dict[str, str]],
        pr_description: str = "",
        pr_number: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Review an entire pull request with multiple files.

        Args:
            files: List of dicts with 'filename' and 'content' keys
            pr_description: Description of the PR
            pr_number: Optional PR number for reference

        Returns:
            Dict containing aggregated review results
        """
        pr_context = f"PR #{pr_number}" if pr_number else "Pull Request"

        # Add PR context message
        self.messages.append({
            "role": "user",
            "content": f"Reviewing {pr_context}: {pr_description}\n\nTotal files: {len(files)}",
        })

        reviews = []
        total_issues = 0
        total_input_tokens = 0
        total_output_tokens = 0
        any_context_cleared = False

        for file_info in files:
            result = self.review_code(
                code=file_info["content"],
                filename=file_info["filename"],
                description=pr_description,
            )

            reviews.append({
                "filename": file_info["filename"],
                "review": result["review"],
                "issues_found": result["issues_found"],
            })

            total_issues += result["issues_found"]
            total_input_tokens += result["token_usage"]["input_tokens"]
            total_output_tokens += result["token_usage"]["output_tokens"]
            any_context_cleared = any_context_cleared or result["context_cleared"]

        return {
            "reviews": reviews,
            "summary": {
                "total_files": len(files),
                "total_issues": total_issues,
                "token_usage": {
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                },
                "context_cleared": any_context_cleared,
            },
        }

    def _run_conversation_loop(self, max_turns: int = 10) -> tuple[Message, str, bool]:
        """
        Run the conversation loop with tool execution.

        Returns:
            Tuple of (final_response, review_text, context_cleared)
        """
        context_cleared = False
        final_response = None
        review_text = ""

        for turn in range(max_turns):
            # Call Claude API
            response = self.client.beta.messages.create(
                model=self.model,
                system=self._create_system_prompt(),
                messages=self.messages,
                max_tokens=4096,
                tools=[{"type": "memory_20250818", "name": "memory"}],
                betas=["context-management-2025-06-27"],
                context_management=CONTEXT_MANAGEMENT,
            )

            final_response = response

            # Check if context was cleared
            if hasattr(response, "context_management") and response.context_management:
                if response.context_management.get("edits"):
                    context_cleared = True

            # Extract text content
            text_blocks = [
                block.text for block in response.content
                if isinstance(block, TextBlock)
            ]
            if text_blocks:
                review_text = "\n".join(text_blocks)

            # Check for tool uses
            tool_uses = [
                block for block in response.content
                if isinstance(block, ToolUseBlock)
            ]

            if not tool_uses:
                # No more tool uses, conversation complete
                self.messages.append({
                    "role": "assistant",
                    "content": response.content,
                })
                break

            # Execute tool uses
            tool_results = []
            for tool_use in tool_uses:
                result = self.memory_handler.execute_tool_use(tool_use.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": result.get("content") or result.get("error", "Unknown error"),
                })

            # Add assistant response and tool results to messages
            self.messages.append({
                "role": "assistant",
                "content": response.content,
            })
            self.messages.append({
                "role": "user",
                "content": tool_results,
            })

        if not final_response:
            raise RuntimeError("Conversation loop failed to produce a response")

        return final_response, review_text, context_cleared

    def clear_conversation(self) -> None:
        """Clear the conversation history (keeps memory intact)."""
        self.messages = []

    def get_memory_stats(self) -> Dict[str, Any]:
        """Get statistics about memory usage."""
        memories_dir = self.memory_handler.base_path / "memories"

        if not memories_dir.exists():
            return {"total_files": 0, "total_size_bytes": 0}

        files = list(memories_dir.rglob("*"))
        file_count = len([f for f in files if f.is_file()])
        total_size = sum(f.stat().st_size for f in files if f.is_file())

        return {
            "total_files": file_count,
            "total_size_bytes": total_size,
            "total_size_kb": round(total_size / 1024, 2),
        }


def create_assistant(memory_path: str = "./memory_storage") -> CodeReviewAssistant:
    """
    Factory function to create a code review assistant.

    Args:
        memory_path: Directory for memory storage

    Returns:
        Configured CodeReviewAssistant instance
    """
    return CodeReviewAssistant(memory_storage_path=memory_path)
