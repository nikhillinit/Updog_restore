-- @drift-patch
-- Reason: Task 3 (D3/D27/D30) — immutable financial evidence,
-- identity, and import-foundation persistence + identity backfill.

CREATE TABLE IF NOT EXISTS "source_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "source_type" text NOT NULL,
  "file_name" text,
  "media_type" text NOT NULL,
  "byte_count" integer NOT NULL,
  "payload_sha256" varchar(64) NOT NULL,
  "payload" bytea,
  "purge_after" timestamp with time zone NOT NULL,
  "retention_extended_until" timestamp with time zone,
  "retention_extension_reason" text,
  "purged_at" timestamp with time zone,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "source_artifacts_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "source_artifacts_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "source_artifacts_source_type_check"
    CHECK ("source_type" IN ('csv','xlsx','structured_paste','manual')),
  CONSTRAINT "source_artifacts_payload_purged_check"
    CHECK (("payload" IS NULL AND "purged_at" IS NOT NULL)
      OR ("payload" IS NOT NULL AND "purged_at" IS NULL)),
  CONSTRAINT "source_artifacts_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "source_artifacts_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_source_artifacts_fund_created"
  ON "source_artifacts" ("fund_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_source_artifacts_purge_after"
  ON "source_artifacts" ("purge_after")
  WHERE "purged_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_mapping_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "name" text NOT NULL,
  "source_type" text NOT NULL,
  "domain" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "mappings" jsonb NOT NULL,
  "identity_semantics_hash" varchar(64) NOT NULL,
  "superseded_by_profile_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_mapping_profiles_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "import_mapping_profiles_superseded_fund_fk"
    FOREIGN KEY ("superseded_by_profile_id", "fund_id")
    REFERENCES "public"."import_mapping_profiles"("id", "fund_id"),
  CONSTRAINT "import_mapping_profiles_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "import_mapping_profiles_source_type_check"
    CHECK ("source_type" IN ('csv','xlsx','structured_paste','manual')),
  CONSTRAINT "import_mapping_profiles_domain_check"
    CHECK ("domain" IN ('ledger_event','valuation','ownership')),
  CONSTRAINT "import_mapping_profiles_version_positive_check"
    CHECK ("version" >= 1),
  CONSTRAINT "import_mapping_profiles_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "import_mapping_profiles_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "import_mapping_profiles_fund_name_version_unique"
    UNIQUE ("fund_id", "name", "version")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "import_mapping_profiles_fund_name_head_unique"
  ON "import_mapping_profiles" ("fund_id", "name")
  WHERE "superseded_by_profile_id" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "source_artifact_id" integer,
  "mapping_profile_id" integer,
  "status" text DEFAULT 'staged' NOT NULL,
  "preview_hash" varchar(64),
  "purge_after" timestamp with time zone NOT NULL,
  "retention_extended_until" timestamp with time zone,
  "retention_extension_reason" text,
  "purged_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_batches_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "import_batches_source_artifact_fund_fk"
    FOREIGN KEY ("source_artifact_id", "fund_id")
    REFERENCES "public"."source_artifacts"("id", "fund_id"),
  CONSTRAINT "import_batches_mapping_profile_fund_fk"
    FOREIGN KEY ("mapping_profile_id", "fund_id")
    REFERENCES "public"."import_mapping_profiles"("id", "fund_id"),
  CONSTRAINT "import_batches_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "import_batches_status_check"
    CHECK ("status" IN ('staged','partially_committed','committed','expired')),
  CONSTRAINT "import_batches_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "import_batches_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_batches_fund_created"
  ON "import_batches" ("fund_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_batches_purge_after"
  ON "import_batches" ("purge_after")
  WHERE "purged_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "company_identities" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "canonical_name" text NOT NULL,
  "merged_into_identity_id" integer,
  "source_portfolio_company_id" integer,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_identities_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "company_identities_merged_into_fk"
    FOREIGN KEY ("merged_into_identity_id") REFERENCES "public"."company_identities"("id"),
  CONSTRAINT "company_identities_source_portfolio_company_fk"
    FOREIGN KEY ("source_portfolio_company_id") REFERENCES "public"."portfoliocompanies"("id"),
  CONSTRAINT "company_identities_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "company_identities_no_self_merge_check"
    CHECK ("merged_into_identity_id" IS NULL OR "merged_into_identity_id" <> "id"),
  CONSTRAINT "company_identities_id_fund_unique" UNIQUE ("id", "fund_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_identities_source_pc_unique"
  ON "company_identities" ("source_portfolio_company_id")
  WHERE "source_portfolio_company_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_company_identities_fund"
  ON "company_identities" ("fund_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "company_external_identities" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "system" text NOT NULL,
  "value" text NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_external_identities_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "company_external_identities_identity_fund_fk"
    FOREIGN KEY ("company_identity_id", "fund_id")
    REFERENCES "public"."company_identities"("id", "fund_id"),
  CONSTRAINT "company_external_identities_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "company_external_identities_fund_system_value_unique"
    UNIQUE ("fund_id", "system", "value")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "portfolio_company_identity_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "portfolio_company_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "link_type" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "deactivated_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pc_identity_links_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "pc_identity_links_portfolio_company_fk"
    FOREIGN KEY ("portfolio_company_id") REFERENCES "public"."portfoliocompanies"("id"),
  CONSTRAINT "pc_identity_links_identity_fund_fk"
    FOREIGN KEY ("company_identity_id", "fund_id")
    REFERENCES "public"."company_identities"("id", "fund_id"),
  CONSTRAINT "pc_identity_links_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "pc_identity_links_link_type_check"
    CHECK ("link_type" IN ('backfill','operator_resolution','import_resolution')),
  CONSTRAINT "pc_identity_links_active_deactivated_check"
    CHECK (("active" AND "deactivated_at" IS NULL)
      OR (NOT "active" AND "deactivated_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pc_identity_links_active_company_unique"
  ON "portfolio_company_identity_links" ("portfolio_company_id")
  WHERE "active" = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "source_observations" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "import_batch_id" integer,
  "source_artifact_id" integer,
  "mapping_profile_id" integer,
  "company_identity_id" integer,
  "domain" text NOT NULL,
  "source_type" text NOT NULL,
  "effective_date" date NOT NULL,
  "normalized_payload" jsonb NOT NULL,
  "observation_hash" varchar(64) NOT NULL,
  "candidate_fingerprint" varchar(64) NOT NULL,
  "source_locator" text,
  "dependency_group_key" text,
  "status" text DEFAULT 'staged' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "source_observations_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "source_observations_import_batch_fund_fk"
    FOREIGN KEY ("import_batch_id", "fund_id")
    REFERENCES "public"."import_batches"("id", "fund_id"),
  CONSTRAINT "source_observations_source_artifact_fund_fk"
    FOREIGN KEY ("source_artifact_id", "fund_id")
    REFERENCES "public"."source_artifacts"("id", "fund_id"),
  CONSTRAINT "source_observations_mapping_profile_fund_fk"
    FOREIGN KEY ("mapping_profile_id", "fund_id")
    REFERENCES "public"."import_mapping_profiles"("id", "fund_id"),
  CONSTRAINT "source_observations_company_identity_fund_fk"
    FOREIGN KEY ("company_identity_id", "fund_id")
    REFERENCES "public"."company_identities"("id", "fund_id"),
  CONSTRAINT "source_observations_domain_check"
    CHECK ("domain" IN ('ledger_event','valuation','ownership')),
  CONSTRAINT "source_observations_source_type_check"
    CHECK ("source_type" IN ('csv','xlsx','structured_paste','manual')),
  CONSTRAINT "source_observations_status_check"
    CHECK ("status" IN ('staged','accepted','purged')),
  CONSTRAINT "source_observations_id_fund_unique" UNIQUE ("id", "fund_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_observations_fund_hash_accepted_unique"
  ON "source_observations" ("fund_id", "observation_hash")
  WHERE "status" = 'accepted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_source_observations_fund_effective_date"
  ON "source_observations" ("fund_id", "effective_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_source_observations_fund_candidate_fingerprint"
  ON "source_observations" ("fund_id", "candidate_fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_source_observations_import_batch"
  ON "source_observations" ("import_batch_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reconciliation_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "import_batch_id" integer,
  "source_observation_id" integer,
  "case_type" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "observation_hash" varchar(64),
  "candidate_fingerprint" varchar(64),
  "resolution" jsonb,
  "resolved_by" integer,
  "resolved_at" timestamp with time zone,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reconciliation_cases_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "reconciliation_cases_import_batch_fund_fk"
    FOREIGN KEY ("import_batch_id", "fund_id")
    REFERENCES "public"."import_batches"("id", "fund_id"),
  CONSTRAINT "reconciliation_cases_source_observation_fund_fk"
    FOREIGN KEY ("source_observation_id", "fund_id")
    REFERENCES "public"."source_observations"("id", "fund_id"),
  CONSTRAINT "reconciliation_cases_resolved_by_fk"
    FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "reconciliation_cases_case_type_check"
    CHECK ("case_type" IN ('identity_resolution','observation_match')),
  CONSTRAINT "reconciliation_cases_status_check"
    CHECK ("status" IN ('open','resolved','expired_unresolved')),
  CONSTRAINT "reconciliation_cases_resolved_fields_check"
    CHECK (("status" = 'resolved'
        AND "resolution" IS NOT NULL
        AND "resolved_at" IS NOT NULL)
      OR ("status" <> 'resolved'
        AND "resolution" IS NULL
        AND "resolved_at" IS NULL
        AND "resolved_by" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reconciliation_cases_fund_status"
  ON "reconciliation_cases" ("fund_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "working_value_selections" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "consumer" text NOT NULL,
  "company_identity_id" integer,
  "domain" text NOT NULL,
  "measure_key" text NOT NULL,
  "as_of_date" date NOT NULL,
  "selected_observation_id" integer NOT NULL,
  "is_default" boolean NOT NULL,
  "reason" text,
  "version" integer DEFAULT 1 NOT NULL,
  "superseded_by_selection_id" integer,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "working_value_selections_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "working_value_selections_observation_fund_fk"
    FOREIGN KEY ("selected_observation_id", "fund_id")
    REFERENCES "public"."source_observations"("id", "fund_id"),
  CONSTRAINT "working_value_selections_identity_fund_fk"
    FOREIGN KEY ("company_identity_id", "fund_id")
    REFERENCES "public"."company_identities"("id", "fund_id"),
  CONSTRAINT "working_value_selections_superseded_fund_fk"
    FOREIGN KEY ("superseded_by_selection_id", "fund_id")
    REFERENCES "public"."working_value_selections"("id", "fund_id"),
  CONSTRAINT "working_value_selections_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "working_value_selections_consumer_check"
    CHECK ("consumer" IN ('forecast','reserve','economics','periodic_analysis')),
  CONSTRAINT "working_value_selections_domain_check"
    CHECK ("domain" IN ('ledger_event','valuation','ownership')),
  CONSTRAINT "working_value_selections_deviation_reason_check"
    CHECK ("is_default" OR "reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "working_value_selections_scope_head_unique"
  ON "working_value_selections"
  ("fund_id", "consumer", "domain", "measure_key", "as_of_date", COALESCE("company_identity_id", 0))
  WHERE "superseded_by_selection_id" IS NULL;
--> statement-breakpoint

INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)
SELECT pc.fund_id, pc.name, pc.id FROM portfoliocompanies pc
WHERE pc.fund_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM company_identities ci WHERE ci.source_portfolio_company_id = pc.id);
--> statement-breakpoint
INSERT INTO portfolio_company_identity_links (fund_id, portfolio_company_id, company_identity_id, link_type, active)
SELECT ci.fund_id, ci.source_portfolio_company_id, ci.id, 'backfill', true
FROM company_identities ci
WHERE ci.source_portfolio_company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM portfolio_company_identity_links l
                  WHERE l.portfolio_company_id = ci.source_portfolio_company_id);
--> statement-breakpoint

-- NULL-fund rows remain unlinked by design. Derivation query:
-- SELECT count(*) FROM portfoliocompanies WHERE fund_id IS NULL
DO $$
DECLARE
  unlinked_count integer;
BEGIN
  SELECT count(*) INTO unlinked_count FROM portfoliocompanies WHERE fund_id IS NULL;
  RAISE NOTICE
    'Task 3 identity backfill skipped % portfolio companies with NULL fund_id',
    unlinked_count;
END $$;
