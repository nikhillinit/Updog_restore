ALTER TABLE "funds" ADD COLUMN IF NOT EXISTS "base_currency" varchar(3) DEFAULT 'USD' NOT NULL;
