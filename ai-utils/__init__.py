"""
AI Utilities for Code Review and Memory Management

This package provides intelligent code review capabilities with cross-conversation
learning using Claude's memory and context management features.
"""

from .memory_tool import MemoryToolHandler
from .code_review_assistant import CodeReviewAssistant, create_assistant

__all__ = [
    "MemoryToolHandler",
    "CodeReviewAssistant",
    "create_assistant",
]

__version__ = "1.0.0"
