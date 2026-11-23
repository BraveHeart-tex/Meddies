-- Bound the historical Taken lookup to its owner and Medicine (#468). The aggregate view
-- medicine_latest_taken grouped every owner's dose history before the outer filter applied,
-- so each Medicine read, new receipt and Strength change scanned all three sources. The
-- lookup is now a correlated subquery that searches only the relevant owner and Medicine
-- through daily_schedules_owner_medicine, then the dose_records and dose_corrections keys
-- (CROSS JOIN fixes that order; the planner otherwise reads every dose of the owner), and
-- unscheduled_doses_owner_medicine_taken. Sources and retention are unchanged: original
-- scheduled outcomes, every earlier correction and removed Unscheduled doses still count.
-- medicine_records and medicine_edit_guard are recreated in full, changing only the lookup;
-- the unused view is then dropped. Stored receipts are not rewritten.
DROP TRIGGER medicine_edit_guard;
DROP VIEW medicine_records;
DROP VIEW medicine_latest_taken;

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
