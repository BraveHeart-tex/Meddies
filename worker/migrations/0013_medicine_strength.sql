-- Additive strength periods and permanent usage facts. Triggers also cover the old
-- Worker during release overlap; snapshots are resolved in the insertion transaction.
ALTER TABLE user_medications ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_medications ADD COLUMN ever_had_schedule INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_medications ADD COLUMN ever_had_dose INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_medications ADD COLUMN creation_request TEXT;
ALTER TABLE user_medications ADD COLUMN creation_result TEXT;
CREATE TABLE medicine_strength_revisions (
  owner_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  id TEXT NOT NULL,
  strength TEXT,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  PRIMARY KEY(owner_id, medicine_id, id),
  UNIQUE(owner_id, medicine_id, sequence),
  FOREIGN KEY(owner_id, medicine_id) REFERENCES user_medications(owner_id, id)
);
CREATE INDEX medicine_strength_effective ON medicine_strength_revisions(owner_id, medicine_id, effective_at,
  sequence);
INSERT INTO medicine_strength_revisions
  SELECT owner_id, id, id, strength, label, unit, '0001-01-01T00:00:00.000Z', 0 FROM user_medications;
UPDATE user_medications SET creation_request = json_object('label',label,'strength',strength,'unit',unit),
  ever_had_schedule = EXISTS(SELECT 1 FROM daily_schedules s WHERE s.owner_id=user_medications.owner_id AND
    s.medicine_id=user_medications.id),
  ever_had_dose = EXISTS(SELECT 1 FROM daily_schedules s JOIN dose_records d ON d.owner_id=s.owner_id AND
    d.schedule_id=s.id WHERE s.owner_id=user_medications.owner_id AND s.medicine_id=user_medications.id)
    OR EXISTS(SELECT 1 FROM daily_schedules s JOIN skipped_dose_records d ON d.owner_id=s.owner_id AND
      d.schedule_id=s.id WHERE s.owner_id=user_medications.owner_id AND s.medicine_id=user_medications.id)
    OR EXISTS(SELECT 1 FROM unscheduled_doses d WHERE d.owner_id=user_medications.owner_id AND
      d.medicine_id=user_medications.id);
CREATE TRIGGER medicine_initial_strength AFTER INSERT ON user_medications BEGIN
  INSERT INTO medicine_strength_revisions VALUES(NEW.owner_id, NEW.id, NEW.id, NEW.strength, NEW.label,
    NEW.unit, '0001-01-01T00:00:00.000Z' , 0);
  UPDATE user_medications SET creation_request=json_object( 'label' ,NEW.label, 'strength' ,NEW.strength,
    'unit' ,NEW.unit)
    WHERE owner_id=NEW.owner_id AND id=NEW.id;
  UPDATE user_medications SET creation_result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id
    AND id=NEW.id) WHERE owner_id=NEW.owner_id AND id=NEW.id;
END;
CREATE TRIGGER medicine_schedule_usage AFTER INSERT ON daily_schedules BEGIN
  UPDATE user_medications SET ever_had_schedule=1 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
END;
CREATE TRIGGER medicine_unit_lock BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit != OLD.unit AND (OLD.ever_had_schedule=1 OR OLD.ever_had_dose=1) BEGIN
  SELECT RAISE(ABORT, 'medicine_unit_locked');
END;
ALTER TABLE dose_records ADD COLUMN strength_revision_id TEXT;
ALTER TABLE dose_records ADD COLUMN strength TEXT;
ALTER TABLE dose_records ADD COLUMN original_strength TEXT;
ALTER TABLE dose_records ADD COLUMN medicine_label TEXT;
ALTER TABLE dose_records ADD COLUMN unit TEXT;
UPDATE dose_records SET strength_revision_id=(SELECT medicine_id FROM daily_schedules s WHERE
  s.owner_id=dose_records.owner_id AND s.id=dose_records.schedule_id), strength=(SELECT strength FROM
  user_medications m WHERE m.owner_id=dose_records.owner_id AND m.id=(SELECT medicine_id FROM daily_schedules
  s WHERE s.owner_id=dose_records.owner_id AND s.id=dose_records.schedule_id));
UPDATE dose_records SET original_strength=strength,
 medicine_label=(SELECT label FROM user_medications m WHERE m.owner_id=dose_records.owner_id AND m.id=(SELECT
   medicine_id FROM daily_schedules s WHERE s.owner_id=dose_records.owner_id AND
   s.id=dose_records.schedule_id)),
 unit=(SELECT unit FROM user_medications m WHERE m.owner_id=dose_records.owner_id AND m.id=(SELECT medicine_id
   FROM daily_schedules s WHERE s.owner_id=dose_records.owner_id AND s.id=dose_records.schedule_id));
CREATE TRIGGER dose_records_strength AFTER INSERT ON dose_records BEGIN
  UPDATE user_medications SET ever_had_dose=1 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM
    daily_schedules WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
  UPDATE dose_records SET strength_revision_id=COALESCE(NULL,(SELECT id FROM medicine_strength_revisions WHERE
    owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE owner_id=NEW.owner_id
    AND id=NEW.schedule_id) AND effective_at <= NEW.taken_at ORDER BY effective_at DESC, sequence DESC LIMIT
    1)) WHERE owner_id=NEW.owner_id AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at;
  UPDATE dose_records SET strength=(SELECT strength FROM medicine_strength_revisions WHERE
    owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE owner_id=NEW.owner_id
    AND id=NEW.schedule_id) AND id=dose_records.strength_revision_id) WHERE owner_id=NEW.owner_id AND
    schedule_id=NEW.schedule_id AND due_at=NEW.due_at;
  UPDATE dose_records SET original_strength=strength,
    medicine_label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=dose_records.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE
      owner_id=NEW.owner_id AND id=NEW.schedule_id)),
    unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=dose_records.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE
      owner_id=NEW.owner_id AND id=NEW.schedule_id)) WHERE owner_id=NEW.owner_id AND
      schedule_id=NEW.schedule_id AND due_at=NEW.due_at;
END;
ALTER TABLE skipped_dose_records ADD COLUMN strength_revision_id TEXT;
ALTER TABLE skipped_dose_records ADD COLUMN strength TEXT;
ALTER TABLE skipped_dose_records ADD COLUMN original_strength TEXT;
ALTER TABLE skipped_dose_records ADD COLUMN medicine_label TEXT;
ALTER TABLE skipped_dose_records ADD COLUMN unit TEXT;
UPDATE skipped_dose_records SET strength_revision_id=(SELECT medicine_id FROM daily_schedules s WHERE
  s.owner_id=skipped_dose_records.owner_id AND s.id=skipped_dose_records.schedule_id), strength=(SELECT
  strength FROM user_medications m WHERE m.owner_id=skipped_dose_records.owner_id AND m.id=(SELECT medicine_id
  FROM daily_schedules s WHERE s.owner_id=skipped_dose_records.owner_id AND
  s.id=skipped_dose_records.schedule_id));
UPDATE skipped_dose_records SET original_strength=strength,
 medicine_label=(SELECT label FROM user_medications m WHERE m.owner_id=skipped_dose_records.owner_id AND
   m.id=(SELECT medicine_id FROM daily_schedules s WHERE s.owner_id=skipped_dose_records.owner_id AND
   s.id=skipped_dose_records.schedule_id)),
 unit=(SELECT unit FROM user_medications m WHERE m.owner_id=skipped_dose_records.owner_id AND m.id=(SELECT
   medicine_id FROM daily_schedules s WHERE s.owner_id=skipped_dose_records.owner_id AND
   s.id=skipped_dose_records.schedule_id));
CREATE TRIGGER skipped_dose_records_strength AFTER INSERT ON skipped_dose_records BEGIN
  UPDATE user_medications SET ever_had_dose=1 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM
    daily_schedules WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
  UPDATE skipped_dose_records SET strength_revision_id=COALESCE(NULL,(SELECT id FROM
    medicine_strength_revisions WHERE owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM
    daily_schedules WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id) AND effective_at <= NEW.due_at ORDER
    BY effective_at DESC, sequence DESC LIMIT 1)) WHERE owner_id=NEW.owner_id AND schedule_id=NEW.schedule_id
    AND due_at=NEW.due_at;
  UPDATE skipped_dose_records SET strength=(SELECT strength FROM medicine_strength_revisions WHERE
    owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE owner_id=NEW.owner_id
    AND id=NEW.schedule_id) AND id=skipped_dose_records.strength_revision_id) WHERE owner_id=NEW.owner_id AND
    schedule_id=NEW.schedule_id AND due_at=NEW.due_at;
  UPDATE skipped_dose_records SET original_strength=strength,
    medicine_label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=skipped_dose_records.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules
      WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id)),
    unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=skipped_dose_records.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules
      WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id)) WHERE owner_id=NEW.owner_id AND
      schedule_id=NEW.schedule_id AND due_at=NEW.due_at;
END;
ALTER TABLE dose_corrections ADD COLUMN strength_revision_id TEXT;
ALTER TABLE dose_corrections ADD COLUMN strength TEXT;
ALTER TABLE dose_corrections ADD COLUMN original_strength TEXT;
ALTER TABLE dose_corrections ADD COLUMN medicine_label TEXT;
ALTER TABLE dose_corrections ADD COLUMN unit TEXT;
UPDATE dose_corrections SET strength_revision_id=(SELECT medicine_id FROM daily_schedules s WHERE
  s.owner_id=dose_corrections.owner_id AND s.id=dose_corrections.schedule_id), strength=(SELECT strength FROM
  user_medications m WHERE m.owner_id=dose_corrections.owner_id AND m.id=(SELECT medicine_id FROM
  daily_schedules s WHERE s.owner_id=dose_corrections.owner_id AND s.id=dose_corrections.schedule_id));
UPDATE dose_corrections SET original_strength=strength,
 medicine_label=(SELECT label FROM user_medications m WHERE m.owner_id=dose_corrections.owner_id AND
   m.id=(SELECT medicine_id FROM daily_schedules s WHERE s.owner_id=dose_corrections.owner_id AND
   s.id=dose_corrections.schedule_id)),
 unit=(SELECT unit FROM user_medications m WHERE m.owner_id=dose_corrections.owner_id AND m.id=(SELECT
   medicine_id FROM daily_schedules s WHERE s.owner_id=dose_corrections.owner_id AND
   s.id=dose_corrections.schedule_id));
CREATE TRIGGER dose_corrections_strength AFTER INSERT ON dose_corrections BEGIN
  UPDATE user_medications SET ever_had_dose=1 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM
    daily_schedules WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
  UPDATE dose_corrections SET strength_revision_id=COALESCE((SELECT strength_revision_id FROM (
     SELECT strength_revision_id, taken_at, outcome, revision FROM dose_corrections WHERE
       owner_id=NEW.owner_id AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND revision=NEW.revision-1
     UNION ALL SELECT strength_revision_id, taken_at, outcome, 0 FROM dose_records WHERE owner_id=NEW.owner_id
       AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND NEW.revision=1
     UNION ALL SELECT strength_revision_id, NULL, outcome, 0 FROM skipped_dose_records WHERE
       owner_id=NEW.owner_id AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND NEW.revision=1
   ) WHERE taken_at IS NEW.taken_at AND outcome=NEW.outcome LIMIT 1),(SELECT id FROM
     medicine_strength_revisions WHERE owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM
     daily_schedules WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id) AND effective_at <=
     COALESCE(NEW.taken_at,NEW.due_at) ORDER BY effective_at DESC, sequence DESC LIMIT 1)) WHERE
     owner_id=NEW.owner_id AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND revision=NEW.revision;
  UPDATE dose_corrections SET strength=(SELECT strength FROM medicine_strength_revisions WHERE
    owner_id=NEW.owner_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE owner_id=NEW.owner_id
    AND id=NEW.schedule_id) AND id=dose_corrections.strength_revision_id) WHERE owner_id=NEW.owner_id AND
    schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND revision=NEW.revision;
  UPDATE dose_corrections SET original_strength=strength,
    medicine_label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=dose_corrections.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE
      owner_id=NEW.owner_id AND id=NEW.schedule_id)),
    unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
      id=dose_corrections.strength_revision_id AND medicine_id=(SELECT medicine_id FROM daily_schedules WHERE
      owner_id=NEW.owner_id AND id=NEW.schedule_id)) WHERE owner_id=NEW.owner_id AND
      schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND revision=NEW.revision;
END;
ALTER TABLE unscheduled_doses ADD COLUMN strength_revision_id TEXT;
ALTER TABLE unscheduled_doses ADD COLUMN strength TEXT;
ALTER TABLE unscheduled_doses ADD COLUMN original_strength TEXT;
ALTER TABLE unscheduled_doses ADD COLUMN medicine_label TEXT;
ALTER TABLE unscheduled_doses ADD COLUMN unit TEXT;
UPDATE unscheduled_doses SET strength_revision_id=medicine_id, strength=(SELECT strength FROM user_medications
  m WHERE m.owner_id=unscheduled_doses.owner_id AND m.id=medicine_id);
UPDATE unscheduled_doses SET original_strength=strength,
 medicine_label=(SELECT label FROM user_medications m WHERE m.owner_id=unscheduled_doses.owner_id AND
   m.id=medicine_id),
 unit=(SELECT unit FROM user_medications m WHERE m.owner_id=unscheduled_doses.owner_id AND m.id=medicine_id);
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

-- Retain every recorded Taken instant, including changed/removed outcomes. These are
-- historical records too; a Strength change cannot precede an intake already recorded.
CREATE VIEW medicine_latest_taken AS
SELECT owner_id, medicine_id, MAX(taken_at) AS taken_at FROM (
 SELECT d.owner_id, s.medicine_id, d.taken_at FROM dose_records d JOIN daily_schedules s ON
   s.owner_id=d.owner_id AND s.id=d.schedule_id
 UNION ALL SELECT d.owner_id,s.medicine_id,d.taken_at FROM dose_corrections d JOIN daily_schedules s ON
   s.owner_id=d.owner_id AND s.id=d.schedule_id WHERE d.taken_at IS NOT NULL
 UNION ALL SELECT owner_id,medicine_id,taken_at FROM unscheduled_doses
) GROUP BY owner_id,medicine_id;
CREATE TABLE medicine_edits (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('correctDetails','changeStrength')),
 strength_revision_id TEXT NOT NULL, strength TEXT, label TEXT NOT NULL, unit TEXT NOT NULL,
 effective_at TEXT, confirmed_at TEXT NOT NULL, request TEXT NOT NULL,
 previous_details TEXT, result TEXT,
 PRIMARY KEY(owner_id,action_id),
 UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id)
);
-- One owner-scoped read composes preview periods, usage locks and reconciliation data.
CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'revision' ,m.revision, 'lastActionId' ,(SELECT action_id FROM medicine_edits e WHERE e.owner_id=m.owner_id
   AND e.medicine_id=m.id ORDER BY expected_revision DESC LIMIT 1), 'everHadSchedule' ,json(CASE
   m.ever_had_schedule WHEN 1 THEN 'true' ELSE 'false' END),
 'everHadDose',json(CASE m.ever_had_dose WHEN 1 THEN 'true' ELSE 'false' END),
 'latestTakenAt' ,(SELECT taken_at FROM medicine_latest_taken t WHERE t.owner_id=m.owner_id AND
   t.medicine_id=m.id),
 'currentStrengthRevisionId' ,(SELECT id FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id AND
   r.medicine_id=m.id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 'strengthRevisions',json((SELECT json_group_array(json(value)) FROM (
 SELECT json_object( 'id' ,r.id, 'strength' ,r.strength, 'label' ,r.label, 'unit' ,r.unit, 'effectiveAt'
   ,r.effective_at,
 'previousValues',json((SELECT json_group_array(json(previous_details)) FROM (
 SELECT previous_details FROM medicine_edits e WHERE e.owner_id=r.owner_id AND e.medicine_id=r.medicine_id AND
   e.strength_revision_id=r.id AND e.kind= 'correctDetails' AND e.previous_details IS NOT NULL ORDER BY
   expected_revision
 )))) AS value FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id AND r.medicine_id=m.id ORDER BY
   r.effective_at,r.sequence
 )))) AS record FROM user_medications m;

CREATE TRIGGER medicine_edit_guard BEFORE INSERT ON medicine_edits BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision) THEN RAISE(IGNORE) END;
 SELECT CASE WHEN NEW.kind= 'correctDetails' AND NOT EXISTS(SELECT 1 FROM medicine_strength_revisions WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND id=NEW.strength_revision_id) THEN RAISE(ABORT,
   'medicine_revision_missing' ) END;
 SELECT CASE WHEN NEW.kind= 'correctDetails' AND EXISTS(SELECT 1 FROM user_medications WHERE
   owner_id=NEW.owner_id AND id=NEW.medicine_id AND unit!=NEW.unit AND (ever_had_schedule=1 OR
   ever_had_dose=1)) THEN RAISE(ABORT, 'medicine_unit_locked' ) END;
 SELECT CASE WHEN NEW.kind= 'changeStrength' AND EXISTS(SELECT 1 FROM medicine_strength_revisions WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND id=NEW.strength_revision_id) THEN RAISE(ABORT,
   'medicine_strength_identity' ) END;
 SELECT CASE WHEN NEW.kind='changeStrength' AND (
 NEW.effective_at > NEW.confirmed_at OR NEW.effective_at < COALESCE((SELECT taken_at FROM
   medicine_latest_taken WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id),
   '0001-01-01T00:00:00.000Z' )
 ) THEN RAISE(ABORT,'medicine_strength_time') END;
END;
CREATE TRIGGER medicine_edit_apply AFTER INSERT ON medicine_edits BEGIN
 UPDATE medicine_edits SET previous_details=(SELECT json_object( 'strength' ,strength, 'label' ,label, 'unit'
   ,unit) FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND
   id=NEW.strength_revision_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id AND NEW.kind=
   'correctDetails' ;
 INSERT INTO medicine_strength_revisions(owner_id,medicine_id,id,strength,label,unit,effective_at,sequence)
 SELECT
   NEW.owner_id,NEW.medicine_id,NEW.strength_revision_id,NEW.strength,NEW.label,NEW.unit,NEW.effective_at,NEW.expected_revision+1
   WHERE NEW.kind= 'changeStrength' ;
 -- Type/Quantity unit belong to the Medicine, including earlier unused periods.
 -- The guard above permits a unit change only before any schedule or dose exists.
 UPDATE medicine_strength_revisions SET unit=NEW.unit WHERE NEW.kind='correctDetails'
 AND owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND EXISTS(
 SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id AND ever_had_schedule=0 AND
   ever_had_dose=0);
 UPDATE medicine_strength_revisions SET strength=NEW.strength,label=NEW.label,unit=NEW.unit WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND id=NEW.strength_revision_id;
 UPDATE user_medications SET revision=revision+1,
 strength=(SELECT strength FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1)
 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE dose_records SET strength=NEW.strength,medicine_label=NEW.label,unit=NEW.unit WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE skipped_dose_records SET strength=NEW.strength,medicine_label=NEW.label,unit=NEW.unit WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE dose_corrections SET strength=NEW.strength,medicine_label=NEW.label,unit=NEW.unit WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE unscheduled_doses SET strength=NEW.strength,medicine_label=NEW.label,unit=NEW.unit WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND
   strength_revision_id=NEW.strength_revision_id;
 UPDATE medicine_edits SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND
   id=NEW.medicine_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;

UPDATE user_medications SET creation_result=(SELECT record FROM medicine_records WHERE
  owner_id=user_medications.owner_id AND id=user_medications.id);
