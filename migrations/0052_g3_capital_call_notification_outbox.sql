-- @drift-patch
-- Reason: F_1.2.5 Phase 2 schema layer adds durable capital-call transition
-- and reminder notifications with replay-safe delivery state.
-- Additive and replay-safe. Drizzle owns the surrounding transaction.

CREATE TABLE IF NOT EXISTS "capital_call_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capital_call_id" uuid NOT NULL,
  "lp_id" integer NOT NULL,
  "transition_kind" varchar(32) NOT NULL,
  "due_date_bucket" date NOT NULL,
  "notification_type" varchar(30) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "related_entity_type" varchar(30),
  "related_entity_id" uuid,
  "action_url" varchar(500),
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "capital_call_notification_outbox_capital_call_id_fk"
    FOREIGN KEY ("capital_call_id") REFERENCES "lp_capital_calls"("id") ON DELETE cascade,
  CONSTRAINT "capital_call_notification_outbox_lp_id_fk"
    FOREIGN KEY ("lp_id") REFERENCES "limited_partners"("id") ON DELETE cascade,
  CONSTRAINT "capital_call_notification_outbox_dedupe_unique"
    UNIQUE ("capital_call_id", "transition_kind", "due_date_bucket"),
  CONSTRAINT "capital_call_notification_outbox_status_check"
    CHECK ("status" IN ('pending', 'processing', 'delivered', 'exhausted')),
  CONSTRAINT "capital_call_notification_outbox_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "capital_call_notification_outbox_transition_kind_check"
    CHECK ("transition_kind" IN ('transition', 'reminder'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "capital_call_notification_outbox_pending_claim_idx"
  ON "capital_call_notification_outbox" ("next_attempt_at", "created_at")
  WHERE "status" = 'pending';
