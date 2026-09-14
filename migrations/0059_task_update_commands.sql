-- @drift-patch
-- Task edits commit with an immutable response receipt; creation keys stay intact.
CREATE TABLE IF NOT EXISTS "task_update_commands" (
  "id" serial PRIMARY KEY,
  "fund_id" integer NOT NULL CONSTRAINT "task_update_commands_fund_id_funds_id_fk"
    REFERENCES "funds" ("id") ON DELETE CASCADE,
  "task_id" integer NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "response_body" jsonb NOT NULL,
  "created_by" integer CONSTRAINT "task_update_commands_created_by_users_id_fk"
    REFERENCES "users" ("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "task_update_commands_task_fund_fk"
    FOREIGN KEY ("task_id", "fund_id") REFERENCES "tasks" ("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "task_update_commands_scope_unique" UNIQUE ("fund_id", "task_id", "idempotency_key"),
  CONSTRAINT "task_update_commands_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "task_update_commands_key_nonempty_check" CHECK (length("idempotency_key") > 0),
  CONSTRAINT "task_update_commands_response_identity_check" CHECK (
    jsonb_typeof("response_body") = 'object'
    AND ("response_body"->>'id') IS NOT DISTINCT FROM "task_id"::text
    AND ("response_body"->>'fundId') IS NOT DISTINCT FROM "fund_id"::text
  )
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_update_commands_forbid_update_trigger" ON "task_update_commands";
--> statement-breakpoint
CREATE TRIGGER "task_update_commands_forbid_update_trigger"
  BEFORE UPDATE ON "task_update_commands"
  FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
