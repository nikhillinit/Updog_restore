# Security Headers Implementation

This document describes the comprehensive security headers implementation for protecting against common web vulnerabilities.

## Overview

Our security headers middleware implements defense-in-depth strategies to protect against:
- Cross-Site Scripting (XSS)
- Clickjacking
- MIME type sniffing
- Protocol downgrade attacks
- Content injection
- Information disclosure

## Headers Implemented

### Content Security Policy (CSP)
Controls which resources the browser is allowed to load.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'
```

### HTTP Strict Transport Security (HSTS)
Forces HTTPS connections for all future requests.

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### X-Frame-Options
Prevents clickjacking attacks.

```
X-Frame-Options: DENY
```

### X-Content-Type-Options
Prevents MIME type sniffing.

```
X-Content-Type-Options: nosniff
```

### Referrer-Policy
Controls how much referrer information is sent.

```
Referrer-Policy: strict-origin-when-cross-origin
```

### Permissions-Policy
Controls browser features and APIs.

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

## Usage

### Basic Setup

```typescript
import express from 'express';
import { securityHeaders } from './middleware/security-headers';

const app = express();

// Apply security headers to all routes
app.use(securityHeaders());
```

### Custom Configuration

```typescript
app.use(securityHeaders({
  csp: {
    defaultSrc: ["'self'", 'https://trusted-cdn.com'],
    scriptSrc: ["'self'", "'nonce-{random}'"],
    reportUri: '/api/csp-report'
  },
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true
  },
  frameOptions: 'SAMEORIGIN' // Allow same-origin framing
}));
```

### Environment-Specific Configuration

```typescript
import { getEnvironmentHeaders } from './middleware/security-headers';

// Automatically configures based on NODE_ENV
app.use(securityHeaders(getEnvironmentHeaders()));
```

## CSP Configuration Guide

### Development Mode
More permissive to allow hot reloading and debugging:
- Allows `unsafe-inline` and `unsafe-eval` for scripts
- Allows WebSocket connections for HMR
- No HSTS to avoid certificate issues

### Production Mode
Strictest settings for maximum security:
- No `unsafe-inline` or `unsafe-eval`
- Enforces HTTPS with HSTS
- Blocks all mixed content
- Enables CSP reporting

### Using Nonces for Inline Scripts

If you must use inline scripts in production:

```typescript
import { generateNonce, addNonceToCSP } from './middleware/security-headers';

app.get('/page-with-inline-script', (req, res) => {
  const nonce = generateNonce();
  addNonceToCSP(res, nonce);
  
  res.send(`
    <html>
      <head>
        <script nonce="${nonce}">
          console.log('This inline script is allowed');
        </script>
      </head>
    </html>
  `);
});
```

## CSP Violation Reporting

Monitor CSP violations to identify potential attacks or misconfigurations:

```typescript
// Setup CSP reporting endpoint
app.post('/api/csp-report', cspReportHandler());

// Configure CSP with reporting
app.use(securityHeaders({
  csp: {
    // ... other directives
    reportUri: '/api/csp-report',
    reportTo: 'csp-endpoint'
  }
}));
```

## Testing

### Unit Tests
Run the security headers test suite:

```bash
npm test security-headers
```

### Manual Testing
Check headers with curl:

```bash
curl -I http://localhost:5000/
```

### Online Tools

1. **Mozilla Observatory**
   - URL: https://observatory.mozilla.org/
   - Target: A+ rating
   - Checks: CSP, HSTS, Cookies, Redirects

2. **Security Headers**
   - URL: https://securityheaders.com/
   - Target: A rating
   - Checks: All security headers

3. **CSP Evaluator**
   - URL: https://csp-evaluator.withgoogle.com/
   - Validates CSP configuration
   - Identifies potential bypasses

## Troubleshooting

### Common CSP Issues

**Problem**: Inline styles not working
**Solution**: Add `'unsafe-inline'` to `style-src` or use CSS files

**Problem**: Third-party scripts blocked
**Solution**: Add the domain to `script-src`:
```typescript
scriptSrc: ["'self'", 'https://cdn.example.com']
```

**Problem**: WebSocket connections blocked
**Solution**: Add to `connect-src`:
```typescript
connectSrc: ["'self'", 'ws://localhost:*', 'wss://production.com']
```

### HSTS Issues

**Problem**: Can't access site on HTTP during development
**Solution**: HSTS is disabled in development mode by default

**Problem**: HSTS preload not working
**Solution**: Ensure your domain meets preload requirements:
- Valid certificate
- Redirect HTTP to HTTPS
- All subdomains served over HTTPS
- Submit to https://hstspreload.org/

## Security Checklist

- [ ] CSP enabled and configured for your content
- [ ] HSTS enabled in production (1+ year max-age)
- [ ] X-Frame-Options set to DENY or SAMEORIGIN
- [ ] X-Content-Type-Options set to nosniff
- [ ] Referrer-Policy configured
- [ ] Permissions-Policy restricting unused features
- [ ] CSP reporting endpoint configured
- [ ] No CSP violations in browser console
- [ ] Mozilla Observatory A+ rating achieved
- [ ] Security headers validated in production

## Migration from Helmet

If migrating from Helmet.js:

```typescript
// Before (Helmet)
app.use(helmet());

// After (Custom headers with Helmet compatibility)
import helmet from 'helmet';
import { securityHeaders } from './middleware/security-headers';

// Use Helmet for basic headers
app.use(helmet({
  contentSecurityPolicy: false, // Use our custom CSP
  hsts: false // Use our custom HSTS
}));

// Add our enhanced security headers
app.use(securityHeaders());
```

## Performance Considerations

- Headers add ~500-1000 bytes per response
- CSP parsing has minimal CPU impact
- Nonce generation adds ~1ms per request
- CSP reporting may increase server load

## Browser Compatibility

| Header | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| CSP 3 | ✅ 59+ | ✅ 58+ | ✅ 15.4+ | ✅ 79+ |
| HSTS | ✅ All | ✅ All | ✅ All | ✅ All |
| Permissions-Policy | ✅ 88+ | ✅ 74+ | ❌ | ✅ 88+ |

## Best Practices

1. **Start with Report-Only Mode**
   ```typescript
   process.env.CSP_REPORT_ONLY = 'true';
   ```

2. **Gradually Tighten CSP**
   - Start permissive
   - Monitor violations
   - Tighten incrementally

3. **Use Nonces Over Unsafe-Inline**
   - Generate unique nonces per request
   - Avoid `unsafe-inline` in production

4. **Monitor and Alert**
   - Track CSP violations
   - Alert on suspicious patterns
   - Regular security audits

5. **Keep Headers Updated**
   - Review quarterly
   - Update for new threats
   - Test after changes

## Resources

- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/)