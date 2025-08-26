# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | :white_check_mark: |
| 1.2.x   | :white_check_mark: |
| < 1.2   | :x:                |

## Reporting a Vulnerability

We take security seriously and appreciate your efforts to responsibly disclose vulnerabilities.

### How to Report

**DO NOT** create public GitHub issues for security vulnerabilities.

Instead, please report security vulnerabilities via one of these methods:

1. **Email**: security@povc.fund (preferred)
2. **GitHub Security Advisory**: [Report via GitHub](https://github.com/nikhillinit/Updog_restore/security/advisories/new)

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any proof-of-concept code (if applicable)
- Your contact information for follow-up questions

### Response Timeline

- **Initial Response**: Within 48 hours of receipt
- **Status Update**: Within 5 business days
- **Resolution Target**: 
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 90 days

## Security Measures

### Current Security Features

- **Content Security Policy (CSP)**: Enforced in production, report-only in staging
- **HSTS Headers**: Strict Transport Security enabled
- **Input Validation**: Zod schema validation on all API endpoints
- **SQL Injection Protection**: Parameterized queries via Drizzle ORM
- **XSS Protection**: React's built-in XSS protection + CSP
- **Rate Limiting**: API rate limiting per IP and per user
- **Authentication**: Session-based auth with secure cookies
- **Dependency Scanning**: Automated via GitHub Dependabot and OWASP Dependency-Check
- **Container Scanning**: Trivy scanning for Docker images
- **Code Analysis**: CodeQL security scanning in CI

### Security Headers Configuration

Production headers enforced:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## Security Checklist for Contributors

Before submitting a PR:

- [ ] No secrets or credentials in code
- [ ] Input validation for all user inputs
- [ ] Proper error handling without exposing system details
- [ ] SQL queries use parameterized statements
- [ ] New dependencies reviewed for vulnerabilities
- [ ] Security headers maintained/enhanced
- [ ] Authentication and authorization checks in place
- [ ] Logging doesn't include sensitive data

## Vulnerability Disclosure Policy

We follow a coordinated disclosure process:

1. **Reporter submits vulnerability** → We acknowledge within 48 hours
2. **We investigate and validate** → Status update within 5 business days
3. **We develop and test fix** → According to severity timeline
4. **Coordinated disclosure** → We notify users and release patch
5. **Public disclosure** → After patch is widely deployed (typically 30 days)

## Security Contacts

- **Primary Contact**: security@povc.fund
- **Emergency Contact**: security-urgent@povc.fund
- **PGP Key**: Available at [keys.openpgp.org](https://keys.openpgp.org) (search for security@povc.fund)

## Recognition

We appreciate security researchers who help us maintain the security of our platform. With your permission, we'll acknowledge your contribution in our security acknowledgments.

## Compliance

This project aims to comply with:
- OWASP Top 10 security practices
- CWE/SANS Top 25 Most Dangerous Software Errors
- Industry best practices for financial software security

## Security Updates

Security updates are published through:
- GitHub Security Advisories
- Release notes for security patches
- Email notifications to registered users (for critical issues)

---

*Last Updated: 2025-08-26*
*Version: 1.0*