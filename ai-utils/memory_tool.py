"""
Memory Tool Handler for Claude's Memory & Context Management

This module provides a client-side implementation of Claude's memory tool,
allowing AI agents to persist learned patterns across conversations.
"""

import os
import shutil
from pathlib import Path
from typing import Dict, Any, Literal, Union


class MemoryToolHandler:
    """
    Handles memory tool operations for Claude AI agents.

    Supports cross-conversation learning by maintaining a file-based
    memory system under a configurable base directory.
    """

    def __init__(self, base_path: str = "./memory_storage"):
        """
        Initialize the memory tool handler.

        Args:
            base_path: Root directory for memory storage
        """
        self.base_path = Path(base_path).resolve()
        self._ensure_base_directory()

    def _ensure_base_directory(self) -> None:
        """Create the base memory directory if it doesn't exist."""
        self.base_path.mkdir(parents=True, exist_ok=True)
        memories_dir = self.base_path / "memories"
        memories_dir.mkdir(exist_ok=True)

    def _validate_path(self, path: str) -> Path:
        """
        Validate and resolve a memory path.

        Args:
            path: Relative path within memory system (e.g., "/memories/notes.md")

        Returns:
            Absolute resolved path

        Raises:
            ValueError: If path escapes memory directory
        """
        # Remove leading slash and resolve
        clean_path = path.lstrip("/")
        full_path = (self.base_path / clean_path).resolve()

        # Security: Ensure path doesn't escape base directory
        try:
            full_path.relative_to(self.base_path)
        except ValueError:
            raise ValueError(f"Path '{path}' escapes memory directory")

        return full_path

    def execute_tool_use(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a memory tool command.

        Args:
            tool_input: Tool use input from Claude's API response

        Returns:
            Tool result to send back to Claude
        """
        command = tool_input.get("command")

        handlers = {
            "view": self._handle_view,
            "create": self._handle_create,
            "str_replace": self._handle_str_replace,
            "insert": self._handle_insert,
            "delete": self._handle_delete,
            "rename": self._handle_rename,
        }

        handler = handlers.get(command)
        if not handler:
            return {"error": f"Unknown command: {command}"}

        try:
            return handler(tool_input)
        except Exception as e:
            return {"error": str(e)}

    def _handle_view(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """View directory contents or file contents."""
        path = tool_input.get("path", "/memories")
        full_path = self._validate_path(path)

        if not full_path.exists():
            return {"error": f"Path not found: {path}"}

        if full_path.is_dir():
            # List directory contents
            try:
                entries = sorted(full_path.iterdir(), key=lambda p: p.name)
                result = [f"- {entry.name}" for entry in entries]
                return {
                    "content": f"Directory: {path}\n" +
                              ("\n".join(result) if result else "(empty)")
                }
            except PermissionError:
                return {"error": f"Permission denied: {path}"}
        else:
            # Read file contents with line numbers
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    numbered = [f"{i+1:5d}: {line.rstrip()}" for i, line in enumerate(lines)]
                    return {"content": "\n".join(numbered)}
            except Exception as e:
                return {"error": f"Failed to read file: {e}"}

    def _handle_create(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Create or overwrite a file."""
        path = tool_input.get("path")
        file_text = tool_input.get("file_text", "")

        if not path:
            return {"error": "Missing 'path' parameter"}

        full_path = self._validate_path(path)

        # Create parent directories
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Write file
        try:
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(file_text)
            return {"content": f"File created successfully at {path}"}
        except Exception as e:
            return {"error": f"Failed to create file: {e}"}

    def _handle_str_replace(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Replace text in a file."""
        path = tool_input.get("path")
        old_str = tool_input.get("old_str")
        new_str = tool_input.get("new_str")

        if not all([path, old_str is not None]):
            return {"error": "Missing required parameters"}

        full_path = self._validate_path(path)

        if not full_path.exists():
            return {"error": f"File not found: {path}"}

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()

            if old_str not in content:
                return {"error": f"String not found in file: {old_str[:50]}..."}

            # Replace and write back
            new_content = content.replace(old_str, new_str or "", 1)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(new_content)

            return {"content": f"File {path} has been edited successfully"}
        except Exception as e:
            return {"error": f"Failed to edit file: {e}"}

    def _handle_insert(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Insert text at a specific line number."""
        path = tool_input.get("path")
        insert_line = tool_input.get("insert_line")
        insert_text = tool_input.get("insert_text", "")

        if not all([path, insert_line is not None]):
            return {"error": "Missing required parameters"}

        full_path = self._validate_path(path)

        if not full_path.exists():
            return {"error": f"File not found: {path}"}

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            # Insert at specified line (1-indexed)
            insert_idx = max(0, min(insert_line - 1, len(lines)))
            lines.insert(insert_idx, insert_text + "\n")

            with open(full_path, "w", encoding="utf-8") as f:
                f.writelines(lines)

            return {"content": f"Text inserted at line {insert_line} in {path}"}
        except Exception as e:
            return {"error": f"Failed to insert text: {e}"}

    def _handle_delete(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a file or directory."""
        path = tool_input.get("path")

        if not path:
            return {"error": "Missing 'path' parameter"}

        full_path = self._validate_path(path)

        if not full_path.exists():
            return {"error": f"Path not found: {path}"}

        try:
            if full_path.is_dir():
                shutil.rmtree(full_path)
                return {"content": f"Directory deleted: {path}"}
            else:
                full_path.unlink()
                return {"content": f"File deleted: {path}"}
        except Exception as e:
            return {"error": f"Failed to delete: {e}"}

    def _handle_rename(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Rename or move a file."""
        old_path = tool_input.get("old_path")
        new_path = tool_input.get("new_path")

        if not all([old_path, new_path]):
            return {"error": "Missing required parameters"}

        full_old_path = self._validate_path(old_path)
        full_new_path = self._validate_path(new_path)

        if not full_old_path.exists():
            return {"error": f"Source path not found: {old_path}"}

        try:
            # Create parent directory for destination
            full_new_path.parent.mkdir(parents=True, exist_ok=True)
            full_old_path.rename(full_new_path)
            return {"content": f"Renamed {old_path} to {new_path}"}
        except Exception as e:
            return {"error": f"Failed to rename: {e}"}

    def clear_all_memory(self) -> None:
        """Clear all memory files (use with caution!)."""
        memories_dir = self.base_path / "memories"
        if memories_dir.exists():
            shutil.rmtree(memories_dir)
        memories_dir.mkdir(exist_ok=True)
