-- Synthetic, isolated feasibility schema. Not the production domain schema.
CREATE TABLE stock (
  run TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL CHECK (quantity >= 0)
);
CREATE TABLE dose_record (
  action TEXT PRIMARY KEY,
  run TEXT NOT NULL REFERENCES stock(run),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX dose_record_run ON dose_record(run);
CREATE TABLE stock_movement (
  action TEXT PRIMARY KEY REFERENCES dose_record(action),
  run TEXT NOT NULL REFERENCES stock(run),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX stock_movement_run ON stock_movement(run);
CREATE TABLE reminder (
  run TEXT PRIMARY KEY REFERENCES stock(run),
  token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
