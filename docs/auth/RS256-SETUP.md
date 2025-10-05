# RS256 JWT Authentication Setup Guide

This guide explains how to configure RS256 (RSA) JWT authentication with JWKS (JSON Web Key Set) support.

## Overview

The JWT authentication system supports two algorithms:

- **HS256 (HMAC)**: Symmetric key signing (default) - uses a shared secret
- **RS256 (RSA)**: Asymmetric key signing - uses public/private key pair via JWKS

## When to Use RS256

Use RS256 when:
- Integrating with external identity providers (Auth0, Okta, AWS Cognito, etc.)
- You need public key verification without sharing secrets
- Supporting multiple services that verify the same tokens
- Compliance requires asymmetric cryptography

## Configuration

### Environment Variables

#### For HS256 (Default)
```bash
JWT_ALG=HS256
JWT_SECRET=your-secret-key-minimum-32-characters-long
JWT_ISSUER=your-app-name
JWT_AUDIENCE=your-app-api
```

#### For RS256
```bash
JWT_ALG=RS256
JWT_JWKS_URL=https://your-idp.com/.well-known/jwks.json
JWT_ISSUER=https://your-idp.com/
JWT_AUDIENCE=your-app-api
```

### Common Identity Providers

#### Auth0
```bash
JWT_ALG=RS256
JWT_JWKS_URL=https://YOUR_DOMAIN.auth0.com/.well-known/jwks.json
JWT_ISSUER=https://YOUR_DOMAIN.auth0.com/
JWT_AUDIENCE=https://your-api-identifier
```

#### AWS Cognito
```bash
JWT_ALG=RS256
JWT_JWKS_URL=https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json
JWT_ISSUER=https://cognito-idp.{region}.amazonaws.com/{userPoolId}
JWT_AUDIENCE=your-app-client-id
```

#### Okta
```bash
JWT_ALG=RS256
JWT_JWKS_URL=https://YOUR_DOMAIN.okta.com/oauth2/default/v1/keys
JWT_ISSUER=https://YOUR_DOMAIN.okta.com/oauth2/default
JWT_AUDIENCE=api://default
```

#### Azure AD (Microsoft Entra ID)
```bash
JWT_ALG=RS256
JWT_JWKS_URL=https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys
JWT_ISSUER=https://login.microsoftonline.com/{tenant}/v2.0
JWT_AUDIENCE=your-application-id
```

## Security Features

### 1. Algorithm Whitelist Enforcement
```typescript
// CRITICAL: Prevents algorithm spoofing attacks
const options = {
  algorithms: [authConfig.algorithm], // Only allows configured algorithm
};
```

The system enforces a strict algorithm whitelist to prevent:
- "None" algorithm attacks
- Algorithm confusion attacks (HS256 → RS256 spoofing)

### 2. JWKS Caching
```typescript
// Automatic key rotation support with caching
jwksClient = createRemoteJWKSet(new URL(authConfig.jwksUri), {
  cooldownDuration: 30000,  // 30 seconds between refetches
  cacheMaxAge: 600000,      // 10 minutes cache
});
```

### 3. Timing Claims Validation
- **exp** (expiration): Token must not be expired
- **nbf** (not before): Token must be valid now
- **iat** (issued at): Token issue time must be valid
- **Clock skew**: 30 seconds tolerance for time synchronization

### 4. Required Claims
- **sub** (subject): User identifier - REQUIRED
- **iss** (issuer): Must match JWT_ISSUER
- **aud** (audience): Must match JWT_AUDIENCE

## Testing RS256 Tokens

### Generate Test Token (using online tools)

1. Go to [jwt.io](https://jwt.io)
2. Select RS256 algorithm
3. Set payload:
```json
{
  "sub": "user-123",
  "email": "test@example.com",
  "role": "admin",
  "iss": "https://your-idp.com/",
  "aud": "your-app-api",
  "exp": 1735689600,
  "iat": 1735603200
}
```
4. Use your private key to sign
5. Test with the public key from your JWKS endpoint

### Using Auth0 for Testing

```typescript
// Get access token from Auth0
const response = await fetch('https://YOUR_DOMAIN.auth0.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'client_credentials',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    audience: 'https://your-api-identifier'
  })
});

const { access_token } = await response.json();

// Use the token in your API requests
fetch('http://localhost:5000/api/protected', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});
```

## Migration from HS256 to RS256

### Step 1: Prepare Environment
```bash
# Add RS256 configuration
JWT_ALG=RS256
JWT_JWKS_URL=https://your-idp.com/.well-known/jwks.json
JWT_ISSUER=https://your-idp.com/
JWT_AUDIENCE=your-app-api

# Keep HS256 config for fallback (remove after migration)
# JWT_SECRET=...
```

### Step 2: Deploy with Dual Support (Optional)
If you need zero-downtime migration, implement dual verification:

```typescript
// Custom implementation for dual support
async function verifyWithFallback(token: string) {
  try {
    // Try RS256 first
    return await verifyRS256(token);
  } catch (error) {
    // Fallback to HS256
    return await verifyHS256(token);
  }
}
```

### Step 3: Update Clients
Update all client applications to use the new identity provider tokens.

### Step 4: Monitor & Validate
- Monitor authentication errors
- Check metrics for HS256 vs RS256 usage
- Verify all clients are using RS256

### Step 5: Remove HS256
Once all clients are migrated:
```bash
# Remove old HS256 config
# JWT_SECRET=...  # DELETE THIS
```

## Troubleshooting

### Error: "JWKS URI not configured for RS256"
**Solution**: Set `JWT_JWKS_URL` environment variable

### Error: "Token signature verification failed"
**Causes**:
1. Wrong JWKS URL
2. Token signed with different key
3. Network issues fetching JWKS

**Debug**:
```bash
# Test JWKS endpoint
curl https://your-idp.com/.well-known/jwks.json

# Verify token issuer matches
# Decode token at jwt.io
```

### Error: "Token claim validation failed"
**Causes**:
1. Issuer mismatch (`iss` claim)
2. Audience mismatch (`aud` claim)
3. Token expired (`exp` claim)

**Solution**: Check token claims match your configuration:
```bash
echo $JWT_ISSUER    # Must match token 'iss'
echo $JWT_AUDIENCE  # Must match token 'aud'
```

### Error: "JWKS fetch failed"
**Causes**:
1. Network connectivity
2. Firewall blocking HTTPS
3. Invalid JWKS URL

**Solution**:
```bash
# Test network connectivity
curl -I https://your-idp.com/.well-known/jwks.json

# Check firewall rules
# Ensure outbound HTTPS is allowed
```

## Performance Considerations

### JWKS Caching
- First verification: ~200-500ms (fetches JWKS)
- Subsequent: ~1-5ms (cached keys)
- Cache duration: 10 minutes
- Cooldown: 30 seconds between refetches

### Key Rotation
The JWKS client automatically handles key rotation:
1. New keys are fetched when signature verification fails
2. Old keys remain cached during rotation period
3. No downtime during key rotation

## Security Best Practices

1. **Always use HTTPS** for JWKS endpoints
2. **Validate issuer** - never accept tokens from unknown issuers
3. **Validate audience** - ensure tokens are for your API
4. **Set appropriate expiration** - typically 1 hour or less
5. **Monitor failed verifications** - detect attack attempts
6. **Use strong key sizes** - RS256 requires 2048-bit keys minimum
7. **Rotate keys regularly** - recommended: every 6-12 months

## Production Checklist

- [ ] JWT_ALG set to RS256
- [ ] JWT_JWKS_URL configured and accessible
- [ ] JWT_ISSUER matches token issuer exactly
- [ ] JWT_AUDIENCE configured correctly
- [ ] HTTPS enforced for JWKS endpoint
- [ ] Network allows HTTPS to JWKS endpoint
- [ ] Monitoring configured for auth failures
- [ ] Key rotation plan documented
- [ ] Backup authentication method available
- [ ] Documentation updated for developers

## Example Implementation

See the complete implementation in:
- `server/config/auth.ts` - Configuration validation
- `server/lib/auth/jwt.ts` - JWT verification logic
- `server/lib/auth/__tests__/jwt.test.ts` - Test examples
