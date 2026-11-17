-- Original reminders (#366): one row per Occurrence a due-reminder run has found inside its
-- window. A run claims a bounded batch with one conditional UPDATE ... RETURNING that sets a
-- fresh claim token and lease; only the token holder settles the row, and an expired lease
-- makes a pending row claimable again.
CREATE TABLE original_reminders (
 owner_id TEXT NOT NULL,
 schedule_id TEXT NOT NULL,
 due_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'submitted', 'dropped')),
 claim_token TEXT,
 lease_until TEXT,
 settled_at TEXT,
 PRIMARY KEY (owner_id, schedule_id, due_at)
);
CREATE INDEX original_reminders_state_due ON original_reminders(state, due_at);

-- Delivery attempts (#366): one row per submission to one Device registration with the
-- provider's answer. Rows hold no registration token and no medication name.
CREATE TABLE delivery_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 schedule_id TEXT NOT NULL,
 due_at TEXT NOT NULL,
 installation_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'transient')),
 code TEXT,
 attempted_at TEXT NOT NULL
);
CREATE INDEX delivery_attempts_occurrence ON delivery_attempts(owner_id, schedule_id, due_at);
