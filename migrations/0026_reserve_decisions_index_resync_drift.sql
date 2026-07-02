-- @drift-patch
-- Reason: resync journal to shared/schema; 0001_certain_miracleman DROP COLUMN + ADD COLUMN of reserve_decisions fund_id/company_id implicitly dropped the two 0000_quick_vivisector indexes that referenced them (ux_reserve_unique, idx_reserve_fund_company) and no later journal migration recreated them, while the Drizzle shape push still emits both (shared/schema.ts reserveDecisions). Statements mirror 0000 verbatim so DB-A catalog definitions converge with DB-B by name AND shape. Additive (CREATE-only); no prod apply — prod (built via db:push) already has both.
-- IF NOT EXISTS: drift patches are the narrow-apply set for the gated operator path against
-- db:push-built databases that already carry both indexes; unguarded CREATE would abort there.
-- Same-name/wrong-shape divergence stays the job of the s7 comparator and the operator re-audit.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_reserve_unique" ON "reserve_decisions" USING btree ("company_id","period_start","period_end","engine_type","engine_version");
CREATE INDEX IF NOT EXISTS "idx_reserve_fund_company" ON "reserve_decisions" USING btree ("fund_id","company_id");
