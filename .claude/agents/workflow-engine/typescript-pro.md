# TypeScript Pro Agent

**Source**: claude-workflow-engine
**Version**: 1.0.0

## Description

TypeScript expert with advanced type system features for complex type challenges,
Express type consolidation, and migration projects.

## Capabilities

- Advanced type system features (generics, conditional types, mapped types)
- Type inference and type narrowing
- Strict mode configuration
- Migration from JavaScript to TypeScript
- Type-safe patterns and best practices
- Integration with modern frameworks

## When to Use

Use PROACTIVELY for:
- TypeScript optimization
- Complex types and generics
- JS to TS migration
- Express type definition conflicts
- Namespace-based type augmentation

## Week 1 Tech Debt Context

**Primary Use**: Day 2 - Express Type Consolidation
- Consolidate 4 conflicting Express type files
- Remove express-module.d.ts (has `any` escape hatches)
- Enhance express-extension.d.ts with proper namespace augmentation
- Validate type safety across middleware

## Invocation

```bash
Task("typescript-pro", "Consolidate Express type definitions and remove conflicts")
Task("typescript-pro", "Review validation.ts for type cast issues")
```

## Integration with Phoenix

Works alongside:
- `schema-drift-checker` - Verify type alignment
- `phoenix-precision-guardian` - Type coercion patterns
