import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWebSocket } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import { GenericContainer, Network, Wait, type StartedTestContainer } from 'testcontainers';
import WebSocket from 'ws';

const POSTGRES_IMAGE = 'postgres:16-alpine';
const HTTP_PROXY_IMAGE = 'ghcr.io/timowilhelm/local-neon-http-proxy:main';
const WS_PROXY_IMAGE = 'ghcr.io/neondatabase/wsproxy:latest';
const POSTGRES_ALIAS = 'neon-postgres';
const DATABASE_URL = `postgres://postgres:postgres@db.localtest.me:5432/main`;

export type NeonHttpDatabase = ReturnType<typeof drizzleHttp>;
export type NeonWebSocketDatabase = ReturnType<typeof drizzleWebSocket>;

export interface NeonLane {
  http: NeonHttpDatabase;
  websocket: NeonWebSocketDatabase;
  cleanup: () => Promise<void>;
}

export async function initializeNeonLaneSchema(database: NeonHttpDatabase): Promise<void> {
  const statements = [
    `DROP TABLE IF EXISTS evidence_records, narrative_runs, lp_metric_runs,
      planning_fmv_override_requests, fund_moic_input_update_requests,
      fund_calculation_mode_requests, fund_calculation_modes, current_forecast_references,
      fund_events, portfoliocompanies, users CASCADE`,
    `CREATE TABLE users (id serial PRIMARY KEY)`,
    `INSERT INTO users (id) VALUES (1)`,
    `CREATE TABLE current_forecast_references (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      calculation_key text NOT NULL DEFAULT 'current_forecast',
      fund_snapshot_id integer NOT NULL,
      current_plan_version_id integer NOT NULL,
      financial_facts_snapshot_id integer NOT NULL,
      input_hash text NOT NULL,
      result_hash text NOT NULL,
      assumptions_hash text NOT NULL,
      engine_version text NOT NULL,
      methodology_version text NOT NULL,
      candidate boolean NOT NULL DEFAULT true,
      superseded_by_reference_id integer,
      reason text,
      created_by integer,
      idempotency_key varchar(128) NOT NULL,
      request_hash varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (fund_id, idempotency_key)
    )`,
    `CREATE TABLE fund_calculation_modes (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      calculation_key text NOT NULL,
      configured_mode varchar(16) NOT NULL DEFAULT 'off',
      kill_switch_active boolean NOT NULL DEFAULT false,
      shadow_started_at timestamptz,
      last_reconciliation_run_id integer,
      last_moic_source_input_hash text,
      last_candidate_output_hash text,
      h9_moic_source_input_hash text,
      h9_round_evidence_input_hash text,
      h9_round_evidence_assumptions_hash text,
      h9_fingerprint_hash text,
      h9_policy_version text,
      h9_actionability_status varchar(24),
      version integer NOT NULL DEFAULT 1,
      updated_by integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      activated_at timestamptz,
      cutover_reference_id integer,
      UNIQUE (fund_id, calculation_key)
    )`,
    `CREATE TABLE fund_calculation_mode_requests (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      calculation_key text NOT NULL,
      idempotency_key text NOT NULL,
      request_hash text NOT NULL,
      response_status integer,
      response_body jsonb,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      status varchar(16) NOT NULL DEFAULT 'pending',
      UNIQUE (fund_id, calculation_key, idempotency_key)
    )`,
    `CREATE TABLE portfoliocompanies (
      id serial PRIMARY KEY,
      fund_id integer,
      name text NOT NULL,
      sector text NOT NULL,
      stage text NOT NULL,
      investment_amount numeric(15,2) NOT NULL,
      current_valuation numeric(15,2),
      status text NOT NULL DEFAULT 'active',
      exit_moic_bps integer,
      exit_probability numeric(7,6),
      allocation_version integer NOT NULL DEFAULT 1,
      last_allocation_at timestamptz
    )`,
    `CREATE TABLE fund_events (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      event_type varchar(50) NOT NULL,
      payload jsonb,
      user_id integer,
      correlation_id varchar(36),
      event_time timestamp NOT NULL,
      operation varchar(50),
      entity_type varchar(50),
      metadata jsonb,
      created_at timestamp DEFAULT now()
    )`,
    `CREATE TABLE fund_moic_input_update_requests (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      company_id integer NOT NULL,
      idempotency_key text NOT NULL,
      request_hash text NOT NULL,
      response_status integer,
      response_body jsonb,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      status varchar(16) NOT NULL DEFAULT 'pending',
      UNIQUE (fund_id, company_id, idempotency_key)
    )`,
    `CREATE TABLE lp_metric_runs (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      vehicle_id integer,
      as_of_date date NOT NULL,
      run_type varchar(32) NOT NULL,
      perspective varchar(16) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'draft',
      inputs_hash varchar(128) NOT NULL,
      source_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_mark_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      results_json jsonb NOT NULL,
      diagnostics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      methodology_version varchar(64) NOT NULL,
      calculation_version varchar(64) NOT NULL,
      generated_by integer,
      approved_by integer,
      approved_at timestamptz,
      locked_by integer,
      locked_at timestamptz,
      exported_at timestamptz,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE narrative_runs (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      metric_run_id integer NOT NULL,
      as_of_date date NOT NULL,
      narrative_type varchar(32) NOT NULL,
      generated_text text NOT NULL,
      edited_text text,
      status varchar(32) NOT NULL DEFAULT 'draft',
      generated_by integer,
      edited_by integer,
      reviewed_by integer,
      reviewed_at timestamptz,
      approved_by integer,
      approved_at timestamptz,
      exported_at timestamptz,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`,
    `CREATE TABLE evidence_records (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      valuation_mark_id integer,
      company_id integer,
      metric_run_id integer,
      narrative_run_id integer,
      idempotency_key varchar(128),
      evidence_source varchar(64) NOT NULL,
      source_date date NOT NULL,
      received_date date,
      expiration_date date,
      confidence_level varchar(16) NOT NULL DEFAULT 'medium',
      materiality_level varchar(16) NOT NULL DEFAULT 'medium',
      confidentiality varchar(24) NOT NULL DEFAULT 'internal',
      redaction_required boolean NOT NULL DEFAULT false,
      document_hash varchar(128),
      valuation_policy_version varchar(64),
      description text,
      internal_notes text,
      lp_objection text,
      attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
      uploaded_by integer,
      approved_by integer,
      approved_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (fund_id, metric_run_id, idempotency_key)
    )`,
    `CREATE TABLE planning_fmv_override_requests (
      id serial PRIMARY KEY,
      fund_id integer NOT NULL,
      company_id integer NOT NULL,
      valuation_mark_id integer,
      idempotency_key varchar(128) NOT NULL,
      request_hash varchar(64) NOT NULL,
      source_hash varchar(128) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending',
      response_body jsonb,
      failure_code varchar(64),
      failure_message text,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (fund_id, idempotency_key)
    )`,
  ];

  for (const statement of statements) {
    await database.execute(sql.raw(statement));
  }
}

async function stopIfStarted(
  container: { stop: () => Promise<unknown> } | undefined
): Promise<void> {
  if (container) {
    await container.stop();
  }
}

export async function startNeonLane(): Promise<NeonLane> {
  const network = await new Network().start();
  let postgres: StartedTestContainer | undefined;
  let httpProxy: StartedTestContainer | undefined;
  let websocketProxy: StartedTestContainer | undefined;
  let websocketPool: Pool | undefined;

  try {
    postgres = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({
        POSTGRES_DB: 'main',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_USER: 'postgres',
      })
      .withExposedPorts(5432)
      .withNetwork(network)
      .withNetworkAliases(POSTGRES_ALIAS)
      .withWaitStrategy(Wait.forLogMessage(/.*database system is ready to accept connections.*/, 2))
      .withStartupTimeout(60000)
      .start();

    const postgresConnectionString = `postgres://postgres:postgres@${POSTGRES_ALIAS}:5432/main`;

    httpProxy = await new GenericContainer(HTTP_PROXY_IMAGE)
      .withEnvironment({ PG_CONNECTION_STRING: postgresConnectionString })
      .withNetwork(network)
      .withExposedPorts(4444)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(60000)
      .start();

    websocketProxy = await new GenericContainer(WS_PROXY_IMAGE)
      .withEnvironment({
        ALLOW_ADDR_REGEX: '.*',
        APPEND_PORT: ':5432',
        LOG_CONN_INFO: 'true',
        LOG_TRAFFIC: 'false',
      })
      .withNetwork(network)
      .withExposedPorts(80)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(60000)
      .start();

    const httpProxyUrl = `http://${httpProxy.getHost()}:${httpProxy.getMappedPort(4444)}/sql`;
    const websocketProxyAddress =
      `${websocketProxy.getHost()}:${websocketProxy.getMappedPort(80)}` +
      `/v1?address=${POSTGRES_ALIAS}`;

    neonConfig.fetchEndpoint = () => httpProxyUrl;
    neonConfig.poolQueryViaFetch = false;
    neonConfig.webSocketConstructor = WebSocket;
    neonConfig.useSecureWebSocket = false;
    neonConfig.forceDisablePgSSL = true;
    neonConfig.pipelineConnect = false;
    neonConfig.wsProxy = () => websocketProxyAddress;

    const httpClient = neon(DATABASE_URL);
    const http = drizzleHttp(httpClient);
    websocketPool = new Pool({ connectionString: DATABASE_URL });
    websocketPool.on('error', () => undefined);
    const websocket = drizzleWebSocket(websocketPool);

    await http.execute(sql`SELECT 1`);

    return {
      http,
      websocket,
      cleanup: async () => {
        await websocketPool?.end();
        await stopIfStarted(websocketProxy);
        await stopIfStarted(httpProxy);
        await stopIfStarted(postgres);
        await network.stop();
      },
    };
  } catch (error) {
    await websocketPool?.end().catch(() => undefined);
    await stopIfStarted(websocketProxy).catch(() => undefined);
    await stopIfStarted(httpProxy).catch(() => undefined);
    await stopIfStarted(postgres).catch(() => undefined);
    await network.stop().catch(() => undefined);
    throw error;
  }
}
