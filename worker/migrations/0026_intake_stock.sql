-- Intake changes stock (#47). Each inserted dose version (first log, correction, Unscheduled
-- log, change or removal) records one intake movement with the difference between what its
-- previous and new versions count, and that movement applies to the stored count in the same
-- statement. Retries and refused writes insert no dose row, so they move nothing. A version
-- counts when it is Taken (an Unscheduled one not removed), its Medicine tracks stock, and its
-- Taken time is not in a minute before the latest reconciliation point (stock_started_at).
-- The stored count rounds to tenths and may go below zero; the read shows 0 with a flag.
CREATE TABLE intake_stock_movements (
 owner_id TEXT NOT NULL, medicine_id TEXT NOT NULL, dose_key TEXT NOT NULL, revision INTEGER NOT NULL,
 count_change REAL NOT NULL CHECK(count_change<>0), unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,dose_key,revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
CREATE TRIGGER intake_stock_apply AFTER INSERT ON intake_stock_movements BEGIN
 UPDATE user_medications SET stock_count=ROUND(stock_count+NEW.count_change,1)+0.0
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id AND stock_count IS NOT NULL;
END;

CREATE TRIGGER dose_records_stock AFTER INSERT ON dose_records BEGIN
 INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
   SELECT m.owner_id,m.id,'scheduled:'||NEW.schedule_id||':'||NEW.due_at,0,-NEW.quantity,m.unit,
     strftime('%Y-%m-%dT%H:%M:%fZ','now')
   FROM daily_schedules s JOIN user_medications m ON m.owner_id=s.owner_id AND m.id=s.medicine_id
   WHERE s.owner_id=NEW.owner_id AND s.id=NEW.schedule_id AND m.stock_count IS NOT NULL
     AND substr(NEW.taken_at,1,16)>=substr(m.stock_started_at,1,16);
END;

CREATE TRIGGER dose_corrections_stock AFTER INSERT ON dose_corrections BEGIN
 INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
   SELECT * FROM (SELECT m.owner_id,m.id,'scheduled:'||NEW.schedule_id||':'||NEW.due_at,NEW.revision,
     COALESCE((SELECT CASE WHEN p.outcome='Taken' AND substr(p.taken_at,1,16)>=substr(m.stock_started_at,1,16)
         THEN p.quantity ELSE 0 END FROM (
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
         THEN p.quantity ELSE 0 END FROM unscheduled_doses p WHERE p.owner_id=NEW.owner_id AND p.id=NEW.id
         AND p.revision<NEW.revision ORDER BY p.revision DESC LIMIT 1),0)
     -CASE WHEN NEW.removed=0 AND substr(NEW.taken_at,1,16)>=substr(m.stock_started_at,1,16)
       THEN NEW.quantity ELSE 0 END AS count_change,
     m.unit,strftime('%Y-%m-%dT%H:%M:%fZ','now')
   FROM user_medications m WHERE m.owner_id=NEW.owner_id AND m.id=NEW.medicine_id AND m.stock_count IS NOT NULL)
   WHERE count_change<>0;
END;

-- Doses saved after a starting count but before this migration count once now, so later
-- corrections reconcile against a count that already reflects them.
INSERT INTO intake_stock_movements(owner_id,medicine_id,dose_key,revision,count_change,unit,occurred_at)
SELECT v.owner_id,v.medicine_id,v.dose_key,v.revision,-v.quantity,m.unit,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY owner_id,dose_key ORDER BY revision DESC) AS latest FROM (
  SELECT r.owner_id,s.medicine_id,'scheduled:'||r.schedule_id||':'||r.due_at AS dose_key,0 AS revision,
    1 AS taken,r.taken_at,r.quantity
    FROM dose_records r JOIN daily_schedules s ON s.owner_id=r.owner_id AND s.id=r.schedule_id
  UNION ALL SELECT k.owner_id,s.medicine_id,'scheduled:'||k.schedule_id||':'||k.due_at,0,0,NULL,NULL
    FROM skipped_dose_records k JOIN daily_schedules s ON s.owner_id=k.owner_id AND s.id=k.schedule_id
  UNION ALL SELECT c.owner_id,s.medicine_id,'scheduled:'||c.schedule_id||':'||c.due_at,c.revision,
    c.outcome='Taken',c.taken_at,c.quantity
    FROM dose_corrections c JOIN daily_schedules s ON s.owner_id=c.owner_id AND s.id=c.schedule_id
  UNION ALL SELECT owner_id,medicine_id,'unscheduled:'||id,revision,removed=0,taken_at,quantity
    FROM unscheduled_doses)) v
JOIN user_medications m ON m.owner_id=v.owner_id AND m.id=v.medicine_id
WHERE v.latest=1 AND v.taken=1 AND m.stock_count IS NOT NULL
  AND substr(v.taken_at,1,16)>=substr(m.stock_started_at,1,16);

DROP VIEW medicine_records;

CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',MAX(m.stock_count,0),'intakePastCount',json(CASE WHEN m.stock_count<0 THEN 'true' ELSE 'false' END)) END),
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_edits UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_archives UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_restores UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_stock_actions) e WHERE e.owner_id=m.owner_id
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
