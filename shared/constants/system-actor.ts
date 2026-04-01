/**
 * Reserved system actor for automation paths (baseline auto-creation, alert evaluation).
 * Must pass positiveInt() validation (z.number().min(1).int()).
 * Seeded in migrations (004_seed_system_actor.sql); must never be used for interactive login.
 *
 * ID 999999 is chosen to avoid collisions with normal auto-increment user IDs.
 */
export const SYSTEM_ACTOR_ID = 999999;
export const SYSTEM_ACTOR_USERNAME = 'system';
