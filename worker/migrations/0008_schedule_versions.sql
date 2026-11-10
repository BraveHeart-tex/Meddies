-- Retain every schedule id and dependent outcome while replacing the original
-- per-medicine UNIQUE constraint with one initial version and one successor.
CREATE TABLE daily_schedules_versions (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK(length(id) = 36),
  medicine_id TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK(length(start_date) = 10),
  times TEXT NOT NULL CHECK(json_valid(times) AND json_array_length(times) BETWEEN 1 AND 24),
  confirmed_at TEXT NOT NULL,
  weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]' CHECK(json_valid(weekdays) AND json_array_length(weekdays) BETWEEN 1 AND 7),
  end_date TEXT CHECK(end_date IS NULL OR length(end_date) = 10),
  interval_hours INTEGER CHECK(interval_hours IS NULL OR (typeof(interval_hours) = 'integer' AND interval_hours BETWEEN 1 AND 24)),
  based_on_id TEXT,
  edit_request TEXT,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, based_on_id),
  FOREIGN KEY (owner_id, medicine_id) REFERENCES user_medications(owner_id, id)
);
INSERT INTO daily_schedules_versions
  (owner_id,id,medicine_id,start_date,times,confirmed_at,weekdays,end_date,interval_hours)
  SELECT owner_id,id,medicine_id,start_date,times,confirmed_at,weekdays,end_date,interval_hours
  FROM daily_schedules;
CREATE TABLE dose_records_versions (
  owner_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  quantity REAL NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome = 'Taken'),
  PRIMARY KEY (owner_id, schedule_id, due_at),
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules_versions(owner_id, id)
);
INSERT INTO dose_records_versions SELECT * FROM dose_records;
CREATE TABLE skipped_dose_records_versions (
  owner_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome = 'Skipped'),
  PRIMARY KEY (owner_id, schedule_id, due_at),
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules_versions(owner_id, id)
);
INSERT INTO skipped_dose_records_versions SELECT * FROM skipped_dose_records;
CREATE TABLE dose_corrections_versions (
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
  FOREIGN KEY (owner_id, schedule_id) REFERENCES daily_schedules_versions(owner_id, id),
  CHECK ((outcome = 'Taken' AND taken_at IS NOT NULL AND quantity IS NOT NULL AND quantity > 0) OR
         (outcome = 'Skipped' AND taken_at IS NULL AND quantity IS NULL))
);
INSERT INTO dose_corrections_versions SELECT * FROM dose_corrections;
DROP TRIGGER dose_records_reject_skipped_occurrence;
DROP TRIGGER skipped_dose_records_reject_taken_occurrence;
DROP TABLE dose_corrections;
DROP TABLE skipped_dose_records;
DROP TABLE dose_records;
DROP TABLE daily_schedules;
ALTER TABLE daily_schedules_versions RENAME TO daily_schedules;
CREATE UNIQUE INDEX daily_schedules_initial ON daily_schedules(owner_id,medicine_id) WHERE based_on_id IS NULL;

ALTER TABLE dose_records_versions RENAME TO dose_records;
CREATE INDEX dose_records_owner_due ON dose_records(owner_id,due_at);

ALTER TABLE skipped_dose_records_versions RENAME TO skipped_dose_records;
CREATE INDEX skipped_dose_records_owner_due ON skipped_dose_records(owner_id,due_at);

ALTER TABLE dose_corrections_versions RENAME TO dose_corrections;
CREATE INDEX dose_corrections_owner_due ON dose_corrections(owner_id,due_at);

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

-- Serialize an early recording racing an edit: whichever insert commits first wins.
CREATE TRIGGER dose_records_reject_replaced_occurrence
BEFORE INSERT ON dose_records
WHEN EXISTS (
  SELECT 1 FROM daily_schedules
  WHERE owner_id = NEW.owner_id AND based_on_id = NEW.schedule_id AND confirmed_at < NEW.due_at
)
BEGIN
  SELECT RAISE(IGNORE);
END;

-- Serialize an early recording racing an edit: whichever insert commits first wins.
CREATE TRIGGER skipped_dose_records_reject_replaced_occurrence
BEFORE INSERT ON skipped_dose_records
WHEN EXISTS (
  SELECT 1 FROM daily_schedules
  WHERE owner_id = NEW.owner_id AND based_on_id = NEW.schedule_id AND confirmed_at < NEW.due_at
)
BEGIN
  SELECT RAISE(IGNORE);
END;
