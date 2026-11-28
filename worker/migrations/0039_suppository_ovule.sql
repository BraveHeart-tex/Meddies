-- Replace only the constrained Type column. The Medicine table, its keys and all
-- dependent records stay in place, so existing foreign-key cascades never run.
ALTER TABLE user_medications ADD COLUMN replacement_unit TEXT
 CHECK(replacement_unit IN ('tablet', 'capsule', 'liquid', 'inhaler', 'drops', 'suppository', 'ovule'));
UPDATE user_medications SET replacement_unit=unit;

-- SQLite requires the dependent schema to remain valid during ALTER TABLE.
DROP TRIGGER medicine_archive_apply;
DROP TRIGGER medicine_restore_apply;
DROP TRIGGER medicine_initial_strength;
DROP TRIGGER dose_records_stock;
DROP TRIGGER medicine_stock_guard;
DROP TRIGGER medicine_stock_apply;
DROP TRIGGER medicine_threshold_type_change;
DROP TRIGGER medicine_unit_lock;
DROP TRIGGER medicine_type_correction_guard;
DROP TRIGGER medicine_type_correction_apply;
DROP TRIGGER dose_corrections_stock;
DROP TRIGGER unscheduled_doses_stock;
DROP TRIGGER medicine_edit_apply;
DROP TRIGGER medicine_low_stock_episode;
DROP TRIGGER medicine_edit_guard;
DROP TRIGGER medicine_quantity_schedule_guard;
DROP TRIGGER medicine_quantity_taken_guard;
DROP TRIGGER medicine_quantity_scheduled_revision_guard;
DROP TRIGGER medicine_quantity_unscheduled_revision_guard;
DROP VIEW medicine_records;

ALTER TABLE user_medications DROP COLUMN unit;
ALTER TABLE user_medications RENAME COLUMN replacement_unit TO unit;

-- Only the Stock movement leaf table is replaced. Preserve the original movement
-- order and receipts, and widen its whole-count check to include both new Types.
CREATE TABLE stock_movements_replacement (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 count REAL NOT NULL, unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('startingCount','countCorrection','refill')),
 CHECK(kind!='refill' OR count>0),
 CHECK((unit='tablet' AND count BETWEEN 0 AND 4503599627370495.5 AND count*2=CAST(count*2 AS INTEGER)) OR
   (unit='liquid' AND count BETWEEN 0 AND 900719925474099 AND ROUND(count*10)/10=count) OR
   (unit IN ('capsule','inhaler','drops','suppository','ovule') AND count BETWEEN 0 AND 4503599627370495.5 AND count=CAST(count AS INTEGER))),
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);

INSERT INTO stock_movements_replacement(rowid,owner_id,id,medicine_id,count,unit,occurred_at,kind)
 SELECT rowid,owner_id,id,medicine_id,count,unit,occurred_at,kind FROM stock_movements;
DROP TABLE stock_movements;
ALTER TABLE stock_movements_replacement RENAME TO stock_movements;

-- The replacement column is nullable during the copy. These guards restore the
-- requirement that every Medicine has a Type on subsequent writes.
CREATE TRIGGER medicine_unit_required_insert BEFORE INSERT ON user_medications
WHEN NEW.unit IS NULL BEGIN
 SELECT RAISE(ABORT,'medicine_unit_required');
END;
CREATE TRIGGER medicine_unit_required_update BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit IS NULL BEGIN
 SELECT RAISE(ABORT,'medicine_unit_required');
END;

-- New Medicines use the whole-unit grid from their first write, even before a
-- Detail correction has set quantity_scale and quantity_max.
CREATE VIEW medicine_quantity_bounds AS
 SELECT owner_id,id,
   CASE WHEN unit IN ('suppository','ovule') THEN 1 ELSE quantity_scale END AS quantity_scale,
   CASE WHEN unit IN ('suppository','ovule') THEN 4503599627370495 ELSE quantity_max END AS quantity_max
 FROM user_medications;

CREATE TRIGGER medicine_quantity_schedule_guard BEFORE INSERT ON daily_schedules
WHEN EXISTS (
 SELECT 1 FROM medicine_quantity_bounds m, json_each(NEW.times) slot
 WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.quantity_scale IS NOT NULL
 AND NOT COALESCE((json_type(slot.value,'$.quantity') IN ('integer','real')
     AND json_extract(slot.value,'$.quantity') BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(json_extract(slot.value,'$.quantity')*m.quantity_scale)/m.quantity_scale=json_extract(slot.value,'$.quantity')),0)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;

CREATE TRIGGER medicine_quantity_taken_guard BEFORE INSERT ON dose_records
WHEN EXISTS (
 SELECT 1 FROM daily_schedules s JOIN medicine_quantity_bounds m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
 WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;

CREATE TRIGGER medicine_quantity_scheduled_revision_guard BEFORE INSERT ON dose_corrections
WHEN NEW.outcome='Taken' AND EXISTS (
 SELECT 1 FROM daily_schedules s JOIN medicine_quantity_bounds m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
 WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;

CREATE TRIGGER medicine_quantity_unscheduled_revision_guard BEFORE INSERT ON unscheduled_doses
WHEN NEW.removed=0 AND EXISTS (
 SELECT 1 FROM medicine_quantity_bounds m
 WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.quantity_scale IS NOT NULL
   AND NOT (NEW.quantity BETWEEN 1.0/m.quantity_scale AND m.quantity_max
     AND ROUND(NEW.quantity*m.quantity_scale)/m.quantity_scale=NEW.quantity)
) BEGIN
 SELECT RAISE(ABORT, 'medicine_quantity_changed');
END;

-- Restore the triggers and record view from migrations 0014 through 0036. The Stock
-- action guard now also accepts the two new Types' whole-unit thresholds.
CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(json_patch(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',MAX(m.stock_count,0),'intakePastCount',json(CASE WHEN m.stock_count<0 THEN 'true' ELSE 'false' END)) END, json_patch(
 CASE WHEN m.low_stock_threshold IS NULL THEN '{}' ELSE json_object('threshold',m.low_stock_threshold) END,
 CASE WHEN m.archived_at IS NULL AND m.stock_count<m.low_stock_threshold THEN json_object('low',json('true')) ELSE '{}' END))),
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (
   SELECT action_id,expected_revision FROM medicine_edits WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_archives WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_restores WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_stock_actions WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_type_corrections WHERE owner_id=m.owner_id AND medicine_id=m.id)
   ORDER BY expected_revision DESC LIMIT 1), 'everHadSchedule' ,json(CASE
   m.ever_had_schedule WHEN 1 THEN 'true' ELSE 'false' END),
 'everHadDose',json(CASE m.ever_had_dose WHEN 1 THEN 'true' ELSE 'false' END),
 'latestTakenAt' ,(SELECT MAX(taken_at) FROM (
   SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_records d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=m.owner_id AND s.medicine_id=m.id
   UNION ALL SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_corrections d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=m.owner_id AND s.medicine_id=m.id AND d.taken_at IS NOT NULL
   UNION ALL SELECT u.taken_at FROM unscheduled_doses u WHERE u.owner_id=m.owner_id AND u.medicine_id=m.id)),
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

CREATE TRIGGER medicine_restore_apply AFTER INSERT ON medicine_restores BEGIN
 UPDATE user_medications SET archived_at=NULL,revision=revision+1
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE medicine_restores SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND
   id=NEW.medicine_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;

CREATE TRIGGER medicine_initial_strength AFTER INSERT ON user_medications BEGIN
  INSERT INTO medicine_strength_revisions VALUES(NEW.owner_id, NEW.id, NEW.id, NEW.strength, NEW.label,
    NEW.unit, '0001-01-01T00:00:00.000Z' , 0);
  UPDATE user_medications SET creation_request=json_object( 'label' ,NEW.label, 'strength' ,NEW.strength,
    'unit' ,NEW.unit, 'startingCount',NEW.starting_count)
    WHERE owner_id=NEW.owner_id AND id=NEW.id;
  UPDATE user_medications SET creation_request=json_remove(creation_request,'$.startingCount') WHERE owner_id=NEW.owner_id AND id=NEW.id AND NEW.starting_count IS NULL;
  UPDATE user_medications SET stock_count=NEW.starting_count WHERE owner_id=NEW.owner_id AND id=NEW.id;
  INSERT INTO stock_movements(owner_id,id,medicine_id,count,unit,occurred_at,kind)
    SELECT NEW.owner_id,NEW.id,NEW.id,NEW.starting_count,NEW.unit,NEW.stock_started_at,'startingCount' WHERE NEW.starting_count IS NOT NULL;
  UPDATE user_medications SET creation_result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id
    AND id=NEW.id) WHERE owner_id=NEW.owner_id AND id=NEW.id;
END;

CREATE TRIGGER dose_records_stock AFTER INSERT ON dose_records BEGIN
 INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
   SELECT m.owner_id,m.id,'scheduled:'||NEW.schedule_id||':'||NEW.due_at,0,-NEW.quantity,m.unit,
     strftime('%Y-%m-%dT%H:%M:%fZ','now')
   FROM daily_schedules s JOIN user_medications m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
   WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.stock_count IS NOT NULL
     AND substr(NEW.taken_at,1,16)>=substr(m.stock_started_at,1,16);
END;

CREATE TRIGGER medicine_stock_guard BEFORE INSERT ON medicine_stock_actions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision AND archived_at IS NULL AND
   ((NEW.kind='stockOn' AND stock_count IS NULL AND unit=NEW.unit AND NEW.count IS NOT NULL) OR
    (NEW.kind='stockRefill' AND stock_count IS NOT NULL AND unit=NEW.unit AND NEW.count>0
      AND MAX(stock_count,0)<=CASE WHEN unit='liquid' THEN 900719925474099 ELSE 4503599627370495.5 END-NEW.count) OR
    (NEW.kind='stockCorrection' AND stock_count IS NOT NULL AND unit=NEW.unit AND NEW.count IS NOT NULL) OR
    (NEW.kind='stockThreshold' AND stock_count IS NOT NULL AND unit=NEW.unit AND
      (NEW.count IS NULL OR (NEW.count>0 AND
        ((unit='tablet' AND NEW.count<=4503599627370495.5 AND NEW.count*2=CAST(NEW.count*2 AS INTEGER)) OR
         (unit='liquid' AND NEW.count<=900719925474099 AND ROUND(NEW.count*10)/10=NEW.count) OR
         (unit IN ('capsule','inhaler','drops','suppository','ovule') AND NEW.count<=4503599627370495.5 AND NEW.count=CAST(NEW.count AS INTEGER)))))) OR
    (NEW.kind='stockOff' AND stock_count IS NOT NULL AND NEW.count IS NULL))) THEN RAISE(IGNORE) END;
END;

CREATE TRIGGER medicine_stock_apply AFTER INSERT ON medicine_stock_actions BEGIN
 UPDATE user_medications SET
   low_stock_threshold=CASE WHEN NEW.kind='stockThreshold' THEN NEW.count ELSE low_stock_threshold END,
   stock_started_at=CASE WHEN NEW.kind='stockThreshold' THEN stock_started_at WHEN NEW.kind='stockOff' THEN NULL
     WHEN NEW.kind='stockRefill' AND stock_count>=0 THEN stock_started_at ELSE NEW.confirmed_at END,
   stock_count=CASE WHEN NEW.kind='stockThreshold' THEN stock_count WHEN NEW.kind='stockRefill' THEN ROUND(MAX(stock_count,0)+NEW.count,1)+0.0 ELSE NEW.count END,
   revision=revision+1 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 INSERT INTO stock_movements(owner_id,id,medicine_id,count,unit,occurred_at,kind)
   SELECT NEW.owner_id,NEW.action_id,NEW.medicine_id,NEW.count,NEW.unit,NEW.confirmed_at,CASE WHEN NEW.kind='stockOn' THEN 'startingCount' WHEN NEW.kind='stockRefill' THEN 'refill' ELSE 'countCorrection' END WHERE NEW.kind NOT IN ('stockOff','stockThreshold');
 UPDATE medicine_stock_actions SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id)
   WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;

CREATE TRIGGER medicine_threshold_type_change AFTER UPDATE OF unit ON user_medications
WHEN NEW.unit!=OLD.unit BEGIN
 UPDATE user_medications SET low_stock_threshold=NULL WHERE owner_id=NEW.owner_id AND id=NEW.id;
END;

CREATE TRIGGER medicine_unit_lock BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit != OLD.unit AND (OLD.ever_had_schedule=1 OR OLD.ever_had_dose=1 OR OLD.stock_count IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM medicine_type_corrections c
   WHERE c.owner_id=OLD.owner_id AND c.medicine_id=OLD.id AND c.expected_revision=OLD.revision
     AND NEW.revision=OLD.revision+1 AND c.from_unit=OLD.unit AND c.unit=NEW.unit)
BEGIN
 SELECT RAISE(ABORT, 'medicine_unit_locked');
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
 NEW.effective_at > NEW.confirmed_at OR NEW.effective_at < COALESCE((SELECT MAX(taken_at) FROM (
   SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_records d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=NEW.owner_id AND s.medicine_id=NEW.medicine_id
   UNION ALL SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_corrections d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=NEW.owner_id AND s.medicine_id=NEW.medicine_id AND
     d.taken_at IS NOT NULL
   UNION ALL SELECT u.taken_at FROM unscheduled_doses u WHERE u.owner_id=NEW.owner_id AND
     u.medicine_id=NEW.medicine_id)),
   '0001-01-01T00:00:00.000Z' )
 ) THEN RAISE(ABORT,'medicine_strength_time') END;
END;
