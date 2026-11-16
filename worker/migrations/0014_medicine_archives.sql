-- Archive (#322). One insert into medicine_archives commits or rolls back together:
-- the head Schedule version gets a stop successor at the Edit time (D3, #218), the
-- Medicine gets archived_at and its next revision, and the receipt is stored. There is
-- no reminder delivery yet (#30, #38, #53); archived_at and the stop version are the
-- persisted facts every future dose, food and refill sender must honor. Existing rows
-- stay active (archived_at NULL). The guard below also binds an older Worker.
ALTER TABLE user_medications ADD COLUMN archived_at TEXT;
CREATE TABLE medicine_archives (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, confirmed_at TEXT NOT NULL, request TEXT NOT NULL,
 stopped_schedule_id TEXT, result TEXT,
 PRIMARY KEY(owner_id,action_id),
 UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id)
);
-- An archived Medicine expects no future doses: no first schedule, change or restart.
CREATE TRIGGER daily_schedules_archived_guard BEFORE INSERT ON daily_schedules
WHEN EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id AND
  archived_at IS NOT NULL) BEGIN
 SELECT RAISE(ABORT,'medicine_archived');
END;
-- A stale revision or an already archived Medicine writes nothing; the Worker reports conflict.
CREATE TRIGGER medicine_archive_guard BEFORE INSERT ON medicine_archives BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision AND archived_at IS NULL) THEN RAISE(IGNORE) END;
END;
-- Stops the current head unless it is already stopped or Ended (Last day before the
-- Istanbul Edit day; Istanbul is UTC+3). Doses due at or before the Edit time, and later
-- ones already recorded, stay with the earlier version.
CREATE TRIGGER medicine_archive_apply AFTER INSERT ON medicine_archives BEGIN
 INSERT INTO daily_schedules (owner_id,id,medicine_id,start_date,times,confirmed_at,weekdays,end_date,
   interval_hours,based_on_id,edit_request,stopped_at,paused_at,anchor_date)
 SELECT s.owner_id,NEW.action_id,s.medicine_id,s.start_date,s.times,NEW.confirmed_at,s.weekdays,NULL,
   s.interval_hours,s.id,json_object('operation','archive','actionId',NEW.action_id),NEW.confirmed_at,NULL,
   s.anchor_date
 FROM daily_schedules s WHERE s.owner_id=NEW.owner_id AND s.medicine_id=NEW.medicine_id
   AND NOT EXISTS(SELECT 1 FROM daily_schedules n WHERE n.owner_id=s.owner_id AND n.based_on_id=s.id)
   AND s.stopped_at IS NULL
   AND (s.end_date IS NULL OR s.end_date >= date(NEW.confirmed_at,'+3 hours'));
 UPDATE medicine_archives SET stopped_schedule_id=(SELECT id FROM daily_schedules WHERE owner_id=NEW.owner_id
   AND id=NEW.action_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
 UPDATE user_medications SET archived_at=NEW.confirmed_at,revision=revision+1
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE medicine_archives SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND
   id=NEW.medicine_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
-- Reads expose archivedAt; lastActionId spans edits and archives.
DROP VIEW medicine_records;
CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_edits UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_archives) e WHERE e.owner_id=m.owner_id
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
