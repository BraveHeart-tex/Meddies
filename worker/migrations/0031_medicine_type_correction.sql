-- Detail correction keeps Schedule identities and dose revisions. A Schedule version
-- retains its original times for replay. Dose reads overlay the reviewed revision only;
-- new dose revisions and original mutation receipts still use the immutable dose rows.
ALTER TABLE daily_schedules ADD COLUMN original_times TEXT;
ALTER TABLE user_medications ADD COLUMN quantity_review_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_medications ADD COLUMN quantity_scale INTEGER;
ALTER TABLE user_medications ADD COLUMN quantity_max REAL;

CREATE TABLE medicine_type_corrections (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, review_revision INTEGER NOT NULL,
 from_unit TEXT NOT NULL, unit TEXT NOT NULL, quantity_scale INTEGER NOT NULL, quantity_max REAL NOT NULL,
 confirmed_at TEXT NOT NULL, count REAL, request TEXT NOT NULL, repairs TEXT NOT NULL,
 strength_revision_id TEXT, label TEXT, strength TEXT, previous_details TEXT, result TEXT,
 PRIMARY KEY(owner_id,action_id), UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);

CREATE TABLE medicine_dose_quantity_repairs (
 owner_id TEXT NOT NULL, medicine_id TEXT NOT NULL, dose_key TEXT NOT NULL,
 revision INTEGER NOT NULL, quantity REAL NOT NULL,
 PRIMARY KEY(owner_id,dose_key,revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);

-- These append-only histories can change without a Medicine revision. Updating the
-- review revision in their write statements makes preflight and confirmation comparable.
CREATE TRIGGER medicine_quantity_schedule_write AFTER INSERT ON daily_schedules BEGIN
 UPDATE user_medications SET quantity_review_revision=quantity_review_revision+1
 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
END;
CREATE TRIGGER medicine_quantity_taken_write AFTER INSERT ON dose_records BEGIN
 UPDATE user_medications SET quantity_review_revision=quantity_review_revision+1
 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM daily_schedules
   WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
END;
CREATE TRIGGER medicine_quantity_skipped_write AFTER INSERT ON skipped_dose_records BEGIN
 UPDATE user_medications SET quantity_review_revision=quantity_review_revision+1
 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM daily_schedules
   WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
END;
CREATE TRIGGER medicine_quantity_scheduled_revision AFTER INSERT ON dose_corrections BEGIN
 UPDATE user_medications SET quantity_review_revision=quantity_review_revision+1
 WHERE owner_id=NEW.owner_id AND id=(SELECT medicine_id FROM daily_schedules
   WHERE owner_id=NEW.owner_id AND id=NEW.schedule_id);
END;
CREATE TRIGGER medicine_quantity_unscheduled_revision AFTER INSERT ON unscheduled_doses BEGIN
 UPDATE user_medications SET quantity_review_revision=quantity_review_revision+1
 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
END;

-- The old Detail correction keeps its prior lock. Only the correction insert can
-- authorize a used Medicine's Type change, for exactly its pending revision.
DROP TRIGGER medicine_unit_lock;
DROP TRIGGER medicine_stock_unit_lock;
CREATE TRIGGER medicine_unit_lock BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit != OLD.unit AND (OLD.ever_had_schedule=1 OR OLD.ever_had_dose=1 OR OLD.stock_count IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM medicine_type_corrections c
   WHERE c.owner_id=OLD.owner_id AND c.medicine_id=OLD.id AND c.expected_revision=OLD.revision
     AND NEW.revision=OLD.revision+1 AND c.from_unit=OLD.unit AND c.unit=NEW.unit)
BEGIN
 SELECT RAISE(ABORT, 'medicine_unit_locked');
END;

-- Older Workers can validate a dose or Schedule version before a concurrent Type
-- correction. Use the new Type's grid, supplied by the shared policy in that correction,
-- in the insert itself. The policy is absent for Medicines never corrected by this command.
CREATE TRIGGER medicine_quantity_schedule_guard BEFORE INSERT ON daily_schedules
WHEN EXISTS (
 SELECT 1 FROM user_medications m, json_each(NEW.times) slot
 WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.quantity_scale IS NOT NULL
 AND NOT (json_extract(slot.value,'$.quantity') BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(json_extract(slot.value,'$.quantity')*m.quantity_scale)/m.quantity_scale=json_extract(slot.value,'$.quantity'))
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;
CREATE TRIGGER medicine_quantity_taken_guard BEFORE INSERT ON dose_records
WHEN EXISTS (
 SELECT 1 FROM daily_schedules s JOIN user_medications m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
 WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;
CREATE TRIGGER medicine_quantity_scheduled_revision_guard BEFORE INSERT ON dose_corrections
WHEN NEW.outcome='Taken' AND EXISTS (
 SELECT 1 FROM daily_schedules s JOIN user_medications m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
 WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;
CREATE TRIGGER medicine_quantity_unscheduled_revision_guard BEFORE INSERT ON unscheduled_doses
WHEN NEW.removed=0 AND EXISTS (
 SELECT 1 FROM user_medications m
 WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;

CREATE TRIGGER medicine_type_correction_guard BEFORE INSERT ON medicine_type_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM user_medications m
   WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.archived_at IS NULL
     AND m.revision=NEW.expected_revision AND m.quantity_review_revision=NEW.review_revision
     AND m.unit=NEW.from_unit AND m.unit!=NEW.unit AND (m.stock_count IS NULL)=(NEW.count IS NULL)
 ) THEN RAISE(IGNORE) END;
END;

CREATE TRIGGER medicine_type_correction_apply AFTER INSERT ON medicine_type_corrections BEGIN
 UPDATE medicine_type_corrections SET previous_details=(
   SELECT json_group_object(id,json_object('label',label,'strength',strength,'unit',unit))
   FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id
 ) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;

 UPDATE daily_schedules SET original_times=COALESCE(original_times,times), times=(
   SELECT json_group_array(json(slot))
   FROM (
     SELECT CASE WHEN repair.value IS NULL THEN slot.value
       ELSE json_set(slot.value,'$.quantity',json_extract(repair.value,'$.quantity')) END AS slot
     FROM json_each(daily_schedules.times) slot LEFT JOIN json_each(NEW.repairs) repair
       ON json_extract(repair.value,'$.key')='schedule:'||daily_schedules.id||':'||slot.key
     ORDER BY slot.key
   )
 ) WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id
   AND id IN (SELECT json_extract(value,'$.id') FROM json_each(NEW.repairs)
     WHERE json_extract(value,'$.kind')='schedule');

 INSERT INTO medicine_dose_quantity_repairs(owner_id,medicine_id,dose_key,revision,quantity)
 SELECT NEW.owner_id,NEW.medicine_id,json_extract(value,'$.key'),
   json_extract(value,'$.revision'),json_extract(value,'$.quantity')
 FROM json_each(NEW.repairs) WHERE json_extract(value,'$.kind')!='schedule'
 ON CONFLICT(owner_id,dose_key,revision) DO UPDATE SET quantity=excluded.quantity;

 UPDATE medicine_strength_revisions SET unit=NEW.unit,
   label=CASE WHEN id=NEW.strength_revision_id THEN NEW.label ELSE label END,
   strength=CASE WHEN id=NEW.strength_revision_id THEN NEW.strength ELSE strength END
 WHERE owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id;
 UPDATE user_medications SET unit=NEW.unit, revision=revision+1,
   label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id
     AND medicine_id=NEW.medicine_id ORDER BY effective_at DESC,sequence DESC LIMIT 1),
   strength=(SELECT strength FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id
     AND medicine_id=NEW.medicine_id ORDER BY effective_at DESC,sequence DESC LIMIT 1),
   quantity_scale=NEW.quantity_scale, quantity_max=NEW.quantity_max,
   stock_count=NEW.count, stock_started_at=CASE WHEN NEW.count IS NOT NULL THEN NEW.confirmed_at END,
   low_stock_threshold=NULL
 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 INSERT INTO stock_movements(owner_id,id,medicine_id,count,unit,occurred_at,kind)
 SELECT NEW.owner_id,NEW.action_id,NEW.medicine_id,NEW.count,NEW.unit,NEW.confirmed_at,'countCorrection'
 WHERE NEW.count IS NOT NULL;
 UPDATE medicine_type_corrections SET result=(SELECT record FROM medicine_records
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id)
 WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;

DROP VIEW medicine_records;
CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(json_patch(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',MAX(m.stock_count,0),'intakePastCount',json(CASE WHEN m.stock_count<0 THEN 'true' ELSE 'false' END)) END, json_patch(
 CASE WHEN m.low_stock_threshold IS NULL THEN '{}' ELSE json_object('threshold',m.low_stock_threshold) END,
 CASE WHEN m.archived_at IS NULL AND m.stock_count<m.low_stock_threshold THEN json_object('low',json('true')) ELSE '{}' END))),
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_edits UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_archives UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_restores UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_stock_actions
   UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_type_corrections) e WHERE e.owner_id=m.owner_id
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
 SELECT previous_details, expected_revision FROM medicine_edits e WHERE e.owner_id=r.owner_id AND e.medicine_id=r.medicine_id AND
   e.strength_revision_id=r.id AND e.kind= 'correctDetails' AND e.previous_details IS NOT NULL
 UNION ALL
 SELECT json_extract(c.previous_details,'$."'||r.id||'"'), expected_revision
 FROM medicine_type_corrections c WHERE c.owner_id=r.owner_id AND c.medicine_id=r.medicine_id
   AND json_extract(c.previous_details,'$."'||r.id||'"') IS NOT NULL
 ORDER BY expected_revision
 )))) AS value FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id AND r.medicine_id=m.id ORDER BY
   r.effective_at,r.sequence
 )))) AS record FROM user_medications m;

-- One review index covers all Schedule slots and the latest, still-present Taken doses.
-- Replaced or removed dose revisions stay in the original history and retry paths.
CREATE VIEW medicine_quantity_amounts AS
 SELECT s.owner_id,s.medicine_id,'schedule' AS kind,s.id,0 AS revision,
   'schedule:'||s.id||':'||slot.key AS key,json_extract(slot.value,'$.quantity') AS quantity,
   json_extract(slot.value,'$.time') AS time
 FROM daily_schedules s,json_each(s.times) slot
 UNION ALL
 SELECT s.owner_id,s.medicine_id,'scheduled',s.id,0,
   'scheduled:'||d.schedule_id||':'||d.due_at,COALESCE(p.quantity,d.quantity),d.taken_at
 FROM dose_records d JOIN daily_schedules s ON s.owner_id=d.owner_id AND s.id=d.schedule_id
 LEFT JOIN medicine_dose_quantity_repairs p ON p.owner_id=d.owner_id
   AND p.dose_key='scheduled:'||d.schedule_id||':'||d.due_at AND p.revision=0
 WHERE NOT EXISTS(SELECT 1 FROM dose_corrections c WHERE c.owner_id=d.owner_id
   AND c.schedule_id=d.schedule_id AND c.due_at=d.due_at)
 UNION ALL
 SELECT s.owner_id,s.medicine_id,'scheduled',s.id,d.revision,
   'scheduled:'||d.schedule_id||':'||d.due_at,COALESCE(p.quantity,d.quantity),d.taken_at
 FROM dose_corrections d JOIN daily_schedules s ON s.owner_id=d.owner_id AND s.id=d.schedule_id
 LEFT JOIN medicine_dose_quantity_repairs p ON p.owner_id=d.owner_id
   AND p.dose_key='scheduled:'||d.schedule_id||':'||d.due_at AND p.revision=d.revision
 WHERE d.outcome='Taken' AND NOT EXISTS(SELECT 1 FROM dose_corrections c WHERE c.owner_id=d.owner_id
   AND c.schedule_id=d.schedule_id AND c.due_at=d.due_at AND c.revision>d.revision)
 UNION ALL
 SELECT d.owner_id,d.medicine_id,'unscheduled',d.id,d.revision,
   'unscheduled:'||d.id,COALESCE(p.quantity,d.quantity),d.taken_at
 FROM unscheduled_doses d
 LEFT JOIN medicine_dose_quantity_repairs p ON p.owner_id=d.owner_id
   AND p.dose_key='unscheduled:'||d.id AND p.revision=d.revision
 WHERE d.removed=0 AND NOT EXISTS(SELECT 1 FROM unscheduled_doses u WHERE u.owner_id=d.owner_id
   AND u.id=d.id AND u.revision>d.revision);

-- Amount overlays affect current reads, including the prior quantity in an intake
-- delta. Movement history keeps the original amounts and units.
DROP TRIGGER dose_corrections_stock;
DROP TRIGGER unscheduled_doses_stock;
CREATE TRIGGER dose_corrections_stock AFTER INSERT ON dose_corrections BEGIN
 INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
   SELECT * FROM (SELECT m.owner_id,m.id,'scheduled:'||NEW.schedule_id||':'||NEW.due_at,NEW.revision,
     COALESCE((SELECT CASE WHEN p.outcome='Taken' AND substr(p.taken_at,1,16)>=substr(m.stock_started_at,1,16)
         THEN COALESCE((SELECT quantity FROM medicine_dose_quantity_repairs q
           WHERE q.owner_id=NEW.owner_id AND q.dose_key='scheduled:'||NEW.schedule_id||':'||NEW.due_at
             AND q.revision=p.revision), p.quantity) ELSE 0 END FROM (
       SELECT outcome,taken_at,quantity,revision FROM dose_corrections WHERE owner_id=NEW.owner_id
         AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at AND revision<NEW.revision
       UNION ALL SELECT outcome,taken_at,quantity,0 FROM dose_records WHERE owner_id=NEW.owner_id
         AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at
       UNION ALL SELECT outcome,NULL,NULL,0 FROM skipped_dose_records WHERE owner_id=NEW.owner_id
         AND schedule_id=NEW.schedule_id AND due_at=NEW.due_at) p ORDER BY p.revision DESC LIMIT 1),0)
     -CASE WHEN NEW.outcome='Taken' AND substr(NEW.taken_at,1,16)>=substr(m.stock_started_at,1,16)
       THEN NEW.quantity ELSE 0 END AS count_change,
     m.unit,NEW.recorded_at
   FROM daily_schedules s JOIN user_medications m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
   WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.stock_count IS NOT NULL)
   WHERE count_change<>0;
END;

CREATE TRIGGER unscheduled_doses_stock AFTER INSERT ON unscheduled_doses BEGIN
 INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
   SELECT * FROM (SELECT m.owner_id,m.id,'unscheduled:'||NEW.id,NEW.revision,
     COALESCE((SELECT CASE WHEN p.removed=0 AND substr(p.taken_at,1,16)>=substr(m.stock_started_at,1,16)
         THEN COALESCE((SELECT quantity FROM medicine_dose_quantity_repairs q
           WHERE q.owner_id=NEW.owner_id AND q.dose_key='unscheduled:'||NEW.id
             AND q.revision=p.revision), p.quantity) ELSE 0 END FROM unscheduled_doses p WHERE p.owner_id=NEW.owner_id AND p.id=NEW.id
         AND p.revision<NEW.revision ORDER BY p.revision DESC LIMIT 1),0)
     -CASE WHEN NEW.removed=0 AND substr(NEW.taken_at,1,16)>=substr(m.stock_started_at,1,16)
       THEN NEW.quantity ELSE 0 END AS count_change,
     m.unit,strftime('%Y-%m-%dT%H:%M:%fZ','now')
   FROM user_medications m WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.stock_count IS NOT NULL)
   WHERE count_change<>0;
END;

-- Period-scoped edits leave a dose receipt's unit paired with its original amount.
DROP TRIGGER medicine_edit_apply;
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
 quantity_scale=CASE WHEN unit=NEW.unit THEN quantity_scale END,
 quantity_max=CASE WHEN unit=NEW.unit THEN quantity_max END,
 strength=(SELECT strength FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 label=(SELECT label FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 unit=(SELECT unit FROM medicine_strength_revisions WHERE owner_id=NEW.owner_id AND
   medicine_id=NEW.medicine_id ORDER BY effective_at DESC, sequence DESC LIMIT 1)
 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE dose_records SET strength=NEW.strength,medicine_label=NEW.label WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE skipped_dose_records SET strength=NEW.strength,medicine_label=NEW.label WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE dose_corrections SET strength=NEW.strength,medicine_label=NEW.label WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND schedule_id IN (SELECT id FROM daily_schedules WHERE
   owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id) AND strength_revision_id=NEW.strength_revision_id;
 UPDATE unscheduled_doses SET strength=NEW.strength,medicine_label=NEW.label WHERE NEW.kind=
   'correctDetails' AND owner_id=NEW.owner_id AND medicine_id=NEW.medicine_id AND
   strength_revision_id=NEW.strength_revision_id;
 UPDATE medicine_edits SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND
   id=NEW.medicine_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
