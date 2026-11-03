CREATE TABLE daily_schedules (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK(length(id) = 36),
  medicine_id TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK(length(start_date) = 10),
  times TEXT NOT NULL CHECK(json_valid(times) AND json_array_length(times) BETWEEN 1 AND 24),
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, medicine_id),
  FOREIGN KEY (owner_id, medicine_id) REFERENCES user_medications(owner_id, id)
);
