# Remediation Plan

## Strategy (Per Codex Analysis)

### 1. glob (Low Risk)
- Lock already resolves to 11.1.0, just align package.json
- Minor version bump, no breaking changes expected

### 2. vite (No Action Needed)
- Version 5.4.21 is on patched 5.4.x line
- CVEs mentioned (7.0.5) apply to 7.x branch

### 3. diff (Medium Risk)
- Add npm override to force 8.0.3+
- Transitive via ts-node, may affect error formatting
- Requires test validation

### 4. @react-pdf/pdfkit (Medium Risk)
- Add npm override to force 4.1.0
- Requires PDF output testing

## Commands

```bash
# Step 1: Align glob version in package.json
npm pkg set devDependencies.glob="^11.1.0"

# Step 2: Add overrides for transitive dependencies
# (Add to package.json overrides section)

# Step 3: Regenerate lockfile
npm install

# Step 4: Verify
npm list glob diff @react-pdf/pdfkit
```

## package.json Overrides to Add
```json
{
  "overrides": {
    "diff": "^8.0.3",
    "@react-pdf/pdfkit": "^4.1.0"
  }
}
```
