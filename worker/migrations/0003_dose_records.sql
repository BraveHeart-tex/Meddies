CREATE TABLE dose_records (
  owner_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  quantity REAL NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome = 'Taken'),
  PRIMARY KEY (owner_id, schedule_id, due_at),
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules(owner_id, id)
);
CREATE INDEX dose_records_owner_due ON dose_records(owner_id, due_at);
