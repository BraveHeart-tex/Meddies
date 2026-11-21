-- Low-stock thresholds do not change counts or reconciliation points. Low is derived
-- from the raw count on every read; archived and untracked Medicines never read low.
ALTER TABLE user_medications ADD COLUMN low_stock_threshold REAL;
CREATE TABLE medicine_stock_actions_backup AS SELECT * FROM medicine_stock_actions;
DROP TABLE medicine_stock_actions;
CREATE TABLE medicine_stock_actions (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('stockOn','stockOff','stockCorrection','stockRefill','stockThreshold')),
 count REAL, unit TEXT, confirmed_at TEXT NOT NULL, request TEXT NOT NULL, result TEXT,
 PRIMARY KEY(owner_id,action_id), UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
INSERT INTO medicine_stock_actions SELECT * FROM medicine_stock_actions_backup;
DROP TABLE medicine_stock_actions_backup;
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
         (unit IN ('capsule','inhaler','drops') AND NEW.count<=4503599627370495.5 AND NEW.count=CAST(NEW.count AS INTEGER)))))) OR
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

-- A different Quantity unit needs a new alert, including changes made by an older Worker.
CREATE TRIGGER medicine_threshold_type_change AFTER UPDATE OF unit ON user_medications
WHEN NEW.unit!=OLD.unit BEGIN
 UPDATE user_medications SET low_stock_threshold=NULL WHERE owner_id=NEW.owner_id AND id=NEW.id;
END;

DROP VIEW medicine_records;

CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(json_patch(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',MAX(m.stock_count,0),'intakePastCount',json(CASE WHEN m.stock_count<0 THEN 'true' ELSE 'false' END)) END, json_patch(
 CASE WHEN m.low_stock_threshold IS NULL THEN '{}' ELSE json_object('threshold',m.low_stock_threshold) END,
 CASE WHEN m.archived_at IS NULL AND m.stock_count<m.low_stock_threshold THEN json_object('low',json('true')) ELSE '{}' END))),
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
