-- Seed the reserved system actor used by automation paths.
-- SYSTEM_ACTOR_ID = 999999 (shared/constants/system-actor.ts).
-- The password value is not a valid bcrypt hash; it prevents interactive login.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE username = 'system'
      AND id <> 999999
  ) THEN
    RAISE EXCEPTION 'Username "system" is already reserved by a different user id';
  END IF;
END
$$;

INSERT INTO users (id, username, password)
VALUES (999999, 'system', 'SYSTEM_ACTOR_NO_LOGIN_00000000')
ON CONFLICT (id) DO UPDATE
SET
  username = EXCLUDED.username,
  password = EXCLUDED.password;

-- Reset sequence so normal auto-increment stays below the reserved range.
SELECT setval(
  pg_get_serial_sequence('users', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM users WHERE id < 999999), 1), 1),
  true
);
