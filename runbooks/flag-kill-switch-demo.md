# Feature Flag Kill Switch Demo

This runbook demonstrates the emergency kill switch functionality that can instantly disable all feature flags.

## Overview

The kill switch is designed for emergency situations where you need to immediately disable all feature flags, effectively rolling back to the baseline application state.

## Prerequisites

- Server running with flag API endpoints  
- Admin authentication token
- Understanding that kill switch affects ALL flags globally

## Kill Switch Activation

### Method 1: API Endpoint (Recommended)

```bash
# Activate kill switch via API
curl -X POST http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "🚨 Kill switch activated - all flags disabled",
  "timestamp": "2025-08-26T19:48:00.000Z",
  "warning": "This action disables ALL feature flags immediately"
}
```

### Method 2: Environment Variable

```bash
# Set environment variable (requires server restart)
export FLAGS_DISABLED_ALL=1

# Or for immediate effect on running server
curl -X POST http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer dev-token"
```

## Verification

### 1. Check Client Flags (Should Be Empty)

```bash
# All flags should be empty/disabled
curl http://localhost:3001/api/flags | jq '.'

# Expected output:
# {
#   "flags": {},
#   "timestamp": "2025-08-26T19:48:00.000Z",
#   "_meta": {
#     "note": "Only flags marked exposeToClient=true are included"
#   }
# }
```

### 2. Verify Kill Switch Status

```bash
# Check system status
curl http://localhost:3001/api/flags/status | jq '.'

# Expected output shows kill switch active:
# {
#   "cache": {
#     "age": 1000,
#     "hash": "",
#     "flagCount": 0
#   },
#   "killSwitchActive": true,
#   "environment": "development",
#   "timestamp": "2025-08-26T19:48:00.000Z"
# }
```

### 3. Test Individual Flag Access

```bash
# Even admin endpoints should respect kill switch
curl http://localhost:3001/api/admin/flags/wizard.v1/history \
  -H "Authorization: Bearer dev-token" | jq '.'

# Flags should be disabled regardless of their individual settings
```

## Kill Switch Deactivation

### Restore Normal Operation

```bash
# Deactivate kill switch via API
curl -X DELETE http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer dev-token"
```

Expected response:
```json
{
  "success": true,
  "message": "Kill switch deactivated - flags restored",
  "timestamp": "2025-08-26T19:48:00.000Z"
}
```

### Verification After Deactivation

```bash
# Check that flags are restored
curl http://localhost:3001/api/flags | jq '.'

# Should show normal flag state:
# {
#   "flags": {
#     "wizard.v1": true
#   },
#   "timestamp": "2025-08-26T19:48:00.000Z"
# }

# Verify kill switch is off
curl http://localhost:3001/api/flags/status | jq '.killSwitchActive'
# Should return: false
```

## Use Cases

### Emergency Deployment Issues
```bash
# Scenario: Bad deployment causing issues
# Solution: Immediate kill switch activation

echo "🚨 EMERGENCY: Activating kill switch due to deployment issues"
curl -X POST http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $FLAG_ADMIN_TOKEN"

echo "✅ All flags disabled. System reverted to baseline."
```

### Planned Maintenance
```bash
# Scenario: Maintenance window requiring stable state
# Solution: Temporary kill switch during maintenance

echo "🔧 MAINTENANCE: Disabling all flags for stability"
curl -X POST http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $FLAG_ADMIN_TOKEN"

# ... perform maintenance ...

echo "✅ MAINTENANCE COMPLETE: Restoring flags"
curl -X DELETE http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $FLAG_ADMIN_TOKEN"
```

### Performance Issues
```bash
# Scenario: High load, need to disable experimental features
# Solution: Kill switch to reduce system load

curl -X POST http://localhost:3001/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $FLAG_ADMIN_TOKEN" \
  -d '{"reason": "High load - disabling experimental features"}'
```

## Important Considerations

### ⚠️ Impact Assessment

- **ALL flags disabled**: Every feature flag becomes `false`/disabled
- **Immediate effect**: Takes effect within seconds (no caching delay)
- **Client impact**: Frontend components should gracefully handle disabled flags
- **Audit trail**: Kill switch activation is logged

### 🔧 Recovery Planning

- **Restoration**: Use DELETE endpoint to deactivate kill switch
- **Flag state**: Individual flag settings are preserved (not lost)
- **Propagation**: Normal cache TTL applies after deactivation (~30s)
- **Monitoring**: Watch application metrics after restoration

### 🚨 Emergency Checklist

1. **Activate kill switch**
   ```bash
   curl -X POST $BASE_URL/api/admin/flags/kill-switch -H "Authorization: Bearer $TOKEN"
   ```

2. **Verify activation**
   ```bash
   curl $BASE_URL/api/flags | jq '.flags | length'  # Should be 0
   ```

3. **Monitor application stability**
   - Check error rates
   - Verify baseline functionality
   - Monitor user experience

4. **Plan restoration**
   - Identify root cause
   - Test fix in staging
   - Gradually restore flags

5. **Deactivate when ready**
   ```bash
   curl -X DELETE $BASE_URL/api/admin/flags/kill-switch -H "Authorization: Bearer $TOKEN"
   ```

## Testing the Kill Switch

### Automated Test
```bash
#!/bin/bash
# Kill switch integration test

echo "Testing kill switch functionality..."

# 1. Check initial state
INITIAL_FLAGS=$(curl -s $BASE_URL/api/flags | jq '.flags | length')
echo "Initial flag count: $INITIAL_FLAGS"

# 2. Activate kill switch
curl -X POST $BASE_URL/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $TOKEN" \
  -s > /dev/null

# 3. Verify flags disabled
KILL_FLAGS=$(curl -s $BASE_URL/api/flags | jq '.flags | length')
echo "Flags after kill switch: $KILL_FLAGS"

if [ "$KILL_FLAGS" -eq 0 ]; then
  echo "✅ Kill switch working - all flags disabled"
else
  echo "❌ Kill switch failed - flags still active"
  exit 1
fi

# 4. Deactivate kill switch
curl -X DELETE $BASE_URL/api/admin/flags/kill-switch \
  -H "Authorization: Bearer $TOKEN" \
  -s > /dev/null

# 5. Verify restoration  
sleep 2
RESTORED_FLAGS=$(curl -s $BASE_URL/api/flags | jq '.flags | length')
echo "Flags after restoration: $RESTORED_FLAGS"

if [ "$RESTORED_FLAGS" -gt 0 ]; then
  echo "✅ Kill switch restoration working"
else
  echo "⚠️  Kill switch restoration may need more time"
fi
```

## Windows Compatibility

All commands in this runbook work on Windows with:
- **PowerShell**: Native curl support in PowerShell 3.0+
- **Command Prompt**: Use with Git Bash or WSL for curl
- **Alternative**: Use Invoke-RestMethod in PowerShell:

```powershell
# PowerShell alternative to curl
Invoke-RestMethod -Uri "http://localhost:3001/api/flags" -Method Get

# Kill switch activation
Invoke-RestMethod -Uri "http://localhost:3001/api/admin/flags/kill-switch" `
  -Method Post -Headers @{"Authorization"="Bearer dev-token"} `
  -ContentType "application/json"
```

## Related Documentation

- [Flag Propagation Demo](./flag-propagation-demo.md)
- [Feature Flag Architecture](../DECISIONS.md#feature-flags)
- [Emergency Procedures](../docs/emergency-procedures.md)