CREATE TABLE low_stock_episodes (
  owner_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,
  push_eligible INTEGER NOT NULL CHECK(push_eligible IN (0, 1)),
  PRIMARY KEY(owner_id, medicine_id),
  FOREIGN KEY(owner_id, medicine_id) REFERENCES user_medications(owner_id, id) ON DELETE CASCADE
);

-- Existing low Stock keeps its notice. A subsequent episode earns its own push.
INSERT INTO low_stock_episodes(owner_id, medicine_id, id, push_eligible)
SELECT owner_id, id, lower(hex(randomblob(16))), 0
FROM user_medications
WHERE archived_at IS NULL AND stock_count < low_stock_threshold;

-- Stock actions, intake movements and Type corrections update this row inside their
-- existing write transactions. Replays and rejected writes cannot create a crossing.
CREATE TRIGGER medicine_low_stock_episode
AFTER UPDATE OF stock_count, low_stock_threshold, unit, archived_at ON user_medications
WHEN NEW.stock_count IS NOT OLD.stock_count
  OR NEW.low_stock_threshold IS NOT OLD.low_stock_threshold
  OR NEW.unit != OLD.unit
  OR NEW.archived_at IS NOT OLD.archived_at
BEGIN
  DELETE FROM low_stock_episodes
  WHERE owner_id = NEW.owner_id AND medicine_id = NEW.id
    AND (NEW.unit != OLD.unit OR NEW.stock_count IS NULL
      OR NEW.low_stock_threshold IS NULL OR NEW.stock_count >= NEW.low_stock_threshold);

  -- Archiving forfeits the remaining push budget. Restoring low Stock can
  -- recover episode tracking for a legacy archived row without earning a push.
  UPDATE low_stock_episodes SET push_eligible = 0
  WHERE owner_id = NEW.owner_id AND medicine_id = NEW.id
    AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL;

  INSERT INTO low_stock_episodes(owner_id, medicine_id, id, push_eligible)
  SELECT NEW.owner_id, NEW.id, lower(hex(randomblob(16))), OLD.archived_at IS NULL
  WHERE NEW.archived_at IS NULL AND NEW.unit = OLD.unit
    AND NEW.stock_count < NEW.low_stock_threshold
  ON CONFLICT(owner_id, medicine_id) DO NOTHING;
END;
