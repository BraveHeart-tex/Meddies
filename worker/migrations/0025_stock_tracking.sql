-- Stock is independent of dose history. Starting counts reconcile at server time;
-- turning off clears the current count but retains movements and immutable receipts.
ALTER TABLE user_medications ADD COLUMN starting_count REAL;
ALTER TABLE user_medications ADD COLUMN stock_count REAL;
ALTER TABLE user_medications ADD COLUMN stock_started_at TEXT;
CREATE TABLE stock_movements (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 count REAL NOT NULL, unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind='startingCount'),
 CHECK((unit='tablet' AND count BETWEEN 0 AND 4503599627370495.5 AND count*2=CAST(count*2 AS INTEGER)) OR
   (unit='liquid' AND count BETWEEN 0 AND 900719925474099 AND ROUND(count*10)/10=count) OR
   (unit IN ('capsule','inhaler','drops') AND count BETWEEN 0 AND 4503599627370495.5 AND count=CAST(count AS INTEGER))),
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE medicine_stock_actions (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('stockOn','stockOff')),
 count REAL, unit TEXT, confirmed_at TEXT NOT NULL, request TEXT NOT NULL, result TEXT,
 PRIMARY KEY(owner_id,action_id), UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
CREATE TRIGGER medicine_stock_guard BEFORE INSERT ON medicine_stock_actions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision AND archived_at IS NULL AND
   ((NEW.kind='stockOn' AND stock_count IS NULL AND unit=NEW.unit AND NEW.count IS NOT NULL) OR
    (NEW.kind='stockOff' AND stock_count IS NOT NULL AND NEW.count IS NULL))) THEN RAISE(IGNORE) END;
END;
CREATE TRIGGER medicine_stock_apply AFTER INSERT ON medicine_stock_actions BEGIN
 UPDATE user_medications SET stock_count=NEW.count,stock_started_at=CASE WHEN NEW.kind='stockOn' THEN NEW.confirmed_at ELSE NULL END,
   revision=revision+1 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 INSERT INTO stock_movements(owner_id,id,medicine_id,count,unit,occurred_at,kind)
   SELECT NEW.owner_id,NEW.action_id,NEW.medicine_id,NEW.count,NEW.unit,NEW.confirmed_at,'startingCount' WHERE NEW.kind='stockOn';
 UPDATE medicine_stock_actions SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id)
   WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
CREATE TRIGGER medicine_stock_unit_lock BEFORE UPDATE OF unit ON user_medications
WHEN NEW.unit!=OLD.unit AND OLD.stock_count IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'medicine_unit_locked');
END;
DROP VIEW medicine_records;

CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',m.stock_count) END),
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

DROP TRIGGER medicine_initial_strength;
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
