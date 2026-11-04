-- @drift-patch
-- Reason: Store immutable, fund-scoped main-fund declarations and source ownership.
CREATE TABLE IF NOT EXISTS vehicle_onboarding_commands (
  id serial PRIMARY KEY,
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES users(id),
  vehicle_id integer NOT NULL,
  operation text NOT NULL,
  contract_version text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash varchar(64) NOT NULL,
  vehicle_slug varchar(64) NOT NULL,
  name varchar(128) NOT NULL,
  vehicle_type varchar(16) NOT NULL,
  currency varchar(3) NOT NULL,
  status varchar(16) NOT NULL,
  committed_capital numeric(20,6) NOT NULL,
  source_artifact_id integer NOT NULL,
  source_artifact_sha256 varchar(64) NOT NULL,
  source_locator varchar(1024) NOT NULL,
  attestation_version text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  CONSTRAINT vehicle_onboarding_commands_identity_unique UNIQUE(fund_id, operation, idempotency_key),
  CONSTRAINT vehicle_onboarding_commands_artifact_unique UNIQUE(source_artifact_id),
  CONSTRAINT vehicle_onboarding_commands_vehicle_fund_fk FOREIGN KEY(vehicle_id, fund_id)
    REFERENCES vehicles(id, fund_id),
  CONSTRAINT vehicle_onboarding_commands_source_fund_fk FOREIGN KEY(source_artifact_id, fund_id)
    REFERENCES source_artifacts(id, fund_id),
  CONSTRAINT vehicle_onboarding_commands_contract_check CHECK (
    operation = 'ensure_main_fund' AND contract_version = 'vehicle-onboarding/1.0.0'
    AND attestation_version = 'source-supports-commitment/1.0.0'
  ),
  CONSTRAINT vehicle_onboarding_commands_identity_check CHECK (
    vehicle_type = 'main_fund' AND currency = 'USD' AND status = 'active'
    AND vehicle_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length(btrim(name)) > 0 AND length(btrim(source_locator)) > 0
  ),
  CONSTRAINT vehicle_onboarding_commands_commitment_check CHECK (
    committed_capital >= 0 AND committed_capital = round(committed_capital, 2)
  ),
  CONSTRAINT vehicle_onboarding_commands_hash_check CHECK (
    request_hash ~ '^[a-f0-9]{64}$' AND source_artifact_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT vehicle_onboarding_commands_response_check CHECK (
    ((outcome = 'created' AND response_status = 201) OR (outcome = 'existing' AND response_status = 200))
    AND jsonb_typeof(response_body) = 'object'
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vehicle_onboarding_commands_fund_idx ON vehicle_onboarding_commands(fund_id);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vehicle_onboarding_commands'::regclass
      AND tgname = 'vehicle_onboarding_commands_forbid_update_trigger' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER vehicle_onboarding_commands_forbid_update_trigger
      BEFORE UPDATE ON vehicle_onboarding_commands
      FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
  END IF;
END $$;
--> statement-breakpoint
-- The V1 capital-envelope service is byte-frozen. Enforce this new source
-- boundary at insertion without changing that certified implementation.
CREATE OR REPLACE FUNCTION public.vehicle_onboarding_refuse_envelope_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
BEGIN
  -- An uncommitted artifact cannot yet prove non-ownership. Refuse before a
  -- later FK wait could admit a guessed source ID after onboarding commits.
  IF NOT EXISTS (
    SELECT 1 FROM public.source_artifacts
    WHERE id = NEW.source_artifact_id AND fund_id = NEW.fund_id
  ) THEN
    RAISE EXCEPTION 'Source artifact is not visible in the requested fund'
      USING ERRCODE = '23503',
        CONSTRAINT = 'internal_capital_envelope_versions_source_artifact_fund_fk';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vehicle_onboarding_commands
    WHERE fund_id = NEW.fund_id AND source_artifact_id = NEW.source_artifact_id
  ) THEN
    RAISE EXCEPTION 'Vehicle declaration evidence cannot be reused as another financial source'
      USING ERRCODE = '23514', CONSTRAINT = 'vehicle_onboarding_envelope_source_exclusive';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.vehicle_onboarding_refuse_envelope_source() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.internal_capital_envelope_versions'::regclass
      AND tgname = 'vehicle_onboarding_refuse_envelope_source_trigger' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER vehicle_onboarding_refuse_envelope_source_trigger
      BEFORE INSERT ON public.internal_capital_envelope_versions
      FOR EACH ROW EXECUTE FUNCTION public.vehicle_onboarding_refuse_envelope_source();
  END IF;
END $$;
--> statement-breakpoint
-- Privileged owner maintenance retains its existing bypass. Ordinary roles are
-- fund scoped, may append only as a live granted administrator, and cannot edit.
ALTER TABLE vehicle_onboarding_commands ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = 'public.vehicle_onboarding_commands'::regclass
      AND polname = 'vehicle_onboarding_commands_select_policy'
  ) THEN
    CREATE POLICY vehicle_onboarding_commands_select_policy ON vehicle_onboarding_commands
      FOR SELECT USING (fund_id = NULLIF(current_setting('app.current_fund', true), '')::integer);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = 'public.vehicle_onboarding_commands'::regclass
      AND polname = 'vehicle_onboarding_commands_insert_policy'
  ) THEN
    CREATE POLICY vehicle_onboarding_commands_insert_policy ON vehicle_onboarding_commands
      FOR INSERT WITH CHECK (
        fund_id = NULLIF(current_setting('app.current_fund', true), '')::integer
        AND actor_id = NULLIF(current_setting('app.current_user', true), '')::integer
        AND current_setting('app.current_role', true) = 'admin'
        AND EXISTS (
          SELECT 1 FROM users u JOIN user_fund_grants g ON g.user_id = u.id
          WHERE u.id = vehicle_onboarding_commands.actor_id
            AND g.fund_id = vehicle_onboarding_commands.fund_id
            AND u.is_active AND u.role = 'admin' AND NOT u.is_release_canary_principal
        )
      );
  END IF;
END $$;
