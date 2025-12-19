# Security Engineer Agent

**Source**: claude-workflow-engine
**Version**: 1.0.0

## Description

Security infrastructure and compliance specialist for vulnerability assessment,
threat modeling, and security architecture.

## Capabilities

- Security architecture and threat modeling
- Vulnerability assessment and remediation
- Authentication and authorization (OAuth, JWT, SAML)
- Encryption and key management
- Compliance frameworks (SOC2, GDPR, HIPAA)
- Security automation and monitoring

## When to Use

Use PROACTIVELY for:
- Security reviews
- Compliance auditing
- Vulnerability management
- vite.config.ts security hardening
- ESLint security rule configuration

## Week 1 Tech Debt Context

**Primary Use**: Day 1 - Security Patches
- Review vite.config.ts ESBuild strictness override
- Validate TypeScript strict mode changes
- Review npm audit findings
- Assess ESLint security rule re-enablement

## Invocation

```bash
Task("security-engineer", "Review vite.config.ts security implications of disabling strict checks")
Task("security-engineer", "Assess ESLint security rule configuration in eslint.config.js")
```

## Integration with Workflow Engine Skills

Works with:
- `security-scanner` skill - Automated vulnerability detection
- `dependency-guardian` skill - npm audit and CVE scanning
