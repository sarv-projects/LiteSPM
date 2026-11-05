-- 005_write_journal.sql — durable intent for host-config and skill-directory
-- writes.
--
-- InstallTxn can undo a handled error in memory, but a process kill between a
-- filesystem write and the state commit left the machine mutated with no row
-- describing it. This journal is written before the first write and committed
-- in the same SQLite transaction as the install rows. Startup recovery rolls
-- back any journal that is still open.
--
-- The journal deliberately has no foreign key to installs: a row must be
-- writable before the install row exists (that is the crash window it closes).

CREATE TABLE IF NOT EXISTS write_journal (
    journal_id  TEXT PRIMARY KEY,
    install_id  TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'open', -- open | committed | rolled_back
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_write_journal_open
    ON write_journal(state, created_at);

CREATE TABLE IF NOT EXISTS write_journal_steps (
    step_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_id   TEXT NOT NULL,
    kind         TEXT NOT NULL, -- host | skill
    host_id      TEXT,
    path         TEXT NOT NULL,
    backup_path  TEXT,
    entry_name   TEXT,
    post_digest  TEXT,
    pre_exists   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (journal_id) REFERENCES write_journal(journal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_write_journal_steps_journal
    ON write_journal_steps(journal_id, step_id);
