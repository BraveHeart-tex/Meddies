CREATE TABLE unscheduled_doses (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  action_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0 AND quantity * 2 = CAST(quantity * 2 AS INTEGER)),
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
  request TEXT NOT NULL,
  PRIMARY KEY (owner_id, id, revision),
  UNIQUE (owner_id, action_id),
  FOREIGN KEY (owner_id, medicine_id) REFERENCES user_medications(owner_id, id)
);
CREATE INDEX unscheduled_doses_owner_taken ON unscheduled_doses(owner_id, taken_at);
