# Feature Flag Propagation Demo

This runbook demonstrates the flag propagation system and verifies that flag updates reach clients within 30 seconds.

## Prerequisites

- Server running with flag API endpoints
- Flag metadata files in `flags/` directory
- Admin authentication token (dev: `dev-token` or set `FLAG_ADMIN_TOKEN`)

## Demo Steps

### 1. Initial State Check

First, verify the current flag states and system status:

```bash
# Check all client-safe flags
curl http://localhost:3001/api/flags | jq '.'

# Check flag system status and cache
curl http://localhost:3001/api/flags/status | jq '.'
```

Expected response structure:
```json
{
  "flags": {
    "wizard.v1": true
  },
  "timestamp": "2025-08-26T19:48:00.000Z",
  "_meta": {
    "note": "Only flags marked exposeToClient=true are included"
  }
}
```

### 2. Flag Update (Admin Action)

Update a flag through the admin API:

```bash
# Enable wizard.v1 flag
curl -X POST http://localhost:3001/api/admin/flags/wizard.v1 \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "actor": "demo-user@povc.fund",
    "reason": "Propagation demo - enabling wizard"
  }'

# Or disable it
curl -X POST http://localhost:3001/api/admin/flags/wizard.v1 \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "actor": "demo-user@povc.fund", 
    "reason": "Propagation demo - disabling wizard"
  }'
```

### 3. Propagation Monitoring

Monitor how quickly the change propagates to client endpoints:

```bash
# Run the automated propagation test
BASE_URL=http://localhost:3001 npm run flags:test-propagation

# Or manually monitor with timestamps
while true; do
  echo "$(date): $(curl -s http://localhost:3001/api/flags | jq -r '.flags["wizard.v1"]')"
  sleep 1
done
```

### 4. Cache Analysis

Check the cache status to understand propagation timing:

```bash
# View cache status
curl http://localhost:3001/api/flags/status | jq '.cache'

# Sample output:
# {
#   "age": 15000,        # milliseconds since last cache refresh
#   "hash": "a7b9c2d4",  # cache content hash
#   "flagCount": 2       # number of flags in cache
# }
```

### 5. Audit Trail

Review the change history for accountability:

```bash
# Get history for specific flag
curl http://localhost:3001/api/admin/flags/wizard.v1/history \
  -H "Authorization: Bearer dev-token" | jq '.'

# Sample output shows who made changes and when:
# {
#   "key": "wizard.v1",
#   "history": [
#     {
#       "id": "uuid",
#       "before": {"enabled": false},
#       "after": {"enabled": true},
#       "actor": "demo-user@povc.fund",
#       "reason": "Propagation demo",
#       "createdAt": "2025-08-26T19:48:00.000Z"
#     }
#   ]
# }
```

## Success Criteria

✅ **Propagation Speed**: Flag changes appear in `/api/flags` within 30 seconds
✅ **Cache Consistency**: Cache hash changes when flags are updated  
✅ **Client Safety**: Only `exposeToClient=true` flags appear in client endpoint
✅ **Audit Trail**: All changes logged with actor, reason, and timestamp
✅ **Error Handling**: Invalid requests return proper error responses

## Troubleshooting

### Propagation Taking Too Long
- Check if TTL_MS in `flags.ts` is set correctly (should be 30,000ms)
- Verify cache invalidation occurs after flag updates
- Ensure flag provider is not falling back to default values

### Authentication Issues
```bash
# Check if admin auth is working
curl -X POST http://localhost:3001/api/admin/flags/test \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json"
# Should return 403 Forbidden
```

### Flag Not Appearing in Client Endpoint
- Check flag metadata YAML has `exposeToClient: true`
- Verify flag exists in environment-specific configuration
- Check flag linter: `npm run flags:lint`

## Performance Notes

- Cache TTL: 30 seconds (configurable in `flags.ts`)
- Client-side polling interval: 30 seconds (recommended)
- Admin API rate limits apply (60 requests/minute)
- Flag updates are atomic (all-or-nothing)

## Related Commands

```bash
# Lint all flag metadata files
npm run flags:lint

# Test propagation automatically  
npm run flags:test-propagation

# Demo flag UI (interactive or auto mode)
npm run flags:demo
npm run flags:demo:auto  # Windows-friendly auto mode

# View server logs for flag activity
# Look for lines like: "Flags updated: 2 flags, hash: a7b9c2d4"
```

## Windows Compatibility Notes

- **Interactive Demo**: Use `npm run flags:demo:auto` for automatic progression
- **Manual Demo**: Use `npm run flags:demo` and press Enter when prompted
- **Shell Commands**: All curl commands work in PowerShell and Command Prompt
- **File Paths**: Use forward slashes `/` in URLs, backslashes `\` in local paths