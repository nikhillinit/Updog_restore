-- @drift-patch
-- Operating-object tasks drift patch for the production makeApp surface.
-- Mirrors shared/schema/operating-objects.ts and replaces the legacy
-- server/migrations/20260616_operating_object_tasks_v1.up.sql path for PR-1.

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "owner_id" integer,
  "due_date" date,
  "description" text,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "tasks_status_check" CHECK ("status" IN ('open', 'in_progress', 'done')),
  CONSTRAINT "tasks_title_nonempty_check" CHECK (length(btrim("title")) > 0)
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.tasks'::regclass
         AND conname = 'tasks_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.tasks'::regclass
         AND conname = 'tasks_owner_id_users_id_fk'
     ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_owner_id_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.tasks'::regclass
         AND conname = 'tasks_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_fund_created"
  ON "tasks" USING btree ("fund_id", "created_at" DESC);
