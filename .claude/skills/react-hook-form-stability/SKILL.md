---
status: ACTIVE
last_updated: 2026-01-19
---

# React Hook Form Stability and Effect Hygiene

## Overview

This skill codifies patterns for stable, loop-free React Hook Form (RHF) usage in combination with TanStack Query and autosave. It addresses the specific failure modes encountered in wizard-style multi-step forms with real-time persistence.

**Target Stack**: React Hook Form 7.x + TanStack Query v5 + debounced autosave

## The Infinite Loop Checklist

When you see re-render loops, check in this order:

### 1. Is watch() called inside render without subscription?

```typescript
// BAD: Creates new reference every render -> infinite loop
function WizardStep() {
  const { watch } = useForm();
  const values = watch(); // Called in render body!

  useEffect(() => {
    save(values);
  }, [values]); // values is new object every render -> loop
}

// GOOD: Subscription-based watch
function WizardStep() {
  const { watch } = useForm();

  useEffect(() => {
    const subscription = watch((data) => {
      debouncedSave(data);
    });
    return () => subscription.unsubscribe();
  }, [watch]); // watch is stable
}
```

### 2. Is a useEffect dependency an unstable reference?

### 3. Is autosave triggering on its own mutation's invalidation?

### 4. Is reset() being called with a new object reference on every render?

## Safe Autosave Patterns

### Pattern 1: Subscription-Based with Stable Debounce

```typescript
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { debounce } from 'lodash-es';

function useAutosave<T>(fundId: string) {
  const { watch, formState: { isDirty } } = useForm<T>();

  const { mutate } = useMutation({
    mutationFn: (data: T) => saveFund(fundId, data),
  });

  // Stable debounced save function
  const debouncedSave = useRef(
    debounce((data: T) => {
      mutate(data);
    }, 1000)
  ).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Subscription-based watch
  useEffect(() => {
    const subscription = watch((data) => {
      if (isDirty) {
        debouncedSave(data as T);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, isDirty, debouncedSave]);
}
```

### Pattern 2: Structural Hash for Deep Comparison

When debounce alone isn't enough (complex nested objects), use a structural hash library.

### Pattern 3: Controlled Dirty State

Track dirty fields explicitly and only save when there are actual changes.

## TanStack Query Integration

### Safe Query -> Form Sync

```typescript
function useFundForm(fundId: string) {
  const queryClient = useQueryClient();

  const { data: serverData, isLoading } = useQuery({
    queryKey: ['fund', fundId],
    queryFn: () => fetchFund(fundId),
    staleTime: Infinity, // Don't refetch while editing
  });

  const form = useForm({
    defaultValues: serverData,
  });

  // Save mutation with optimistic cache update
  const { mutate: save, isPending } = useMutation({
    mutationFn: (data: FundData) => saveFund(fundId, data),
    onSuccess: (savedData) => {
      // Update cache without triggering refetch
      queryClient.setQueryData(['fund', fundId], savedData);
    },
  });

  return { form, save, isLoading, isSaving: isPending };
}
```

### Avoiding the Invalidation Loop

```typescript
// DANGER ZONE: These can cause loops

// 1. Invalidating the same query you're watching
onSuccess: () => queryClient.invalidateQueries(['fund', fundId])

// 2. Refetching on window focus while form is dirty
useQuery({ refetchOnWindowFocus: true })

// 3. Background refetch intervals
useQuery({ refetchInterval: 30000 })


// SAFE PATTERNS

// 1. Direct cache update, no refetch
onSuccess: (data) => queryClient.setQueryData(['fund', fundId], data)

// 2. Disable refetch while editing
useQuery({
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Infinity,
})
```

## Referential Stability Checklist

Before adding anything to a useEffect dependency array, verify:

| Item | Stable? | How to Stabilize |
|------|---------|------------------|
| watch (from useForm) | YES | N/A |
| reset (from useForm) | YES | N/A |
| setValue (from useForm) | YES | N/A |
| handleSubmit (from useForm) | YES | N/A |
| formState | NO | Destructure specific fields |
| formState.isDirty | YES | N/A |
| formState.errors | NO | Use useMemo or check specific fields |
| watch() return value | NO | Use subscription pattern |
| getValues() return value | NO | Call inside effect, not as dep |
| Inline objects { foo: 'bar' } | NO | Extract to constant or useMemo |
| Inline functions () => {} | NO | Use useCallback |
| Props objects | MAYBE | Depends on parent; verify or memoize |

## Unmount and Navigation Safety

### beforeunload Handler
Warn users about unsaved changes when leaving page.

### React Router Navigation Blocking
Use useBlocker to prevent navigation with unsaved changes.

### Cleanup on Unmount
Flush pending saves on unmount, cancel on subscription cleanup.

## Version Notes

This skill targets:
- **React Hook Form**: 7.x (patterns may differ for 8.x)
- **TanStack Query**: v5 (v4 has different mutation API)
- **React**: 18.x (concurrent features considered)
