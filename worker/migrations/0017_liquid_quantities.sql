-- Rebuild in place under deferred foreign keys: keeping the original table names avoids
-- rewriting dependent FKs, views and triggers. Copies retain receipts and snapshots verbatim.
-- Restore insertion triggers only after copying, so no existing row is replayed.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE liquid_medications_copy AS SELECT * FROM user_medications;
CREATE TABLE liquid_unscheduled_copy AS SELECT * FROM unscheduled_doses;
DROP TABLE unscheduled_doses;
DROP TABLE user_medications;
CREATE TABLE user_medications (
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 8 AND 255),
  id TEXT NOT NULL CHECK(length(id) = 36),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
  strength TEXT CHECK(strength IS NULL OR length(trim(strength)) BETWEEN 1 AND 120),
  unit TEXT NOT NULL CHECK(unit IN ('tablet', 'capsule', 'liquid', 'inhaler', 'drops')),
  revision INTEGER NOT NULL DEFAULT 0,
  ever_had_schedule INTEGER NOT NULL DEFAULT 0,
  ever_had_dose INTEGER NOT NULL DEFAULT 0,
  creation_request TEXT,
  creation_result TEXT,
  archived_at TEXT,
  PRIMARY KEY (owner_id, id)
);
INSERT INTO user_medications SELECT * FROM liquid_medications_copy;
CREATE TABLE unscheduled_doses (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  action_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  -- Per-Type grids and safe bounds belong to the shared Worker quantity policy.
  quantity REAL NOT NULL CHECK (quantity > 0),
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
  request TEXT NOT NULL,
  strength_revision_id TEXT,
  strength TEXT,
  original_strength TEXT,
  medicine_label TEXT,
  unit TEXT,
  PRIMARY KEY (owner_id, id, revision),
  UNIQUE (owner_id, action_id),
  FOREIGN KEY (owner_id, medicine_id) REFERENCES user_medications(owner_id, id)
);
INSERT INTO unscheduled_doses SELECT * FROM liquid_unscheduled_copy;
CREATE INDEX unscheduled_doses_owner_taken ON unscheduled_doses(owner_id, taken_at);
DROP TABLE liquid_unscheduled_copy;
DROP TABLE liquid_medications_copy;

CREATE TRIGGER medicine_initial_strength AFTER INSERT ON user_medications BEGIN
  INSERT INTO medicine_strength_revisions VALUES(NEW.owner_id, NEW.id, NEW.id, NEW.strength, NEW.label,
    NEW.unit, '0001-01-01T00:00:00.000Z' , 0);
  UPDATE user_medications SET creation_request=json_object( 'label' ,NEW.label, 'strength' ,NEW.strength,
    'unit' ,NEW.unit)
    WHERE owner_id=NEW.owner_id AND id=NEW.id;
  UPDATE user_medications SET creation_result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id
    AND id=NEW.id) WHERE owner_id=NEW.owner_id AND id=NEW.id;
END;

CREATE TRIGGER medicine_unit_lock BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit != OLD.unit AND (OLD.ever_had_schedule=1 OR OLD.ever_had_dose=1) BEGIN
  SELECT RAISE(ABORT, 'medicine_unit_locked');
END;

CREATE TRIGGER medicine_deleted_creation_guard BEFORE INSERT ON user_medications
WHEN EXISTS(SELECT 1 FROM medicine_deletions WHERE owner_id=NEW.owner_id AND medicine_id=NEW.id)
BEGIN SELECT RAISE(IGNORE); END;

CREATE TRIGGER unscheduled_doses_strength AFTER INSERT ON unscheduled_doses BEGIN
  UPDATE user_medications SET ever_had_dose=1 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
  UPDATE unscheduled_doses SET strength_revision_id=COALESCE((SELECT strength_revision_id FROM
    unscheduled_doses WHERE owner_id=NEW.owner_id AND id=NEW.id AND revision=NEW.revision-1 AND
    taken_at=NEW.taken_at),(SELECT id FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
    medicine_id=NEW.medicine_id AND effective_at <= NEW.taken_at ORDER BY effective_at DESC, sequence DESC
    LIMIT 1)) WHERE owner_id=NEW.owner_id AND id=NEW.id AND revision=NEW.revision;
  UPDATE unscheduled_doses SET strength=(SELECT strength FROM medicine_strength_revisions WHERE
    owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND id=unscheduled_doses.strength_revision_id) WHERE
    owner_id=NEW.owner_id AND id=NEW.id AND revision=NEW.revision;
  UPDATE unscheduled_doses SET original_strength=strength,
    medicine_label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=unscheduled_doses.strength_revision_id AND medicine_id=NEW.medicine_id),
    unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=unscheduled_doses.strength_revision_id AND medicine_id=NEW.medicine_id) WHERE owner_id=NEW.owner_id
      AND id=NEW.id AND revision=NEW.revision;
END;
