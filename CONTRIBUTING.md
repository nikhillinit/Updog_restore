# Contributing Guidelines

## Development Setup

### TypeScript Configuration

This project uses multiple TypeScript configurations:

- `tsconfig.json` - Main configuration for strict type checking
- `tsconfig.fast.json` - Development configuration with relaxed settings

The `skipLibCheck: true` option in `tsconfig.fast.json` is used to speed up compilation during development by skipping type checking of declaration files. This is useful when node_modules types may be outdated but application code is valid.

### AI Development Assistant

The project includes a Claude configuration for AI-assisted development:

**Active Configuration**: `.claude/settings.local.json`

This file contains local settings for Claude Code integration, including tool configurations and workspace preferences. It is excluded from version control to allow individual developer customization.

### Test Structure

Tests are organized by category:
- `tests/` - Core business logic tests
- `tests/api/` - API and engine tests  
- `tests/performance/` - Performance and optimization tests
- `tests/ui/` - UI component tests (if applicable)

### Development Workflow

1. Use `npm run dev` for development server
2. Use `npm test` to run the test suite
3. Use `npm run build` to build for production
4. Use `npm run typecheck` for strict TypeScript checking

### Code Quality

- All code should pass TypeScript strict mode checking
- Tests should maintain >80% coverage for new features
- Follow existing code patterns and naming conventions
- Use the provided ESLint configuration

## Rationale for skipLibCheck

The `skipLibCheck: true` setting is used in development configuration because:

1. **Speed**: Significantly reduces TypeScript compilation time
2. **Compatibility**: Avoids type conflicts with third-party library definitions
3. **Development Focus**: Allows focus on application code correctness
4. **CI/Production**: Full type checking still occurs in production builds

This approach balances development speed with type safety by maintaining strict checking for application code while allowing flexibility with library types.