# Tear Sheet Export Feature

## Overview
The Tear Sheet Dashboard now supports bulk and individual CSV exports, allowing users to export portfolio company tear sheets en masse.

## Usage

### Accessing Tear Sheets
1. Navigate to `/reports` in the application
2. Click on the "Tear Sheets" tab
3. You'll see a list of all portfolio company tear sheets

### Bulk Export
1. Use search and filters (sector, status) to narrow down the tear sheets if needed
2. Click the **"Export All"** button in the top-right corner
3. A CSV file will be downloaded with the filename format: `tear-sheets-YYYY-MM-DD.csv`
4. The export will include all tear sheets that match your current filters

### Individual Export
1. Locate the tear sheet you want to export
2. Click the **"CSV"** button at the bottom of the tear sheet card
3. A CSV file will be downloaded with the filename format: `tear-sheet-company-name-YYYY-MM-DD.csv`

## Exported Data Fields

The CSV export includes 30 comprehensive fields:

### Company Information
- Company Name
- Sector
- Stage
- Status
- Version
- Website
- Fiscal Year
- Location

### Investment Details
- Investment Lead
- % of Fund
- Classification
- Collection
- Expected Exit Value
- Factor Rating
- Health
- Like Company
- Parent Entity
- Pro Rata

### Team & Relationships
- Board Composition (semicolon-separated)
- Co-Investors (semicolon-separated)
- Contacts (name and role, semicolon-separated)

### Notes & Commentary
- Deal Team Notes
- Revenue Notes
- Company Sentiment (LP commentary)
- Commentary Author
- Commentary Version
- Founder Maturity

### Metadata
- Last Modified (timestamp)
- Modified By (user name)

## Technical Implementation

The export functionality:
- Uses the existing `exportCsv` utility from `client/src/utils/exporters.ts`
- Leverages PapaParse library for CSV generation
- Implements CSV injection protection via sanitization
- Respects current search and filter selections
- Uses lazy loading to keep bundle size small

## Security Features

- **CSV Injection Prevention**: All values are sanitized to prevent formula injection attacks
- **Data Sanitization**: Leading control characters are properly handled
- Values starting with `=`, `+`, `-`, or `@` are prefixed with a single quote

## Future Enhancements

Potential improvements:
- Excel (XLSX) export support (currently available but disabled)
- PDF export for individual tear sheets (placeholder currently exists)
- Custom field selection for exports
- Export templates for different stakeholder types
- Scheduled/automated exports
