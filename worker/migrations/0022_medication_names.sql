-- Medication names (#37): the account-wide preference to name Medicines in reminders, off by
-- default. Only the due-reminder operation reads it, at send time; it reads and sets independently
-- of Quiet hours.
ALTER TABLE account_preferences
 ADD COLUMN medication_names INTEGER NOT NULL DEFAULT 0 CHECK (medication_names IN (0, 1));

-- One receipt per Medication names set, keyed by its action ID. Inserting a receipt applies its
-- value in the same statement; a retry inserts nothing, so it writes nothing, even after a newer
-- set.
CREATE TABLE medication_names_receipts (
 owner_id TEXT NOT NULL,
 action_id TEXT NOT NULL,
 medication_names INTEGER NOT NULL CHECK (medication_names IN (0, 1)),
 saved_at TEXT NOT NULL,
 PRIMARY KEY (owner_id, action_id)
);
CREATE TRIGGER medication_names_receipts_apply AFTER INSERT ON medication_names_receipts
BEGIN
 INSERT OR IGNORE INTO account_preferences (owner_id, updated_at)
  VALUES (NEW.owner_id, NEW.saved_at);
 UPDATE account_preferences SET medication_names = NEW.medication_names, updated_at = NEW.saved_at
  WHERE owner_id = NEW.owner_id;
END;
