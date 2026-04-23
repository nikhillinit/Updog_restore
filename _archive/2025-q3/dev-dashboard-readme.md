# Development Dashboard

A unified development dashboard that provides real-time visibility into system
health for solo developer productivity.

## Features

### Real-time Health Monitoring

- **TypeScript Error Tracking**: Live error count and trending with detailed
  error listings
- **Test Suite Health**: Pass/fail status, coverage metrics, and performance
  monitoring
- **Build Performance**: Status, duration, bundle sizes, and warnings
- **Monte Carlo Simulation Health**: Performance metrics and error rates
- **Database Connection**: Status, latency, and connection monitoring
- **Development Server**: Status, memory usage, uptime tracking
- **Git Status**: Branch info, uncommitted changes, and last commit details

### Actionable Quick-Fix Buttons

- **TypeScript Fix**: Run type checking and auto-fix linting issues
- **Test Runner**: Execute test suite with real-time results
- **Build Trigger**: Fast development builds with progress tracking

### Real-time Updates

- WebSocket integration for live metrics updates
- File change detection with automatic refreshes
- Build and test progress notifications
- Historical trending for key metrics

## Getting Started

### 1. Start Development Environment with Dashboard

```bash
npm run dev:dashboard
```

This will:

- Start the full development server
- Enable the development dashboard
- Auto-open the dashboard in your browser

### 2. Check Development Health

```bash
npm run dev:health
```

Shows current system health status in the terminal.

### 3. Run Quick Fixes

```bash
# Fix TypeScript issues
npm run dev:fix typescript

# Run tests
npm run dev:fix tests

# Trigger build
npm run dev:fix build
```

### 4. Access Dashboard UI

Visit [http://localhost:5173/dev-dashboard](http://localhost:5173/dev-dashboard)
when the development server is running.

## Dashboard Sections

### Overview Cards

- **TypeScript**: Error count with trend indicators
- **Tests**: Pass/fail counts with coverage percentage
- **Build**: Status and performance metrics
- **Database**: Connection health and latency
- **Dev Server**: Runtime information
- **Monte Carlo**: Simulation performance

### Quick Actions

One-click buttons for common development tasks:

- TypeScript error fixes
- Test execution
- Build triggers

### Real-time Event Feed

Live updates showing:

- Build progress and completion
- Test results
- Metrics changes
- File modification events

### Git Status

Current repository state:

- Active branch
- Uncommitted changes count
- Last commit information

### Error Details

When TypeScript errors are detected:

- File paths and line numbers
- Error messages
- Quick navigation to problems

## Architecture

### Backend Components

#### Development Health API (`/api/dev-dashboard/health`)

Aggregates metrics from multiple sources:

- TypeScript compiler API
- Test runner integration
- Build system monitoring
- Database health checks
- Git status parsing

#### WebSocket Server

Real-time communication for:

- Live metric updates
- Build/test progress
- File change notifications

#### Quick Fix Endpoints

REST APIs for automated fixes:

- `/api/dev-dashboard/fix/typescript`
- `/api/dev-dashboard/fix/tests`
- `/api/dev-dashboard/fix/build`

### Frontend Components

#### Dashboard UI (`DevDashboardEnhanced`)

React component with:

- Real-time metric displays
- Interactive quick-fix buttons
- WebSocket integration
- Responsive design

#### Custom Hook (`useDevDashboard`)

Manages:

- REST API integration
- WebSocket connections
- State management
- Error handling

## Configuration

### Environment Variables

```bash
# Enable development dashboard (automatically set in development)
NODE_ENV=development

# Optional: Configure dashboard-specific settings
ENABLE_DEV_DASHBOARD=1
DEV_DASHBOARD_PORT=5000
```

### TypeScript Integration

The dashboard automatically detects:

- Compilation errors
- Linting issues
- Type checking results

### Test Integration

Supports multiple test runners:

- Vitest (primary)
- Jest (legacy)
- Playwright (E2E)

## CLI Tool

The included CLI tool (`scripts/dev-dashboard.js`) provides:

```bash
# Show help
node scripts/dev-dashboard.js help

# Check system health
node scripts/dev-dashboard.js health

# Open dashboard in browser
node scripts/dev-dashboard.js open

# Start full dev environment
node scripts/dev-dashboard.js start

# Run specific quick fix
node scripts/dev-dashboard.js fix typescript
```

## Development Mode Only

The development dashboard is automatically disabled in production environments
for security and performance reasons. All routes and WebSocket connections are
conditionally registered based on `NODE_ENV`.

## Performance Considerations

- **Caching**: Health metrics are cached for 15 seconds to prevent overwhelming
  the system
- **Debouncing**: File change events are debounced to avoid excessive updates
- **Selective Updates**: Only changed metrics trigger WebSocket updates
- **Resource Monitoring**: Dashboard tracks its own resource usage

## Troubleshooting

### Dashboard Not Loading

1. Ensure development server is running: `npm run dev`
2. Check that `NODE_ENV=development`
3. Verify port 5173 is accessible

### WebSocket Connection Issues

1. Check browser console for connection errors
2. Verify WebSocket endpoint is available
3. Fallback to polling mode if WebSocket fails

### Metrics Not Updating

1. Verify TypeScript compiler is accessible
2. Check test runner configuration
3. Ensure Git is properly configured

### Quick Fix Buttons Not Working

1. Check API endpoint availability
2. Verify npm script configurations
3. Review server logs for errors

## Extending the Dashboard

### Adding New Metrics

1. **Backend**: Add metric collection in `getXMetrics()` functions
2. **Type Definitions**: Update `DevHealthMetrics` interface
3. **Frontend**: Add display components and update UI

### Custom Quick Fixes

1. **API Endpoint**: Add new route in `dev-dashboard.ts`
2. **Frontend Integration**: Update `useDevDashboard` hook
3. **UI Components**: Add button and progress indicators

### Additional WebSocket Events

1. **Event Types**: Extend `DevDashboardEvent` interface
2. **Server Logic**: Add event emission in WebSocket handler
3. **Client Handling**: Update event processing in hook

## Best Practices

- Use the dashboard for continuous monitoring during development
- Run quick fixes before committing code
- Monitor trends to identify recurring issues
- Leverage real-time updates for immediate feedback
- Keep the dashboard open in a secondary window/monitor

## Integration with Existing Tools

The dashboard integrates seamlessly with:

- **ESLint**: Error detection and auto-fixing
- **TypeScript**: Real-time compilation monitoring
- **Vitest**: Test execution and results
- **Git**: Repository status tracking
- **npm scripts**: Automated task execution
- **Vite**: Build system integration

This creates a unified development experience that maximizes solo developer
productivity by providing immediate visibility into system health and actionable
remediation tools.
