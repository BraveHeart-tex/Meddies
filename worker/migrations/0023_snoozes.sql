-- Snoozes (#36): one row per Follow-up reminder a server-confirmed Snooze reserved. The key
-- matches follow_up_reminders, so each slot is reserved once and no third exists; the action ID
-- makes a retry return its original outcome; the partial index allows one pending Snooze per
-- Occurrence. A Snooze targeted inside Quiet hours is accepted already dropped. Claims and leases
-- work as in original_reminders.
CREATE TABLE snoozes (
 owner_id TEXT NOT NULL,
 schedule_id TEXT NOT NULL,
 due_at TEXT NOT NULL,
 reminder INTEGER NOT NULL CHECK (reminder IN (1, 2)),
 action_id TEXT NOT NULL,
 accepted_at TEXT NOT NULL,
 target_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'submitted', 'dropped')),
 claim_token TEXT,
 lease_until TEXT,
 settled_at TEXT,
 PRIMARY KEY (owner_id, schedule_id, due_at, reminder),
 UNIQUE (owner_id, action_id)
);
CREATE UNIQUE INDEX snoozes_one_pending ON snoozes(owner_id, schedule_id, due_at)
 WHERE state = 'pending';
CREATE INDEX snoozes_state_target ON snoozes(state, target_at);
