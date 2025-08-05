export function logMetrics(stage: string, metrics: Record<string, number>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    stage,
    metrics,
    commit: process.env.GITHUB_SHA ?? 'local'
  }));
}
