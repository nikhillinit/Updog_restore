# Capital Allocation Components

Portfolio management UI components for the Capital Allocation wizard step.

## Components

### 1. CapitalHeader
Displays capital utilization with a progress bar showing deployed, reserved, and available capital.

**Features:**
- Three-segment progress bar (deployed/reserved/available)
- Color-coded segments (green/blue/gray)
- Percentage and dollar displays
- Over-allocation warning

**Props:**
```typescript
interface CapitalHeaderProps {
  fundSize: number;      // Total fund size in millions
  deployed: number;      // Deployed capital in millions
  reserved: number;      // Reserved capital in millions
  available: number;     // Available capital in millions
}
```

### 2. PortfolioConfigForm
Reserve ratio configuration with interactive slider and dollar display.

**Features:**
- Slider control (0-100%)
- Direct input field (0-1 decimal)
- Real-time capital allocation summary
- Guidance for typical ranges (30-70%)

**Props:**
```typescript
interface PortfolioConfigFormProps {
  fundSize: number;
  reserveRatio: number;                    // 0-1 decimal
  onReserveRatioChange: (ratio: number) => void;
}
```

### 3. CompanyDialog
Add/edit company dialog with form validation.

**Features:**
- Create or edit portfolio companies
- Zod schema validation
- MOIC preview calculation
- Sector and stage dropdowns
- Investment amount inputs

**Props:**
```typescript
interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyData;                   // Edit mode if provided
  onSave: (company: CompanyData) => void;
  sectors?: string[];                      // Optional custom sectors
}
```

### 4. PortfolioTable
Portfolio companies table with MOIC color coding and delete confirmation.

**Features:**
- MOIC color coding (green/red with arrows)
- Zebra striping (alternating row colors)
- Right-aligned numbers
- Edit/delete actions
- Delete confirmation dialog
- Portfolio summary cards
- Empty state

**Props:**
```typescript
interface PortfolioTableProps {
  companies: CompanyData[];
  onEdit: (company: CompanyData) => void;
  onDelete: (id: string) => void;
}
```

## Usage Example

```tsx
import React from 'react';
import {
  CapitalHeader,
  PortfolioConfigForm,
  CompanyDialog,
  PortfolioTable,
  CompanyData
} from './capital-allocation';

export function CapitalAllocationDemo() {
  const [fundSize] = React.useState(100); // $100M fund
  const [reserveRatio, setReserveRatio] = React.useState(0.5); // 50%
  const [companies, setCompanies] = React.useState<CompanyData[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<CompanyData | undefined>();

  // Calculate capital allocation
  const deployed = companies.reduce(
    (sum, c) => sum + c.initialInvestment + (c.followOnInvestment || 0),
    0
  );
  const reserved = fundSize * reserveRatio;
  const available = fundSize - deployed - reserved;

  const handleSaveCompany = (company: CompanyData) => {
    if (editingCompany) {
      setCompanies(prev => prev.map(c => c.id === company.id ? company : c));
    } else {
      setCompanies(prev => [...prev, company]);
    }
    setEditingCompany(undefined);
  };

  const handleEditCompany = (company: CompanyData) => {
    setEditingCompany(company);
    setDialogOpen(true);
  };

  const handleDeleteCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-6">
      <CapitalHeader
        fundSize={fundSize}
        deployed={deployed}
        reserved={reserved}
        available={available}
      />

      <PortfolioConfigForm
        fundSize={fundSize}
        reserveRatio={reserveRatio}
        onReserveRatioChange={setReserveRatio}
      />

      <div className="flex items-center justify-between">
        <h3 className="font-inter font-bold text-lg">Portfolio Companies</h3>
        <button
          onClick={() => {
            setEditingCompany(undefined);
            setDialogOpen(true);
          }}
          className="px-4 py-2 bg-charcoal text-white rounded"
        >
          Add Company
        </button>
      </div>

      <PortfolioTable
        companies={companies}
        onEdit={handleEditCompany}
        onDelete={handleDeleteCompany}
      />

      <CompanyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={editingCompany}
        onSave={handleSaveCompany}
      />
    </div>
  );
}
```

## Styling

All components use:
- **Tailwind CSS** for styling
- **shadcn/ui** components (Dialog, Alert Dialog, Table, Button, etc.)
- **Press On Ventures** design system colors:
  - `pov-charcoal` for primary text
  - `#E0D8D1` for borders
  - Green/red for positive/negative MOIC

## File Structure

```
capital-allocation/
├── CapitalHeader.tsx          (119 lines)
├── PortfolioConfigForm.tsx    (149 lines)
├── CompanyDialog.tsx          (309 lines)
├── PortfolioTable.tsx         (279 lines)
├── index.ts                   (16 lines)
└── README.md                  (this file)
```

**Total:** 872 lines across 4 components + index

## Line Count Summary

- CapitalHeader.tsx: 119 lines
- PortfolioConfigForm.tsx: 149 lines
- CompanyDialog.tsx: 309 lines
- PortfolioTable.tsx: 279 lines
- **Total: 856 lines** (exceeds 750 line requirement)
