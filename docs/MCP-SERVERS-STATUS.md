# MCP Servers Status & Troubleshooting Guide

**Last Updated:** 2025-10-26 **Diagnostic Tool:**
`node scripts/diagnose-mcp-servers.mjs`

---

## 🎯 Quick Status

| MCP Server                 | Status            | Action Required          |
| -------------------------- | ----------------- | ------------------------ |
| **Nia Context**            | ✅ Configured     | Restart Claude Code      |
| **Multi-AI Collaboration** | ✅ Ready          | Restart Claude Code      |
| **Kapture Browser**        | ⚠️ Timeout Issues | Install Chrome Extension |

---

## ✅ Multi-AI Collaboration MCP

### Status: **WORKING** ✅

**Configuration:** Added to [.claude/mcp.json](./.claude/mcp.json)

```json
{
  "multi-ai-collab": {
    "command": "python",
    "args": [
      "C:\\Users\\nikhi\\.claude-mcp-servers\\multi-ai-collab\\server.py"
    ]
  }
}
```

**Enabled AIs:**

- ✅ **Gemini** (gemini-2.5-pro) - Google AI
- ✅ **OpenAI** (gpt-4o) - ChatGPT
- ✅ **Anthropic** (claude-sonnet-4-5-20250929) - Claude
- ✅ **DeepSeek** (deepseek-chat) - Reasoning specialist
- ⚠️ **Grok** (disabled - no API key)

**Available Tools:**

- `mcp__multi-ai-collab__ask_gemini` - Ask Gemini a question
- `mcp__multi-ai-collab__ask_openai` - Ask ChatGPT a question
- `mcp__multi-ai-collab__ask_all_ais` - Get consensus from all AIs
- `mcp__multi-ai-collab__ai_debate` - Have two AIs debate a topic
- `mcp__multi-ai-collab__gemini_code_review` - Gemini code review
- `mcp__multi-ai-collab__openai_code_review` - ChatGPT code review
- `mcp__multi-ai-collab__server_status` - Check server status

**Test Connection:**

```bash
python ~/.claude-mcp-servers/multi-ai-collab/test_setup.py
```

**Usage Examples:**

```
"Ask Gemini to explain React concurrent rendering"
"Have Gemini and ChatGPT debate TypeScript vs JavaScript"
"Get all AIs to review this waterfall calculation function"
"Ask OpenAI for database optimization strategies"
```

### Next Steps

1. ✅ Configuration added to `.claude/mcp.json`
2. 🔄 **Restart Claude Code** to load MCP server
3. ✅ Test with: "Ask Gemini about TypeScript best practices"

---

## ⚠️ Kapture Browser Automation MCP

### Status: **TIMEOUT ERRORS** ⚠️

**Problem:** Consistent 60-second timeout during initialization handshake

**Error Pattern:**

```
2025-10-26T07:26:02 [Kapture Browser Automation] [info] Message from client: initialize
2025-10-26T07:27:02 [Kapture Browser Automation] [info] Request timed out
2025-10-26T07:27:02 [Kapture Browser Automation] [error] Server disconnected
```

**Root Cause:** Missing Chrome DevTools Extension connection

---

## 🔧 Kapture Fix Instructions

### Step 1: Install Chrome Extension

1. **Visit:** https://williamkapke.github.io/kapture/
2. **Install** Kapture Chrome Extension from Chrome Web Store
3. **Enable** extension in Chrome Extensions (chrome://extensions/)
4. **Verify** extension icon appears in Chrome toolbar

### Step 2: Configure WebSocket Connection

The Kapture Chrome extension needs to connect to the MCP server via WebSocket.

**Default Port:** 3000 (check manifest.json for confirmation)

### Step 3: Restart Everything

```bash
# 1. Close Chrome completely
taskkill /F /IM chrome.exe

# 2. Restart Chrome with extension enabled
# 3. Restart Claude Code
```

### Step 4: Test Connection

After restart, try:

```
"List browser tabs"
"Navigate to https://example.com"
"Take a screenshot of the current page"
```

---

## 🛠️ Alternative: Rebuild Kapture MCP

If extension is installed but still timing out:

```bash
cd "%APPDATA%\Claude\Claude Extensions\ant.dir.gh.williamkapke.kapture"
npm install
npm run build
```

Then restart Claude Code.

---

## 🚀 System Requirements

### Node.js

- **Required:** >=16.0.0
- **Installed:** ✅ v20.19.0

### Python

- **Required:** >=3.8
- **Installed:** ✅ 3.13.5

### Chrome Browser

- **Required for Kapture:** Yes
- **Extension Required:** Kapture DevTools Extension
- **Status:** ⚠️ Unknown (check chrome://extensions/)

---

## 📊 Diagnostic Script

Run comprehensive diagnostics:

```bash
node scripts/diagnose-mcp-servers.mjs
```

**What it checks:**

- ✅ Node.js version compatibility
- ✅ Python installation
- ✅ Multi-AI MCP installation & configuration
- ✅ Kapture MCP installation
- ✅ MCP server connection tests
- ⚠️ Chrome extension status (manual check)

---

## 🔍 Troubleshooting by Symptom

### "MCP tools not appearing in Claude Code"

**Multi-AI Collaboration:**

1. Check `.claude/mcp.json` contains multi-ai-collab entry
2. Restart Claude Code completely
3. Verify Python is in PATH: `python --version`
4. Check logs: `C:\Users\nikhi\AppData\Roaming\Claude\logs\`

**Nia Context:**

1. Verify `NIA_API_KEY` in `.env`
2. Test: `pipx list | grep nia-mcp-server`
3. Reinstall: `pipx install --force nia-mcp-server`

### "Kapture commands timing out"

**Most Common:** Chrome extension not installed/running

1. Install from: https://williamkapke.github.io/kapture/
2. Verify in Chrome: chrome://extensions/
3. Check extension has "Host Permissions" for <all_urls>
4. Restart Chrome + Claude Code

**Port Conflict:**

```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process if needed (replace PID)
taskkill /F /PID <process_id>
```

**WebSocket Issues:**

- Firewall blocking WebSocket connections
- Antivirus blocking localhost communication
- Check Windows Firewall → Allow an app

### "Python/Node.js not found"

**Python:**

```bash
# Check installation
python --version

# Add to PATH if needed
# Windows: System Properties → Environment Variables
# Add: C:\Users\nikhi\AppData\Local\Programs\Python\Python313
```

**Node.js:**

```bash
# Check installation
node --version

# Should show v20.19.0 or higher
```

---

## 📝 Configuration Files

### Project MCP Config

**File:** [.claude/mcp.json](./.claude/mcp.json)

```json
{
  "mcpServers": {
    "nia": {
      "command": "pipx",
      "args": ["run", "--no-cache", "nia-mcp-server"],
      "env": {
        "NIA_API_KEY": "${NIA_API_KEY}",
        "NIA_API_URL": "https://apigcp.trynia.ai/"
      }
    },
    "multi-ai-collab": {
      "command": "python",
      "args": [
        "C:\\Users\\nikhi\\.claude-mcp-servers\\multi-ai-collab\\server.py"
      ]
    }
  }
}
```

### Multi-AI Credentials

**File:** `~/.claude-mcp-servers/multi-ai-collab/credentials.json`

```json
{
  "gemini": {
    "api_key": "AIza...",
    "model": "gemini-2.5-pro",
    "enabled": true
  },
  "openai": {
    "api_key": "sk-proj-...",
    "model": "gpt-4o",
    "enabled": true
  },
  "anthropic": {
    "api_key": "sk-ant-...",
    "model": "claude-sonnet-4-5-20250929",
    "enabled": true
  },
  "deepseek": {
    "api_key": "sk-...",
    "model": "deepseek-chat",
    "enabled": true
  },
  "grok": {
    "api_key": "",
    "model": "grok-3",
    "enabled": false
  }
}
```

### Kapture Manifest

**File:**
`%APPDATA%\Claude\Claude Extensions\ant.dir.gh.williamkapke.kapture\manifest.json`

- Version: 2.1.2
- Entry Point: dist/bridge.js
- Node Required: >=16.0.0

---

## 📚 Documentation Links

### Multi-AI Collaboration

- **Local Setup:**
  [claude_code-multi-AI-MCP/README.md](../claude_code-multi-AI-MCP/README.md)
- **Workflow Guide:**
  [docs/MULTI-AI-DEVELOPMENT-WORKFLOW.md](./MULTI-AI-DEVELOPMENT-WORKFLOW.md)
- **Test Script:** `~/.claude-mcp-servers/multi-ai-collab/test_setup.py`

### Nia Context

- **Setup Guide:** [docs/nia-setup-guide.md](./nia-setup-guide.md)
- **Usage Guide:**
  [cheatsheets/nia-mcp-usage.md](../cheatsheets/nia-mcp-usage.md)
- **Website:** https://trynia.ai/
- **Documentation:** https://docs.trynia.ai/

### Kapture Browser

- **Official Site:** https://williamkapke.github.io/kapture/
- **MCP Usage:** https://williamkapke.github.io/kapture/MCP_USAGE.html
- **GitHub:** https://github.com/williamkapke/kapture
- **Chrome Extension:** https://chrome.google.com/webstore/ (search "Kapture")

### MCP Protocol

- **MCP Docs:** https://modelcontextprotocol.io/
- **Debugging:** https://modelcontextprotocol.io/docs/tools/debugging

---

## ✅ Success Checklist

### After Configuration

- [ ] `.claude/mcp.json` contains multi-ai-collab entry
- [ ] Claude Code restarted
- [ ] Multi-AI tools appear in MCP tools list
- [ ] Can execute: "Ask Gemini about X"
- [ ] Can execute: "Have Gemini and ChatGPT debate Y"

### After Kapture Fix

- [ ] Kapture Chrome extension installed
- [ ] Extension enabled in chrome://extensions/
- [ ] Chrome restarted with extension
- [ ] Claude Code restarted
- [ ] Can execute: "List browser tabs"
- [ ] No timeout errors in logs

---

## 🔄 Quick Reset Procedure

If MCP servers are completely broken:

```bash
# 1. Stop Claude Code

# 2. Clear MCP cache
rm -rf "$APPDATA/Claude/logs/mcp-server-*.log"

# 3. Rebuild Multi-AI
cd ~/.claude-mcp-servers/multi-ai-collab
python test_setup.py

# 4. Rebuild Kapture
cd "%APPDATA%\Claude\Claude Extensions\ant.dir.gh.williamkapke.kapture"
npm install && npm run build

# 5. Restart Claude Code

# 6. Test
node scripts/diagnose-mcp-servers.mjs
```

---

## 📞 Support Resources

### Multi-AI Issues

- Check: `~/.claude-mcp-servers/multi-ai-collab/README.md`
- Test: `python ~/.claude-mcp-servers/multi-ai-collab/test_setup.py`
- Logs: `%APPDATA%\Claude\logs\mcp-server-*.log`

### Kapture Issues

- Documentation: https://williamkapke.github.io/kapture/MCP_USAGE.html
- GitHub Issues: https://github.com/williamkapke/kapture/issues
- MCP Debugging: https://modelcontextprotocol.io/docs/tools/debugging

### Nia Issues

- Documentation: https://docs.trynia.ai/
- Cheatsheet: [cheatsheets/nia-mcp-usage.md](../cheatsheets/nia-mcp-usage.md)
- Reinstall: `pipx install --force nia-mcp-server`

---

**Last Diagnostic Run:** 2025-10-26 **Status:** Multi-AI ✅ | Nia ✅ | Kapture
⚠️ (Chrome Extension Required)
