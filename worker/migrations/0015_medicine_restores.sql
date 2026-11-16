-- Restore (#323) changes only the Medicine and its exact retry receipt in one write.
-- The archive stop version stays the head: no schedule, reminder or dose is restarted.
CREATE TABLE medicine_restores (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, confirmed_at TEXT NOT NULL, request TEXT NOT NULL,
 result TEXT,
 PRIMARY KEY(owner_id,action_id),
 UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id)
);
CREATE TRIGGER medicine_restore_guard BEFORE INSERT ON medicine_restores BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision AND archived_at IS NOT NULL) THEN RAISE(IGNORE) END;
END;
CREATE TRIGGER medicine_restore_apply AFTER INSERT ON medicine_restores BEGIN
 UPDATE user_medications SET archived_at=NULL,revision=revision+1
   WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 UPDATE medicine_restores SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND
   id=NEW.medicine_id) WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
-- lastActionId spans edits, archives and restores, including pre-migration records.
DROP VIEW medicine_records;
CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_edits UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_archives UNION ALL SELECT owner_id,medicine_id,action_id,expected_revision FROM medicine_restores) e WHERE e.owner_id=m.owner_id
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
