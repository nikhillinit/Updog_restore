---
status: ACTIVE
last_updated: 2026-01-19
---

# Performance Logging Automation

This document describes the automated performance logging system that runs `EXPLAIN ANALYZE` queries against the PostgreSQL database and tracks performance metrics over time.

## Overview

The system automates the manual "Analyze" step from our BMAD plan by:
1. Running `EXPLAIN ANALYZE SELECT * FROM mc_stats_1min LIMIT 10000;`
2. Parsing execution time, memory usage, and buffer statistics
3. Formatting results into markdown entries with timestamps and performance grades
4. Appending results to `perf-log.md` in the repository root
5. Automatically committing and pushing updates via GitHub Actions

## Components

### 1. Node.js Script (`scripts/auto-perf-log.js`)

**Primary implementation** using the existing Neon serverless connection:

```bash
# Run manually
node scripts/auto-perf-log.js

# Requires DATABASE_URL environment variable
export DATABASE_URL="postgresql://username:password@host:5432/database"
```

**Features:**
- Uses `@neondatabase/serverless` for database connectivity
- Parses JSON query plans for detailed metrics extraction
- Calculates derived metrics (P95 latency, buffer hit ratio, throughput)
- Assigns performance grades (A-D) based on execution time and buffer efficiency
- Creates structured markdown output with timestamps

### 2. Shell Script (`scripts/auto-perf-log.sh`)

**Fallback implementation** using PostgreSQL client tools:

```bash
# Run manually (Linux/macOS)
./scripts/auto-perf-log.sh

# Requirements: psql, jq, bc
# On Ubuntu: sudo apt-get install postgresql-client jq bc
```

**Features:**
- Uses `psql` command-line client for database connectivity
- JSON parsing with `jq` for metrics extraction
- Colorized terminal output with status indicators
- Robust error handling and prerequisite checking
- Same performance grading system as Node.js version

### 3. GitHub Actions Workflow (`.github/workflows/auto-perf-log.yml`)

**Automated CI/CD integration** that:

#### Triggers
- **Push events**: Feature branches (`feature/*`), `develop`, `main`
- **Pull requests**: To `develop` or `main` branches
- **Scheduled**: Daily at 2 AM UTC
- **Manual**: Via workflow dispatch

#### Execution Flow
1. **Environment Setup**: Node.js 20, PostgreSQL client, dependencies
2. **Primary Analysis**: Runs Node.js script
3. **Fallback Analysis**: Runs shell script if Node.js fails
4. **Validation**: Checks performance log format and required sections
5. **PR Comments**: Posts performance metrics on pull requests
6. **Auto-commit**: Commits and pushes updated `perf-log.md`
7. **Alert System**: Creates GitHub issues for performance degradation (Grade C/D)

## Performance Metrics

### Execution Metrics
- **Execution Time**: Time spent executing the query (ms)
- **Planning Time**: Time spent planning the query (ms)
- **Total DB Time**: Combined execution + planning time (ms)
- **Wall Clock Time**: Total time including network overhead (ms)
- **P95 Latency**: Simulated 95th percentile latency (1.2x total time)

### Buffer Statistics
- **Shared Hit Blocks**: Pages found in buffer cache
- **Shared Read Blocks**: Pages read from disk
- **Buffer Hit Ratio**: Percentage of pages served from cache

### Resource Usage
- **Total Rows Processed**: Number of rows returned/processed
- **Memory Usage**: Query memory consumption (when available)
- **Throughput**: Rows processed per second

### Performance Grading

| Grade | Criteria |
|-------|----------|
| **A** | < 1000ms execution, > 90% buffer hit ratio |
| **B** | 1000-2000ms execution, 70-90% buffer hit ratio |
| **C** | 2000-5000ms execution, moderate performance issues |
| **D** | > 5000ms execution, < 70% buffer hit ratio |

## Setup Instructions

### 1. Repository Secrets

Add the following secret to your GitHub repository:

```
DATABASE_URL=postgresql://username:password@host:5432/database
```

**Path**: Repository Settings → Secrets and variables → Actions → New repository secret

### 2. Local Development

#### Node.js Version
```bash
# Install dependencies
npm install

# Set environment variable
export DATABASE_URL="your-database-url"

# Run analysis
node scripts/auto-perf-log.js
```

#### Shell Version
```bash
# Make executable (Linux/macOS)
chmod +x scripts/auto-perf-log.sh

# Install prerequisites (Ubuntu)
sudo apt-get install postgresql-client jq bc

# Set environment variable
export DATABASE_URL="your-database-url"

# Run analysis
./scripts/auto-perf-log.sh
```

### 3. CI/CD Integration

The workflow is automatically active once the YAML file is in `.github/workflows/`. No additional setup required.

## Output Format

Performance results are appended to `perf-log.md` in this format:

```markdown
## Performance Analysis - Mon Jan 15 2024 14:30:22 GMT+0000 (UTC)

**Query:** `SELECT * FROM mc_stats_1min LIMIT 10000`

### Execution Metrics
- **Execution Time:** 245.50ms
- **Planning Time:** 12.30ms
- **Total DB Time:** 257.80ms
- **Wall Clock Time:** 280ms
- **P95 Latency:** 309.36ms

### Buffer Statistics
- **Shared Hit Blocks:** 1247
- **Shared Read Blocks:** 23
- **Buffer Hit Ratio:** 98.19%

### Resource Usage
- **Total Rows Processed:** 10000
- **Memory Usage:** N/A
- **Throughput:** 38803 rows/sec

### Performance Grade
**Grade: A** - Excellent performance! 🚀

---
```

## Monitoring and Alerts

### Automated Alerts
- **Performance Degradation**: GitHub issues created for Grade C/D performance
- **PR Comments**: Performance metrics automatically posted on pull requests
- **Daily Reports**: Scheduled analysis provides trend monitoring

### Manual Monitoring
- **Performance Log**: Review `perf-log.md` for historical trends
- **GitHub Actions**: Check workflow runs for execution status
- **Repository Issues**: Monitor auto-created performance alerts

## Troubleshooting

### Common Issues

#### 1. Database Connection Failures
```
❌ Error running analysis: connection timeout
```
**Solutions:**
- Verify `DATABASE_URL` secret is correctly set
- Check database server availability
- Confirm firewall/network access from GitHub Actions

#### 2. Missing Table Error
```
❌ Error running analysis: relation "mc_stats_1min" does not exist
```
**Solutions:**
- Ensure the `mc_stats_1min` table exists in your database
- Update the SQL query in script configuration if table name differs
- Run database migrations/setup scripts

#### 3. Permission Errors
```
❌ Error running analysis: permission denied for table mc_stats_1min
```
**Solutions:**
- Grant SELECT permissions to the database user
- Ensure user has EXPLAIN privileges
- Consider using a dedicated read-only user for performance analysis

#### 4. Git Push Failures
```
❌ fatal: could not read Username for 'https://github.com': terminal prompts disabled
```
**Solutions:**
- Check repository permissions for GitHub Actions
- Verify `GITHUB_TOKEN` has write access to the repository
- Ensure branch protection rules allow automated commits

#### 5. Workflow Permission Issues
```
❌ Resource not accessible by integration
```
**Solutions:**
- Go to Repository Settings → Actions → General
- Set "Workflow permissions" to "Read and write permissions"
- Enable "Allow GitHub Actions to create and approve pull requests"

### Script Customization

#### Modifying the SQL Query
To analyze different tables or adjust the query:

**Node.js Script:**
```javascript
// Edit line 15 in scripts/auto-perf-log.js
const SQL_QUERY = 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM your_table LIMIT 5000;';
```

**Shell Script:**
```bash
# Edit line 12 in scripts/auto-perf-log.sh
SQL_QUERY="EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM your_table LIMIT 5000;"
```

#### Adjusting Performance Thresholds
To modify performance grading criteria:

**Node.js Script:**
```javascript
// Edit getPerformanceGrade() method around line 160
if (totalTime > 2000) { // Change threshold from 1000ms to 2000ms
```

**Shell Script:**
```bash
# Edit get_performance_grade() function around line 140
if [[ $(echo "${total_time} > 2000" | bc -l) -eq 1 ]]; then
```

## Integration with Existing BMAD Process

This automation replaces the manual "Analyze" step in your BMAD plan:

### Before (Manual Process)
1. Developer runs: `EXPLAIN ANALYZE SELECT * FROM mc_stats_1min LIMIT 10000;`
2. Developer manually copies results to `perf-log.md`
3. Developer manually commits and pushes changes

### After (Automated Process)
1. Push code to feature branch
2. GitHub Actions automatically runs analysis
3. Results are automatically formatted and committed
4. PR receives performance metrics comment
5. Alerts are created for performance issues

## Advanced Configuration

### Environment Variables

Both scripts support additional configuration via environment variables:

```bash
# Database connection
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Performance log file location (default: perf-log.md)
export PERF_LOG_FILE="custom-perf-log.md"

# Custom query (Node.js script only)
export CUSTOM_SQL_QUERY="EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM custom_table;"
```

### Extending the Scripts

#### Adding Custom Metrics
To add new performance metrics, modify the `parseMetrics()` function in the Node.js script or `parse_and_format_metrics()` in the shell script.

#### Custom Alerting
The GitHub Actions workflow can be extended to send notifications to Slack, email, or other systems by adding additional steps.

## Best Practices

1. **Database User**: Use a dedicated read-only database user for performance analysis
2. **Scheduling**: Consider running analysis during low-traffic periods
3. **Data Retention**: Periodically archive old performance log entries
4. **Query Optimization**: Use the performance data to identify and fix slow queries
5. **Monitoring**: Set up alerts for consistently poor performance grades

## Related Documentation

- [BMAD Process Overview](./bmad-brief.md)
- [Database Schema](./schema.md)
- [Observability Setup](./observability.md)
- [GitHub Workflow Guide](./processes/GITHUB_SETUP.md)
