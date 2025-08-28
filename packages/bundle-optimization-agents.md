# Bundle Optimization Agents

AI-powered agents for autonomous bundle size optimization, dependency management, and route optimization.

## Available Agents

### 1. Bundle Optimization Agent
Analyzes and optimizes bundle composition to achieve target size.

**Usage:**
```bash
npm run ai bundle-optimize --target=400 --strategy=balanced
```

**Capabilities:**
- Analyze bundle composition
- Identify optimization opportunities
- Apply safe optimizations automatically
- Preserve functionality with testing
- Generate detailed reports

### 2. Dependency Analysis Agent
Intelligent dependency management and tree-shaking optimization.

**Usage:**
```bash
npm run ai deps-analyze --unused --heavy --duplicates
```

**Capabilities:**
- Find unused dependencies
- Identify heavy dependencies
- Detect duplicate packages
- Suggest lighter alternatives
- Generate removal commands

### 3. Route Optimization Agent
Automated lazy loading and code splitting for routes.

**Usage:**
```bash
npm run ai routes-optimize --analyze-usage --implement
```

**Capabilities:**
- Analyze route usage patterns
- Implement lazy loading
- Generate loading states
- Test navigation flows
- Risk assessment

## Bundle Orchestrator

Coordinates all agents for comprehensive optimization:

```bash
npm run ai bundle-orchestrate --target=400 --strategy=balanced
```

**Phases:**
1. Initial analysis and checkpoint
2. Dependency optimization
3. Route optimization
4. Bundle optimization iterations
5. Validation and reporting

## Gateway Commands

### Analyze current bundle:
```bash
npm run ai bundle-analyze --format=json --output=bundle-report.json
```

### Monitor bundle size:
```bash
node scripts/ai-tools/bundle-analyzer.mjs monitor --target=400
```

### Generate comprehensive report:
```bash
node scripts/ai-tools/bundle-analyzer.mjs report --output=optimization-report.json
```

## Configuration

All agents extend the BaseAgent class and include:
- Retry logic with exponential backoff
- Metrics collection and monitoring
- Health tracking
- Structured logging
- ETag caching

## Integration with CI/CD

```yaml
# Example GitHub Actions workflow
- name: Bundle Optimization Check
  run: |
    npm run ai bundle-analyze --format=json --output=bundle.json
    npm run ai bundle-orchestrate --target=400 --dry-run
```

## Architecture

```
packages/
├── agent-core/              # Base agent infrastructure
├── bundle-optimization-agent/  # Bundle size optimization
├── dependency-analysis-agent/  # Dependency management
└── route-optimization-agent/   # Route lazy loading

scripts/ai-tools/
├── bundle-analyzer.mjs      # Gateway script for bundle commands
├── orchestrate-bundle-optimization.mjs  # Orchestration logic
└── index.js                  # Main AI gateway
```

## Safety Features

- **Rollback on failure**: Automatic git checkpoint and rollback
- **Test preservation**: Runs tests after each optimization
- **Progressive enhancement**: Start with safe optimizations
- **Dry run mode**: Preview changes without applying

## Metrics and Monitoring

Agents integrate with the existing observability stack:
- Prometheus metrics collection
- Grafana dashboards
- AlertManager notifications
- Structured JSON logging

## Development

### Adding a new agent:
1. Extend BaseAgent class
2. Implement performOperation method
3. Add gateway command in scripts/ai-tools/index.js
4. Create tests in agent package

### Testing agents:
```bash
# Unit tests
npm test packages/bundle-optimization-agent

# Integration tests  
npm run test:integration -- bundle-optimization
```

## Best Practices

1. **Start with analysis**: Always analyze before optimizing
2. **Use dry-run first**: Test changes before applying
3. **Monitor continuously**: Use bundle:monitor for real-time tracking
4. **Incremental approach**: Apply optimizations gradually
5. **Validate thoroughly**: Run full test suite after changes