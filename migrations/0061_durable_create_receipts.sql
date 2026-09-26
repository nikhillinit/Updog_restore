-- @drift-patch
-- Reason: Persist durable company and deal create receipts in the request transaction.
ALTER TABLE "portfoliocompanies"
  ADD COLUMN IF NOT EXISTS "create_idempotency_key" varchar(128);
--> statement-breakpoint
ALTER TABLE "portfoliocompanies"
  ADD COLUMN IF NOT EXISTS "create_request_hash" varchar(64);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.portfoliocompanies'::regclass
      AND conname = 'portfoliocompanies_create_receipt_pair_check'
  ) THEN
    ALTER TABLE "portfoliocompanies"
      ADD CONSTRAINT "portfoliocompanies_create_receipt_pair_check"
      CHECK (("create_idempotency_key" IS NULL) = ("create_request_hash" IS NULL));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.portfoliocompanies'::regclass
      AND conname = 'portfoliocompanies_create_request_hash_check'
  ) THEN
    ALTER TABLE "portfoliocompanies"
      ADD CONSTRAINT "portfoliocompanies_create_request_hash_check"
      CHECK ("create_request_hash" IS NULL OR "create_request_hash" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfoliocompanies_fund_create_idempotency_unique"
  ON "portfoliocompanies" USING btree ("fund_id", "create_idempotency_key")
  WHERE "create_idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_pipeline_commands" (
  "id" serial PRIMARY KEY,
  "fund_id" integer NOT NULL CONSTRAINT "deal_pipeline_commands_fund_id_funds_id_fk"
    REFERENCES "funds" ("id") ON DELETE CASCADE,
  "operation" text NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "response_body" jsonb NOT NULL,
  "created_by" integer CONSTRAINT "deal_pipeline_commands_created_by_users_id_fk"
    REFERENCES "users" ("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deal_pipeline_commands_operation_check"
    CHECK ("operation" IN ('deal_create', 'deal_import')),
  CONSTRAINT "deal_pipeline_commands_key_nonempty_check"
    CHECK (length("idempotency_key") > 0),
  CONSTRAINT "deal_pipeline_commands_request_hash_check"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "deal_pipeline_commands_response_object_check"
    CHECK (jsonb_typeof("response_body") = 'object'),
  CONSTRAINT "deal_pipeline_commands_scope_unique"
    UNIQUE ("fund_id", "operation", "idempotency_key")
);
--> statement-breakpoint
-- Guarded create (0060 precedent), not DROP TRIGGER: keeps the migration additive-safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.deal_pipeline_commands'::regclass
      AND tgname = 'deal_pipeline_commands_forbid_update_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER "deal_pipeline_commands_forbid_update_trigger"
      BEFORE UPDATE ON "deal_pipeline_commands"
      FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
  END IF;
END $$;
