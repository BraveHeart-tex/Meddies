CREATE TABLE dose_corrections (
  owner_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action_id TEXT NOT NULL,
  expected_outcome TEXT NOT NULL CHECK (expected_outcome IN ('Taken', 'Skipped')),
  outcome TEXT NOT NULL CHECK (outcome IN ('Taken', 'Skipped')),
  taken_at TEXT,
  quantity REAL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, schedule_id, due_at, revision),
  UNIQUE (owner_id, action_id),
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules(owner_id, id),
  CHECK ((outcome = 'Taken' AND taken_at IS NOT NULL AND quantity IS NOT NULL AND quantity > 0) OR
         (outcome = 'Skipped' AND taken_at IS NULL AND quantity IS NULL))
);
CREATE INDEX dose_corrections_owner_due ON dose_corrections(owner_id, due_at);
