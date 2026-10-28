# AI usage limit proposal — approval required

Status: prepared only; no migration, remote SQL, service purchase, or activation has been performed. Public AI access must remain blocked until the owner approves installation, the checks below pass, and activation is approved separately.

## Exact change

[20261022_ai_usage_limits.sql](20261022_ai_usage_limits.sql) creates a private schema, a disabled policy, reservation metadata, and one authenticated RPC in the existing Supabase database. It does not alter existing tables, historical journal/reflection records, ownership policies, or authentication. Execute the complete transaction once as the database owner only after approval. Existing object-name collisions intentionally fail the transaction rather than replacing anything.

The initial policy permits at most 3 reservations per user per rolling 60 seconds, 20 per user per UTC day, and 200 globally per UTC day. Owners can lower these values; raising these hard ceilings requires a separately reviewed change. The RPC accepts only `p_entry_id` and derives the user from `auth.uid()`. It verifies `public.entries.id` and `public.entries.user_id` before counting usage. Verify these existing column types and the applying role's access before installation; this proposal adds no inferred journal columns.

RPC contract: `public.reserve_reflection_usage(p_entry_id uuid)` returns `{ "allowed": true, "retry_after_seconds": 0 }`, or `{ "allowed": false, "retry_after_seconds": <positive integer> }` when capped. Disabled/missing/invalid configuration, missing ownership, unavailable storage, lock timeout, or unsupported transaction isolation raises an error. The application must treat errors or malformed results as unavailable and make no provider call. The application must await a successful committed RPC response before making exactly one provider request; provider SDK automatic retries must be disabled. Retrying a failed reflection requires another reservation for the already-saved entry.

## Atomicity and access

Every reservation takes the same transaction advisory lock before reading counters and inserting. The function explicitly requires `read committed` isolation so commands after the lock see previously committed reservations; other isolation levels fail closed. Time comes from the database after lock acquisition. Failed provider calls and failed reflection persistence still count; there is no client refund or counter reset. PostgreSQL holds transaction advisory locks until the transaction ends. See [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

The function uses `SECURITY DEFINER`, an empty `search_path`, qualified database references, and explicit authenticated-only execution grants. Private schema/table/sequence access is revoked for `PUBLIC`, `anon`, and `authenticated`; both tables have RLS enabled with no client policies. A database owner retains administrative control. Follow [Supabase function security and permissions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

The RPC only consumes quota. Calling it directly never provides a provider credential or triggers an AI request. An authenticated user can exhaust their own allowance; multiple abusive accounts can consume the global beta allowance, which deliberately caps cost by denying subsequent requests. No web-accessible refund, policy-update, or metadata-delete function is introduced.

Reservation metadata contains a generated ID, user ID, entry ID, and timestamp only. No journal text, reflection, token, email, password, or provider key is stored. Metadata retention is initially unbounded; at the global ceiling it grows by at most 200 rows per UTC day. No cleanup job is installed. Retention/deletion, including account-erasure handling, needs a later owner-approved policy; deleting current-window reservations would weaken limits.

At the ceiling, each UTC day's 200 reservations authorize at most `200 × 20,000` journal characters and `200 × 140` requested output tokens, plus the fixed system prompt per request. Provider work may complete after midnight. Characters are not tokens or a dollar budget. All provider attempts count, including failures; account/provider-side spending settings are an additional control and need owner verification. Quotas reset at UTC midnight and can allow up to 400 requests across the two sides of a midnight boundary; the per-user rolling minute limit still applies. These caps cover only calls using this application path, not other users of the same provider key.

## Approval and verification sequence

1. Approve installation of this exact SQL file and the stated quota/metadata policy. Confirm the existing `entries.id` and `entries.user_id` are UUID columns, the owner can query them, and the new schema/RPC names are unused. Do not share credentials or real record contents.
2. Apply the transaction through the owner's existing Supabase administration workflow. Leave `enabled = false`. Confirm application reflection requests return unavailable and cause no provider traffic; saving and reading journal entries and saved reflections must still work.
3. Before public activation, verify the RPC in an isolated staging database with fictional accounts/entries. Test anonymous denial, missing/foreign-entry denial, direct private-table access denial, disabled/missing policy failure, exactly three allowed concurrent reservations per user in a 60-second window, per-user daily rejection after 20, and global rejection after 200 across multiple accounts. Verify the UTC boundary, higher isolation rejection, and lock timeout. These RPC tests consume reservations but never call the provider. Test lower temporary limits only in staging; restore approved limits before activation. Do not delete production quota records to enable tests.
4. Separately approve activation. The owner can then run the following exact statement in the intended project after checking its identity locally. No project URL, token, or service-role secret belongs in this document or chat:

   ```sql
   UPDATE futureme_private.ai_usage_policy
   SET enabled = true
   WHERE singleton IS TRUE
     AND per_user_minute = 3
     AND per_user_day = 20
     AND global_day = 200;
   ```

   Confirm exactly one row was updated. A missing row must remain unavailable; do not create a replacement implicitly.
5. With the owner's separate consent for a billable test, generate one reflection for a fictional saved entry, then refresh and confirm persistence. Check request status and duration only. Repeat with a second account and verify it cannot read, reserve quota for, or generate a reflection for the first account's entry.

Emergency owner action after approval is `UPDATE futureme_private.ai_usage_policy SET enabled = false WHERE singleton IS TRUE;`. This stops new reservations; an already-reserved provider request can still finish. It preserves all history and usage records. Do not drop objects or erase quota history as a rollback.

Local review is static only until the SQL is run in an approved database; mocked application tests cannot prove database concurrency, grants, or production RLS behavior.
