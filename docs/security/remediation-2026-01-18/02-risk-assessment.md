---
status: ACTIVE
last_updated: 2026-01-19
---

# Risk Assessment

## Vite (3 CVEs)
- CVE-2025-58751: Middleware serving private files
- CVE-2025-58752: server.fs not applied to HTML
- CVE-2025-62522: Windows path traversal
- Risk Level: HIGH (Windows dev environment)

## Glob (CVE-2025-64756)
- Command Injection vulnerability
- Risk Level: MEDIUM

## Diff (GHSA-73rr-hh4g-fpgx)
- ReDoS vulnerability
- Major version jump required (4.x -> 8.x)
- Risk Level: MEDIUM (breaking changes possible)

## @react-pdf/pdfkit
- Obfuscated code in supply chain
- Risk Level: MEDIUM (review needed)
