import { Pool } from 'pg';
export class DeploymentAudit {
  constructor(private pool: Pool) {}
  async log(rec: any) {
    const q = `INSERT INTO deployment_audit
      (environment, actor, action, version, pr_numbers, checks, decision, notes)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`;
    const v = [rec.environment, rec.actor, rec.action, rec.version ?? null,
      rec.pr_numbers ?? null, rec.checks ? JSON.stringify(rec.checks) : null,
      rec.decision ?? null, rec.notes ?? null];
    await this.pool.query(q, v);
  }
}
