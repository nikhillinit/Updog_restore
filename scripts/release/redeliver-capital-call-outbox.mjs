import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRedeliveryArgs(args) {
  const ids = [];
  let apply = false;
  let all = false;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg.startsWith('--id=')) {
      ids.push(arg.slice('--id='.length));
      continue;
    }
    if (arg.startsWith('--ids=')) {
      ids.push(...arg.slice('--ids='.length).split(','));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
  if (normalizedIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Every outbox id must be a valid UUID');
  }
  if (all && normalizedIds.length > 0) {
    throw new Error('--all cannot be combined with --id/--ids');
  }
  if (apply && !all && normalizedIds.length === 0) {
    throw new Error('Apply mode requires --id/--ids or explicit --all');
  }

  return { apply, all, ids: normalizedIds };
}

export function buildRedeliveryPlan(rows) {
  return rows.map((row) => ({
    id: row.id,
    status: 'exhausted',
    nextStatus: 'pending',
    attemptCount: 0,
    nextAttemptAt: 'clock_timestamp()',
  }));
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

async function main() {
  const options = parseRedeliveryArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl === 'memory://') {
    throw new Error('DATABASE_URL is required; refusing to run against memory://');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const selector = options.all
      ? { text: `SELECT id FROM capital_call_notification_outbox WHERE status = 'exhausted' ORDER BY created_at`, values: [] }
      : {
          text: `SELECT id FROM capital_call_notification_outbox WHERE status = 'exhausted' AND id = ANY($1::uuid[]) ORDER BY created_at`,
          values: [options.ids],
        };
    const selected = await pool.query(selector.text, selector.values);
    const plan = buildRedeliveryPlan(selected.rows);

    if (!options.apply) {
      console.log(JSON.stringify({ mode: 'dry-run', selected: plan.length, rows: plan }, null, 2));
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const update = options.all
        ? await client.query(`
            UPDATE capital_call_notification_outbox
            SET status = 'pending', attempt_count = 0, next_attempt_at = clock_timestamp(),
                last_attempt_at = NULL, last_error = NULL, updated_at = clock_timestamp()
            WHERE status = 'exhausted'
            RETURNING id
          `)
        : await client.query(
            `
              UPDATE capital_call_notification_outbox
              SET status = 'pending', attempt_count = 0, next_attempt_at = clock_timestamp(),
                  last_attempt_at = NULL, last_error = NULL, updated_at = clock_timestamp()
              WHERE status = 'exhausted' AND id = ANY($1::uuid[])
              RETURNING id
            `,
            [options.ids]
          );
      await client.query('COMMIT');
      console.log(JSON.stringify({ mode: 'apply', reset: update.rowCount ?? 0, ids: update.rows.map((row) => row.id) }, null, 2));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (isDirectEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
