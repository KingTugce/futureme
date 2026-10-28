-- PROPOSAL ONLY: do not execute without the owner's explicit approval.
-- Apply once as the database owner. All objects are new; existing journal,
-- entries, replies, auth records, and their policies remain unchanged.
BEGIN;

CREATE SCHEMA futureme_private;
REVOKE ALL ON SCHEMA futureme_private FROM PUBLIC, anon, authenticated;

CREATE TABLE futureme_private.ai_usage_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  per_user_minute integer NOT NULL DEFAULT 3 CHECK (per_user_minute BETWEEN 1 AND 3),
  per_user_day integer NOT NULL DEFAULT 20 CHECK (per_user_day BETWEEN 1 AND 20),
  global_day integer NOT NULL DEFAULT 200 CHECK (global_day BETWEEN 1 AND 200)
);

INSERT INTO futureme_private.ai_usage_policy (singleton) VALUES (true);

CREATE TABLE futureme_private.ai_usage_reservations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX ai_usage_reservations_time_idx
  ON futureme_private.ai_usage_reservations (reserved_at);
CREATE INDEX ai_usage_reservations_user_time_idx
  ON futureme_private.ai_usage_reservations (user_id, reserved_at);

ALTER TABLE futureme_private.ai_usage_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE futureme_private.ai_usage_reservations ENABLE ROW LEVEL SECURITY;
-- No client policies: only the owning SECURITY DEFINER function reads/writes.
REVOKE ALL ON ALL TABLES IN SCHEMA futureme_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA futureme_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reserve_reflection_usage(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_policy futureme_private.ai_usage_policy%ROWTYPE;
  v_now timestamptz;
  v_day_start timestamptz;
  v_user_minute bigint;
  v_user_day bigint;
  v_global_day bigint;
  v_retry_after integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_entry_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.entries AS entry
    WHERE entry.id = p_entry_id AND entry.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Entry unavailable' USING ERRCODE = '42501';
  END IF;

  -- Each command after acquiring the lock must see the preceding committed
  -- reservation. Reject snapshot-isolated transactions instead of undercounting.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Usage limiter unavailable' USING ERRCODE = '55000';
  END IF;

  -- Fixed application-wide key, shared by every instance and every user.
  -- The lock remains held through the reservation transaction's COMMIT.
  PERFORM pg_catalog.pg_advisory_xact_lock(615835148930167::bigint);

  SELECT * INTO v_policy
  FROM futureme_private.ai_usage_policy
  WHERE singleton IS TRUE
  FOR SHARE;

  IF NOT FOUND OR v_policy.enabled IS DISTINCT FROM true
    OR v_policy.per_user_minute IS NULL OR v_policy.per_user_minute NOT BETWEEN 1 AND 3
    OR v_policy.per_user_day IS NULL OR v_policy.per_user_day NOT BETWEEN 1 AND 20
    OR v_policy.global_day IS NULL OR v_policy.global_day NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'Usage limiter unavailable' USING ERRCODE = '55000';
  END IF;

  -- Capture time after waiting for the lock. UTC midnight is independent of
  -- the database/session timezone. Future timestamps count conservatively.
  v_now := pg_catalog.clock_timestamp();
  v_day_start := pg_catalog.date_trunc('day', v_now, 'UTC');

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE reservation.user_id = v_user_id
        AND reservation.reserved_at > v_now - interval '60 seconds'
    ),
    pg_catalog.count(*) FILTER (
      WHERE reservation.user_id = v_user_id
        AND reservation.reserved_at >= v_day_start
    ),
    pg_catalog.count(*) FILTER (WHERE reservation.reserved_at >= v_day_start)
  INTO v_user_minute, v_user_day, v_global_day
  FROM futureme_private.ai_usage_reservations AS reservation
  WHERE reservation.reserved_at >= LEAST(v_day_start, v_now - interval '60 seconds');

  IF v_user_minute >= v_policy.per_user_minute THEN
    v_retry_after := 60;
  END IF;
  IF v_user_day >= v_policy.per_user_day OR v_global_day >= v_policy.global_day THEN
    v_retry_after := GREATEST(
      v_retry_after,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (v_day_start + interval '24 hours' - v_now)))::integer
    );
  END IF;
  IF v_retry_after > 0 THEN
    RETURN pg_catalog.jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
  END IF;

  INSERT INTO futureme_private.ai_usage_reservations (user_id, entry_id, reserved_at)
  VALUES (v_user_id, p_entry_id, v_now);

  RETURN pg_catalog.jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_reflection_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reflection_usage(uuid) TO authenticated;

COMMIT;
