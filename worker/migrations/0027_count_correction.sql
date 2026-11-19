CREATE TABLE stock_movements_backup AS SELECT * FROM stock_movements;
CREATE TABLE medicine_stock_actions_backup AS SELECT * FROM medicine_stock_actions;
DROP TABLE medicine_stock_actions;
DROP TABLE stock_movements;
CREATE TABLE stock_movements (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 count REAL NOT NULL, unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('startingCount','countCorrection')),
 CHECK((unit='tablet' AND count BETWEEN 0 AND 4503599627370495.5 AND count*2=CAST(count*2 AS INTEGER)) OR
   (unit='liquid' AND count BETWEEN 0 AND 900719925474099 AND ROUND(count*10)/10=count) OR
   (unit IN ('capsule','inhaler','drops') AND count BETWEEN 0 AND 4503599627370495.5 AND count=CAST(count AS INTEGER))),
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE medicine_stock_actions (
 owner_id TEXT NOT NULL, action_id TEXT NOT NULL, medicine_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('stockOn','stockOff','stockCorrection')),
 count REAL, unit TEXT, confirmed_at TEXT NOT NULL, request TEXT NOT NULL, result TEXT,
 PRIMARY KEY(owner_id,action_id), UNIQUE(owner_id,medicine_id,expected_revision),
 FOREIGN KEY(owner_id,medicine_id) REFERENCES user_medications(owner_id,id) ON DELETE CASCADE
);
INSERT INTO stock_movements SELECT * FROM stock_movements_backup;
INSERT INTO medicine_stock_actions SELECT * FROM medicine_stock_actions_backup;
DROP TABLE stock_movements_backup;
DROP TABLE medicine_stock_actions_backup;
CREATE TRIGGER medicine_stock_guard BEFORE INSERT ON medicine_stock_actions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_medications WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id
   AND revision=NEW.expected_revision AND archived_at IS NULL AND
   ((NEW.kind='stockOn' AND stock_count IS NULL AND unit=NEW.unit AND NEW.count IS NOT NULL) OR
    (NEW.kind='stockCorrection' AND stock_count IS NOT NULL AND unit=NEW.unit AND NEW.count IS NOT NULL) OR
    (NEW.kind='stockOff' AND stock_count IS NOT NULL AND NEW.count IS NULL))) THEN RAISE(IGNORE) END;
END;
CREATE TRIGGER medicine_stock_apply AFTER INSERT ON medicine_stock_actions BEGIN
 UPDATE user_medications SET stock_count=NEW.count,stock_started_at=CASE WHEN NEW.kind!='stockOff' THEN NEW.confirmed_at ELSE NULL END,
   revision=revision+1 WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id;
 INSERT INTO stock_movements(owner_id,id,medicine_id,count,unit,occurred_at,kind)
   SELECT NEW.owner_id,NEW.action_id,NEW.medicine_id,NEW.count,NEW.unit,NEW.confirmed_at,CASE WHEN NEW.kind='stockOn' THEN 'startingCount' ELSE 'countCorrection' END WHERE NEW.kind!='stockOff';
 UPDATE medicine_stock_actions SET result=(SELECT record FROM medicine_records WHERE owner_id=NEW.owner_id AND id=NEW.medicine_id)
   WHERE owner_id=NEW.owner_id AND action_id=NEW.action_id;
END;
