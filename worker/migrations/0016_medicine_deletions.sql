-- Delete (#324): the receipt is also the permanent owner-scoped deletion fact.
-- It deliberately has no Medicine FK. One insert validates usage/revision, removes
-- dependent record data and the Medicine, and retains the receipt atomically.
CREATE TABLE medicine_deletions (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, deleted_at TEXT NOT NULL, request TEXT NOT NULL,
 result TEXT,
 PRIMARY KEY(owner_id,action_id),
 UNIQUE(owner_id,medicine_id)
);
CREATE TRIGGER medicine_deletion_guard BEFORE INSERT ON medicine_deletions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id AND revision=NEW.expected_revision
   AND ever_had_schedule=0 AND ever_had_dose=0) THEN RAISE(IGNORE) END;
END;
CREATE TRIGGER medicine_deletion_apply AFTER INSERT ON medicine_deletions BEGIN
 DELETE FROM medicine_edits WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id;
 DELETE FROM medicine_archives WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id;
 DELETE FROM medicine_restores WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id;
 DELETE FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id;
 DELETE FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE medicine_deletions SET result=json_object('actionId',NEW.action_id,
   'medicineId',NEW.medicine_id,'expectedRevision',NEW.expected_revision,'deletedAt',NEW.deleted_at)
   WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
-- Also prevents an older Worker's insert-or-ignore creation replay from resurrecting it.
CREATE TRIGGER medicine_deleted_creation_guard BEFORE INSERT ON user_medications
WHEN EXISTS(SELECT 1 FROM medicine_deletions WHERE owner_id=NEW.owner_id AND medicine_id=NEW.id)
BEGIN SELECT RAISE(IGNORE); END;
