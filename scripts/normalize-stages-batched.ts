// scripts/normalize-stages-batched.ts
#!/usr/bin/env ts-node
import postgres from 'postgres';
import { setTimeout as sleep } from 'timers/promises';

const sql = postgres(process.env.DATABASE_URL!, { max: 8 });
const BATCH = Number(process.env.BATCH_SIZE || 5000);
const BACKOFF = Number(process.env.BACKOFF_MS || 100);

async function estimateTotal() {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM portfolio_companies`;
  const total = Number(count || 0);
  console.log(`[est] total rows: ${total}, est batches @${BATCH}: ${Math.ceil(total / BATCH)}`);
}

async function* idBatches(startId = 0) {
  let last = startId;
  for (;;) {
    const rows = await sql`
      SELECT id::int FROM portfolio_companies
      WHERE id > ${last} ORDER BY id ASC LIMIT ${BATCH}`;
    if (rows.length === 0) return;
    yield rows.map(r => r.id as number);
    last = rows.at(-1)!.id as number;
  }
}

async function processBatch(ids: number[], apply: boolean) {
  if (!apply) { console.log(`[DRY] would process ${ids.length} ids`); return; }
  await sql.begin(async trx => {
    await trx`
      UPDATE portfolio_companies pc
         SET stage = ns.canonical
      FROM LATERAL (SELECT normalize_stage(pc.stage) AS canonical) ns
      WHERE pc.id = ANY(${ids})`;
    await trx`
      INSERT INTO stage_normalization_log(table_name, action, row_count, notes)
      VALUES ('portfolio_companies','update', ${ids.length}, 'batched')`;
  });
}

async function saveCheckpoint(lastId: number, status: 'ok'|'failed', note='') {
  await sql`
    INSERT INTO stage_migration_control(singleton, last_id, status, notes)
    VALUES (1, ${lastId}, ${status}, ${note})
    ON CONFLICT (singleton)
      DO UPDATE SET last_id=EXCLUDED.last_id, status=EXCLUDED.status, notes=EXCLUDED.notes`;
}

async function run(opts: { apply: boolean; resumeFrom?: number }) {
  await estimateTotal();
  let processed = 0, batches = 0;
  for await (const ids of idBatches(opts.resumeFrom ?? 0)) {
    try {
      await processBatch(ids, opts.apply);
      processed += ids.length; batches++;
      if (batches % 10 === 0) console.log(`progress: ${processed} rows (${batches} batches)`);
      await saveCheckpoint(ids.at(-1)!, 'ok');
      await sleep(BACKOFF);
    } catch (err: any) {
      console.error(`[batch-failed]`, err?.message || err);
      await saveCheckpoint(ids[0], 'failed', String(err?.message||err));
      throw err;
    }
  }
  console.log(`DONE: ${processed} rows; apply=${opts.apply}`);
}

const apply = process.argv.includes('--apply');
const resumeIdx = process.argv.indexOf('--resume-from');
const resumeFrom = resumeIdx > -1 ? Number(process.argv[resumeIdx+1]) : undefined;

run({ apply, resumeFrom }).catch(e => { console.error(e); process.exit(1); });
