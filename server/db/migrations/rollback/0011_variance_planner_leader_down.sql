-- 0011_variance_planner_leader_down.sql
-- Rollback for 0011_variance_planner_leader.sql

BEGIN;

DROP INDEX IF EXISTS idx_variance_planner_leader_lease_expires;
DROP TABLE IF EXISTS variance_planner_leader;

COMMIT;
