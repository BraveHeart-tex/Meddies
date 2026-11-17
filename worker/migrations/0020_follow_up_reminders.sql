-- Follow-up reminders (#31): one row per Follow-up reminder a due-reminder run found to be its
-- Occurrence's latest due reminder. Reminder 1 targets due +40 minutes and reminder 2 due +80;
-- the key allows no third. Claims and leases work as in original_reminders.
CREATE TABLE follow_up_reminders (
 owner_id TEXT NOT NULL,
 schedule_id TEXT NOT NULL,
 due_at TEXT NOT NULL,
 reminder INTEGER NOT NULL CHECK (reminder IN (1, 2)),
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'submitted', 'dropped')),
 claim_token TEXT,
 lease_until TEXT,
 settled_at TEXT,
 PRIMARY KEY (owner_id, schedule_id, due_at, reminder)
);
CREATE INDEX follow_up_reminders_state_due ON follow_up_reminders(state, due_at);

-- A Delivery attempt names the reminder of its Occurrence it submitted: 0 the Original reminder,
-- 1 and 2 the Follow-up reminders. Existing rows are Original reminders.
ALTER TABLE delivery_attempts ADD COLUMN reminder INTEGER NOT NULL DEFAULT 0 CHECK (reminder IN (0, 1, 2));
