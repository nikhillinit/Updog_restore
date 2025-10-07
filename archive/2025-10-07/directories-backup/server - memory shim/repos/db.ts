import { FundRepo, FundMetrics } from "./interfaces";

type PgLike = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export class DbFundRepo implements FundRepo {
  constructor(private db: PgLike) {}
  async getCurrentFundId(): Promise<string | null> {
    const { rows } = await this.db.query(
      "select id from funds order by created_at desc limit 1"
    );
    return rows[0]?.id ?? null;
  }
  async getFundMetrics(fundId: string): Promise<FundMetrics | null> {
    const { rows } = await this.db.query(
      `select total_committed, total_invested, total_value, irr, moic, dpi 
       from fund_metrics where fund_id=$1 order by as_of desc limit 1`,
      [fundId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      totalCommitted: Number(r.total_committed ?? 0),
      totalInvested: Number(r.total_invested ?? 0),
      totalValue: Number(r.total_value ?? 0),
      irr: r.irr != null ? Number(r.irr) : undefined,
      moic: r.moic != null ? Number(r.moic) : undefined,
      dpi: r.dpi != null ? Number(r.dpi) : undefined,
    };
  }
}
