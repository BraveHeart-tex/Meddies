CREATE TABLE skipped_dose_records (
  owner_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome = 'Skipped'),
  PRIMARY KEY (owner_id, schedule_id, due_at),
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules(owner_id, id)
);
CREATE INDEX skipped_dose_records_owner_due ON skipped_dose_records(owner_id, due_at);

CREATE TRIGGER dose_records_reject_skipped_occurrence
BEFORE INSERT ON dose_records
WHEN EXISTS (
  SELECT 1 FROM skipped_dose_records
  WHERE owner_id = NEW.owner_id
    AND schedule_id = NEW.schedule_id
    AND due_at = NEW.due_at
)
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE TRIGGER skipped_dose_records_reject_taken_occurrence
BEFORE INSERT ON skipped_dose_records
WHEN EXISTS (
  SELECT 1 FROM dose_records
  WHERE owner_id = NEW.owner_id
    AND schedule_id = NEW.schedule_id
    AND due_at = NEW.due_at
)
BEGIN
  SELECT RAISE(IGNORE);
END;
