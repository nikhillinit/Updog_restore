# Wizard Components

Three wizard-specific components for building multi-step forms with consistent styling and autosave functionality.

## Components

### 1. ProgressStepper

Breadcrumb-style step indicator for wizard navigation.

**Location:** `client/src/components/wizard/ProgressStepper.tsx`

**Props:**
- `current: number` - Current step number (1-indexed)
- `steps: ProgressStep[]` - Array of step objects with `id`, `label`, and `href`

**Features:**
- Shows all steps with numbered circles
- Current step highlighted with `bg-charcoal` and `text-white`
- Completed steps use `bg-charcoal/90` with hover effects
- Inactive steps use `bg-lightGray` with disabled state
- Separator slashes (/) between steps
- Clickable links for navigation
- Responsive: stacks on mobile

**Example:**
```tsx
import { ProgressStepper } from '@/components/wizard/ProgressStepper';

const steps = [
  { id: 'basics', label: 'Fund Basics', href: '/wizard?step=1' },
  { id: 'strategy', label: 'Strategy', href: '/wizard?step=2' },
  { id: 'review', label: 'Review', href: '/wizard?step=3' },
];

<ProgressStepper current={2} steps={steps} />
```

### 2. WizardCard

Card wrapper for wizard step content sections.

**Location:** `client/src/components/wizard/WizardCard.tsx`

**Props:**
- `title: string` - Card title (required)
- `description?: string` - Optional description text
- `children: React.ReactNode` - Card content
- `className?: string` - Additional CSS classes

**Features:**
- White `bg-white` with `shadow-card`
- Border `border-lightGray`
- Rounded corners `rounded-lg`
- Header with title (h2, `font-heading`, text-lg)
- Optional description (text-sm, `text-charcoal/60`)
- Consistent padding `p-5`

**Example:**
```tsx
import { WizardCard } from '@/components/wizard/WizardCard';

<WizardCard
  title="Fund Basics"
  description="Enter the basic information about your fund"
>
  <div className="space-y-4">
    {/* Your form fields here */}
  </div>
</WizardCard>
```

### 3. useAutosave Hook

Extract autosave pattern with debouncing and status tracking.

**Location:** `client/src/hooks/useAutosave.ts`

**Interface:**
```typescript
function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delay?: number
): 'idle' | 'saving' | 'saved' | 'error'
```

**Parameters:**
- `value: T` - The value to autosave
- `save: (value: T) => Promise<void>` - Async save function
- `delay?: number` - Debounce delay in milliseconds (default: 800ms)

**Returns:**
- `AutosaveStatus` - Current save status: 'idle' | 'saving' | 'saved' | 'error'

**Features:**
- Debounced save with configurable delay
- Status tracking for UI feedback
- Automatic cleanup on unmount
- Skips initial mount to avoid unnecessary save
- Generic TypeScript support
- Error handling with console logging

**Example:**
```tsx
import { useAutosave } from '@/hooks/useAutosave';

function MyForm() {
  const [formData, setFormData] = useState({ name: '', email: '' });

  const status = useAutosave(
    formData,
    async (data) => {
      await api.save(data);
    },
    800
  );

  return (
    <div>
      {/* Show status indicator */}
      {status === 'saving' && <Spinner />}
      {status === 'saved' && <CheckIcon />}
      {status === 'error' && <ErrorIcon />}

      {/* Your form fields */}
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
    </div>
  );
}
```

## Complete Example

See `wizard-components.example.tsx` for a full working example that combines all three components.

## Styling

All components use Press On brand colors from `tailwind.config.ts`:

- **Primary:** `charcoal` (#292929)
- **Background:** `white` (#FFFFFF)
- **Neutral:** `lightGray` (#F2F2F2)
- **Accent:** `beige` (#E0D8D1)
- **Success:** `success` (#10B981)
- **Error:** `error` (#EF4444)

## Files Created

1. `client/src/components/wizard/ProgressStepper.tsx` - Step indicator component
2. `client/src/components/wizard/WizardCard.tsx` - Card wrapper component
3. `client/src/hooks/useAutosave.ts` - Autosave hook
4. `client/src/components/wizard/wizard-components.example.tsx` - Usage examples
5. `client/src/components/wizard/README.md` - This documentation
