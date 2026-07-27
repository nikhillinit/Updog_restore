-- @drift-patch
-- Reason: production truth disproved the historical 0027 assumption that
-- investment_rounds already existed via db:push. Manifest 15 requires the
-- canonical table before 0041 can add participation lineage. This patch
-- mirrors only the investment_rounds portion of journal migration 0027.
-- It is additive, data-free, and replay-safe.

CREATE TABLE IF NOT EXISTS "investment_rounds" (
  "id" serial PRIMARY KEY,
  "investment_id" integer NOT NULL,
  "fund_id" integer NOT NULL REFERENCES "funds"("id") ON UPDATE restrict ON DELETE restrict,
  "round_name" varchar(120) NOT NULL,
  "security_type" varchar(32) NOT NULL,
  "round_date" date NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "investment_amount" numeric(20,6) NOT NULL,
  "round_size" numeric(20,6),
  "pre_money_valuation" numeric(20,6),
  "idempotency_key" varchar(255) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "supersedes_round_id" integer REFERENCES "investment_rounds"("id") ON DELETE restrict,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "investment_rounds_security_type_check"
    CHECK ("security_type" IN ('equity', 'convertible_note', 'safe', 'warrant', 'other')),
  CONSTRAINT "investment_rounds_amount_positive"
    CHECK ("investment_amount" > 0),
  CONSTRAINT "investment_rounds_investment_fund_fk"
    FOREIGN KEY ("investment_id", "fund_id")
    REFERENCES "investments"("id", "fund_id")
    ON UPDATE restrict
    ON DELETE restrict,
  CONSTRAINT "investment_rounds_fund_idem_key"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "investment_rounds_id_fund_uq"
    UNIQUE ("id", "fund_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "investment_rounds_fund_investment_idx"
  ON "investment_rounds" ("fund_id", "investment_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "investment_rounds_investment_round_date_idx"
  ON "investment_rounds" ("investment_id", "round_date" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "investment_rounds_fund_round_order_idx"
  ON "investment_rounds" ("fund_id", "investment_id", "round_date", "created_at", "id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "investment_rounds_supersedes_uq"
  ON "investment_rounds" ("supersedes_round_id")
  WHERE "supersedes_round_id" IS NOT NULL;
