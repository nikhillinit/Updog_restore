---
type: reflection
id: REFL-019
title: K-1 PDF Template Silently Drops Data Footnotes
status: VERIFIED
date: 2026-02-14
version: 1
severity: medium
components:
  - K1TaxSummaryPDF
  - buildK1ReportData
  - pdf-generation-service
keywords:
  - pdf generation
  - footnotes
  - silent data loss
  - LP reports
  - template mismatch
test_file: tests/unit/services/pdf-generation-service.test.ts
superseded_by: null
---

# Reflection: K-1 PDF Template Silently Drops Data Footnotes

## 1. The Anti-Pattern (The Trap)

A data model interface includes an optional field (`footnotes?: string[]`) that
is populated by the builder function, but the PDF template component never reads
or renders it. The data is present in memory but silently disappears from the
generated output.

**Pattern:** Interface defines field -> Builder populates field -> Template
ignores field -> LP sees no footnotes

## 2. Why It Happens

- Template was written before the footnotes field was added to the interface, or
  the field was added for "future use" but never wired into rendering
- Optional fields (`?`) create no compile-time error when ignored -- TypeScript
  does not warn that a field is "set but never read" across component boundaries
- No visual regression test or snapshot test catches missing sections in PDF
  output
- PDF output is binary (Buffer) so standard text-based assertions don't catch
  missing content

## 3. The Correct Pattern

Every optional field in a report data interface that is populated by a builder
MUST have a corresponding rendering path in the template component. Verify with
a unit test:

```typescript
it('should include PRELIMINARY footnote', () => {
  const result = buildK1ReportData(standardLPData, 1, 2024);
  expect(result.footnotes).toBeDefined();
  expect(result.footnotes!.some((f) => f.startsWith('PRELIMINARY:'))).toBe(
    true
  );
});
```

For template rendering, verify the component references `data.footnotes`:

```typescript
// In K1TaxSummaryPDF component
...(data.footnotes && data.footnotes.length > 0
  ? [React.createElement(View, { style: { ...baseStyles.section, marginTop: 8 } },
      ...data.footnotes.map((note, i) =>
        React.createElement(Text, { key: `fn-${i}`, style: baseStyles.disclaimerText },
          `${i + 1}. ${note}`)
      )
    )]
  : []),
```

## 4. Checklist for Future Report Changes

- [ ] Every field in `K1ReportData` / `QuarterlyReportData` /
      `CapitalAccountReportData` that is populated by a builder has a rendering
      path in the corresponding PDF component
- [ ] New optional fields added to report interfaces are accompanied by template
      rendering code
- [ ] Unit tests verify the data is present; visual/snapshot tests verify it
      renders

## 5. Impact

- **Severity:** Medium -- LP-facing reports missing legally relevant footnotes
  (preliminary tax allocation disclaimers)
- **Blast radius:** All K-1 PDFs generated since footnotes were added to the
  data model
- **Detection difficulty:** High -- requires reading generated PDFs; no
  compile-time or test-time warning

## 6. Related

- `server/services/pdf-generation-service.ts` lines 548-557 (K1TaxSummaryPDF
  footnotes section)
- `buildK1ReportData` return value includes `footnotes` and `preliminary` fields
