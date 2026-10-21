-- 004_query_indexes: index the three lookups that were full table scans.
--
-- The schema's queries are small and specific, but the tables they read are
-- not small: `installs` holds one row per installed capability and
-- `capability_grants` one row per authorization, and both grow with use.
--
-- The three lookups that lacked a usable index:
--
--   * `ListHostRegistrationsForEntry` filters (scope, managed_entry_key).
--     The table's primary key leads with host_id, so the pair the query uses
--     was unusable and the query scanned the table.
--   * `GetActiveGrant` and `ListCapabilityGrants` filter capability_id. The
--     policy engine consults the grant table on EVERY invocation, so this
--     scan sat on the hot path of every tool call.
--   * `ListInstalls` filters scope and workspace_id, which is how the
--     inventory and the project-scope reads find their rows.
--
-- These are plain indexes: they add no column, so no query's shape changes
-- and no backfill is needed.
CREATE INDEX IF NOT EXISTS idx_host_registrations_scope_entry
    ON host_registrations(scope, managed_entry_key);

CREATE INDEX IF NOT EXISTS idx_capability_grants_capability
    ON capability_grants(capability_id);

CREATE INDEX IF NOT EXISTS idx_installs_scope_workspace
    ON installs(scope, workspace_id);
