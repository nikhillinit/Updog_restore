-- @drift-patch
-- Reason: Task 11 Option B - durable source-basis relief receipt for full position conversions.

DO $$
DECLARE
  orphan_conversion_ids text;
BEGIN
  IF to_regclass('public.position_events') IS NOT NULL THEN
    IF to_regclass('public.position_event_source_basis_reliefs') IS NULL THEN
      SELECT string_agg(id::text, ', ' ORDER BY id)
      INTO orphan_conversion_ids
      FROM "position_events"
      WHERE "event_type" = 'conversion';
    ELSE
      SELECT string_agg(pe.id::text, ', ' ORDER BY pe.id)
      INTO orphan_conversion_ids
      FROM "position_events" pe
      LEFT JOIN "position_event_source_basis_reliefs" pesbr
        ON pesbr."conversion_position_event_id" = pe."id"
      WHERE pe."event_type" = 'conversion'
        AND pesbr."conversion_position_event_id" IS NULL;
    END IF;

    IF orphan_conversion_ids IS NOT NULL THEN
      RAISE EXCEPTION
        'position source-basis relief preflight failed: orphan conversion event ids=%',
        orphan_conversion_ids;
    END IF;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'position_events_source_basis_anchor_unique'
      AND conrelid = 'public.position_events'::regclass
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_source_basis_anchor_unique"
      UNIQUE (
        "id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "event_type",
        "vehicle_participation_id",
        "cost_basis_delta"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'position_events_conversion_lineage_unique'
      AND conrelid = 'public.position_events'::regclass
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_conversion_lineage_unique"
      UNIQUE (
        "id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "event_type",
        "vehicle_participation_id",
        "source_participation_version",
        "resulting_participation_id",
        "resulting_participation_version",
        "source_tranche_version",
        "resulting_tranche_version"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'position_events_conversion_zero_basis_check'
      AND conrelid = 'public.position_events'::regclass
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_conversion_zero_basis_check"
      CHECK ("event_type" <> 'conversion' OR ("cost_basis_delta" = 0 AND "proceeds" = 0));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'position_events_conversion_distinct_participations_check'
      AND conrelid = 'public.position_events'::regclass
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_conversion_distinct_participations_check"
      CHECK ("event_type" <> 'conversion' OR "vehicle_participation_id" <> "resulting_participation_id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vfp_conversion_source_lineage_unique'
      AND conrelid = 'public.vehicle_financing_participations'::regclass
  ) THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_conversion_source_lineage_unique"
      UNIQUE (
        "id",
        "fund_id",
        "vehicle_id",
        "version",
        "financing_event_id",
        "financing_tranche_id",
        "economic_origin"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vfp_conversion_result_basis_unique'
      AND conrelid = 'public.vehicle_financing_participations'::regclass
  ) THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_conversion_result_basis_unique"
      UNIQUE (
        "id",
        "fund_id",
        "vehicle_id",
        "version",
        "financing_event_id",
        "financing_tranche_id",
        "economic_origin",
        "participation_amount"
      );
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financing_events_conversion_identity_unique'
      AND conrelid = 'public.financing_events'::regclass
  ) THEN
    ALTER TABLE "financing_events"
      ADD CONSTRAINT "financing_events_conversion_identity_unique"
      UNIQUE ("id", "fund_id", "company_identity_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financing_tranches_conversion_lineage_unique'
      AND conrelid = 'public.financing_tranches'::regclass
  ) THEN
    ALTER TABLE "financing_tranches"
      ADD CONSTRAINT "financing_tranches_conversion_lineage_unique"
      UNIQUE ("id", "fund_id", "financing_event_id", "version");
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "position_event_source_basis_reliefs" (
  "conversion_position_event_id" integer NOT NULL,
  "source_acquisition_position_event_id" integer NOT NULL,
  "capitalized_adjustment_position_event_id" integer,
  "fund_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "source_participation_id" integer NOT NULL,
  "source_participation_version" integer NOT NULL,
  "source_financing_event_id" integer NOT NULL,
  "source_financing_tranche_id" integer NOT NULL,
  "resulting_participation_id" integer NOT NULL,
  "resulting_participation_version" integer NOT NULL,
  "resulting_financing_event_id" integer NOT NULL,
  "resulting_financing_tranche_id" integer NOT NULL,
  "source_tranche_version" integer NOT NULL,
  "resulting_tranche_version" integer NOT NULL,
  "source_acquisition_cost_basis" numeric(20,6) NOT NULL,
  "capitalized_adjustment_cost_basis" numeric(20,6) DEFAULT 0 NOT NULL,
  "relieved_cost_basis" numeric(20,6) NOT NULL,
  "source_event_type" varchar(32) DEFAULT 'acquisition' NOT NULL,
  "capitalized_adjustment_event_type" varchar(32),
  "conversion_event_type" varchar(32) DEFAULT 'conversion' NOT NULL,
  "source_economic_origin" varchar(32) DEFAULT 'cash_investment' NOT NULL,
  "resulting_economic_origin" varchar(32) DEFAULT 'conversion_result' NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'position_event_source_basis_reliefs_pkey'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "position_event_source_basis_reliefs_pkey"
      PRIMARY KEY ("conversion_position_event_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_acq_unique'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_acq_unique"
      UNIQUE ("source_acquisition_position_event_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_resulting_participation_unique'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_resulting_participation_unique"
      UNIQUE ("resulting_participation_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_acq_event_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_acq_event_fk"
      FOREIGN KEY (
        "source_acquisition_position_event_id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "source_event_type",
        "source_participation_id",
        "source_acquisition_cost_basis"
      )
      REFERENCES "public"."position_events" (
        "id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "event_type",
        "vehicle_participation_id",
        "cost_basis_delta"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_capitalized_adj_event_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_capitalized_adj_event_fk"
      FOREIGN KEY (
        "capitalized_adjustment_position_event_id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "capitalized_adjustment_event_type",
        "source_participation_id",
        "capitalized_adjustment_cost_basis"
      )
      REFERENCES "public"."position_events" (
        "id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "event_type",
        "vehicle_participation_id",
        "cost_basis_delta"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_conversion_event_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_conversion_event_fk"
      FOREIGN KEY (
        "conversion_position_event_id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "conversion_event_type",
        "source_participation_id",
        "source_participation_version",
        "resulting_participation_id",
        "resulting_participation_version",
        "source_tranche_version",
        "resulting_tranche_version"
      )
      REFERENCES "public"."position_events" (
        "id",
        "fund_id",
        "vehicle_id",
        "company_identity_id",
        "event_type",
        "vehicle_participation_id",
        "source_participation_version",
        "resulting_participation_id",
        "resulting_participation_version",
        "source_tranche_version",
        "resulting_tranche_version"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_participation_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_participation_fk"
      FOREIGN KEY (
        "source_participation_id",
        "fund_id",
        "vehicle_id",
        "source_participation_version",
        "source_financing_event_id",
        "source_financing_tranche_id",
        "source_economic_origin"
      )
      REFERENCES "public"."vehicle_financing_participations" (
        "id",
        "fund_id",
        "vehicle_id",
        "version",
        "financing_event_id",
        "financing_tranche_id",
        "economic_origin"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_resulting_participation_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_resulting_participation_fk"
      FOREIGN KEY (
        "resulting_participation_id",
        "fund_id",
        "vehicle_id",
        "resulting_participation_version",
        "resulting_financing_event_id",
        "resulting_financing_tranche_id",
        "resulting_economic_origin",
        "relieved_cost_basis"
      )
      REFERENCES "public"."vehicle_financing_participations" (
        "id",
        "fund_id",
        "vehicle_id",
        "version",
        "financing_event_id",
        "financing_tranche_id",
        "economic_origin",
        "participation_amount"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_tranche_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_tranche_fk"
      FOREIGN KEY (
        "source_financing_tranche_id",
        "fund_id",
        "source_financing_event_id",
        "source_tranche_version"
      )
      REFERENCES "public"."financing_tranches" (
        "id",
        "fund_id",
        "financing_event_id",
        "version"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_resulting_tranche_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_resulting_tranche_fk"
      FOREIGN KEY (
        "resulting_financing_tranche_id",
        "fund_id",
        "resulting_financing_event_id",
        "resulting_tranche_version"
      )
      REFERENCES "public"."financing_tranches" (
        "id",
        "fund_id",
        "financing_event_id",
        "version"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_financing_event_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_financing_event_fk"
      FOREIGN KEY ("source_financing_event_id", "fund_id", "company_identity_id")
      REFERENCES "public"."financing_events" ("id", "fund_id", "company_identity_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_resulting_financing_event_fk'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_resulting_financing_event_fk"
      FOREIGN KEY ("resulting_financing_event_id", "fund_id", "company_identity_id")
      REFERENCES "public"."financing_events" ("id", "fund_id", "company_identity_id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_event_type_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_event_type_check"
      CHECK ("source_event_type" = 'acquisition');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_conversion_event_type_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_conversion_event_type_check"
      CHECK ("conversion_event_type" = 'conversion');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_source_origin_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_source_origin_check"
      CHECK ("source_economic_origin" = 'cash_investment');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_resulting_origin_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_resulting_origin_check"
      CHECK ("resulting_economic_origin" = 'conversion_result');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pesbr_distinct_participations_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_distinct_participations_check"
      CHECK ("source_participation_id" <> "resulting_participation_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_distinct_events_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_distinct_events_check"
      CHECK ("conversion_position_event_id" <> "source_acquisition_position_event_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_positive_basis_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_positive_basis_check"
      CHECK (
        "source_acquisition_cost_basis" > 0
        AND "capitalized_adjustment_cost_basis" >= 0
        AND "relieved_cost_basis" > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_conservation_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_conservation_check"
      CHECK ("relieved_cost_basis" = "source_acquisition_cost_basis" + "capitalized_adjustment_cost_basis");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pesbr_adjustment_presence_check'
      AND conrelid = 'public.position_event_source_basis_reliefs'::regclass
  ) THEN
    ALTER TABLE "position_event_source_basis_reliefs"
      ADD CONSTRAINT "pesbr_adjustment_presence_check"
      CHECK (
        (
          "capitalized_adjustment_position_event_id" IS NULL
          AND "capitalized_adjustment_event_type" IS NULL
          AND "capitalized_adjustment_cost_basis" = 0
        )
        OR (
          "capitalized_adjustment_position_event_id" IS NOT NULL
          AND "capitalized_adjustment_event_type" IS NOT NULL
          AND "capitalized_adjustment_event_type" = 'adjustment'
          AND "capitalized_adjustment_cost_basis" > 0
          AND "capitalized_adjustment_position_event_id" <> "source_acquisition_position_event_id"
          AND "capitalized_adjustment_position_event_id" <> "conversion_position_event_id"
        )
      );
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "pesbr_capitalized_adj_unique"
  ON "position_event_source_basis_reliefs" ("capitalized_adjustment_position_event_id")
  WHERE "capitalized_adjustment_position_event_id" IS NOT NULL;
