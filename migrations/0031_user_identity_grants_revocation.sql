-- @drift-patch
-- Reason: add identity, explicit fund-grant, and JWT jti revocation storage to the canonical production schema without replacing existing user data.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(32) NOT NULL DEFAULT 'viewer';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_role_check'
       AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_role_check"
      CHECK ("role" IN ('admin', 'partner', 'analyst', 'operator', 'viewer', 'service'));
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_fund_grants" (
  "user_id" integer NOT NULL,
  "fund_id" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_fund_grants_pkey" PRIMARY KEY ("user_id", "fund_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_fund_grants_user_id_users_id_fk'
       AND conrelid = 'public.user_fund_grants'::regclass
  ) THEN
    ALTER TABLE "user_fund_grants"
      ADD CONSTRAINT "user_fund_grants_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_fund_grants_fund_id_funds_id_fk'
       AND conrelid = 'public.user_fund_grants'::regclass
  ) THEN
    ALTER TABLE "user_fund_grants"
      ADD CONSTRAINT "user_fund_grants_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revoked_tokens" (
  "jti" varchar(64) PRIMARY KEY,
  "user_id" integer NOT NULL,
  "revoked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "reason" varchar(32)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'revoked_tokens_user_id_users_id_fk'
       AND conrelid = 'public.revoked_tokens'::regclass
  ) THEN
    ALTER TABLE "revoked_tokens"
      ADD CONSTRAINT "revoked_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revoked_tokens_expires_at_idx"
  ON "revoked_tokens" USING btree ("expires_at");
