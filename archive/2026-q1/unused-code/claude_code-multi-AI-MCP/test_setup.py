#!/usr/bin/env python3
"""
Test script for Multi-AI MCP setup
"""

import json
import sys
from pathlib import Path

def test_credentials():
    """Test if credentials are properly configured"""
    creds_file = Path(__file__).parent / "credentials.json"

    try:
        with open(creds_file, 'r') as f:
            creds = json.load(f)

        print("Credentials Configuration:")
        for ai_name, config in creds.items():
            status = "ENABLED" if config.get("enabled", False) else "DISABLED"
            has_key = "HAS KEY" if config.get("api_key") and len(config.get("api_key", "")) > 10 else "NO KEY"
            print(f"  {ai_name.upper()}: {status} | {has_key} | Model: {config.get('model', 'N/A')}")

        return creds
    except Exception as e:
        print(f"Error loading credentials: {e}")
        return None

def test_ai_clients(creds):
    """Test AI client initialization"""
    print("\nTesting AI Client Initialization:")

    # Test Gemini
    if creds.get("gemini", {}).get("enabled", False):
        try:
            import google.generativeai as genai
            genai.configure(api_key=creds["gemini"]["api_key"])
            model = genai.GenerativeModel(creds["gemini"]["model"])
            print("  Gemini: Successfully initialized")
        except Exception as e:
            print(f"  Gemini: Failed - {e}")

    # Test OpenAI
    if creds.get("openai", {}).get("enabled", False):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=creds["openai"]["api_key"])
            print("  OpenAI: Successfully initialized")
        except Exception as e:
            print(f"  OpenAI: Failed - {e}")

def test_mcp_tools():
    """Test available MCP tools"""
    print("\nAvailable MCP Tools:")

    tools = [
        "mcp__multi-ai-collab__ask_gemini",
        "mcp__multi-ai-collab__ask_openai",
        "mcp__multi-ai-collab__ask_all_ais",
        "mcp__multi-ai-collab__ai_debate",
        "mcp__multi-ai-collab__gemini_code_review",
        "mcp__multi-ai-collab__openai_code_review",
        "mcp__multi-ai-collab__server_status"
    ]

    for tool in tools:
        print(f"  {tool}")

def main():
    print("Multi-AI MCP Setup Test\n")

    # Test credentials
    creds = test_credentials()
    if not creds:
        sys.exit(1)

    # Test AI clients
    test_ai_clients(creds)

    # Show available tools
    test_mcp_tools()

    # Summary
    enabled_ais = [name for name, config in creds.items() if config.get("enabled", False)]
    print(f"\nSetup Complete! Enabled AIs: {', '.join(enabled_ais)}")
    print("\nUsage Examples:")
    print("  Ask Claude: 'Hey Claude, ask Gemini to analyze this code structure'")
    print("  Ask Claude: 'Have Gemini and ChatGPT debate the best TypeScript patterns'")
    print("  Ask Claude: 'Get all AIs to review this financial calculation function'")

if __name__ == "__main__":
    main()