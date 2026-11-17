-- Account preferences (#35): one row per account that ever set one. No row reads as defaults:
-- Quiet hours off. Only the due-reminder operation reads Quiet hours, at send time.
CREATE TABLE account_preferences (
 owner_id TEXT PRIMARY KEY NOT NULL,
 quiet_hours INTEGER NOT NULL DEFAULT 0 CHECK (quiet_hours IN (0, 1)),
 updated_at TEXT NOT NULL
);

-- One receipt per Quiet hours set, keyed by its action ID. Inserting a receipt applies its value
-- in the same statement; a retry inserts nothing, so it writes nothing, even after a newer set.
CREATE TABLE quiet_hours_receipts (
 owner_id TEXT NOT NULL,
 action_id TEXT NOT NULL,
 quiet_hours INTEGER NOT NULL CHECK (quiet_hours IN (0, 1)),
 saved_at TEXT NOT NULL,
 PRIMARY KEY (owner_id, action_id)
);
CREATE TRIGGER quiet_hours_receipts_apply AFTER INSERT ON quiet_hours_receipts
BEGIN
 INSERT OR IGNORE INTO account_preferences (owner_id, updated_at)
  VALUES (NEW.owner_id, NEW.saved_at);
 UPDATE account_preferences SET quiet_hours = NEW.quiet_hours, updated_at = NEW.saved_at
  WHERE owner_id = NEW.owner_id;
END;
