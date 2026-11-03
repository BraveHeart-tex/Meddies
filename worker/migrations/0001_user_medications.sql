CREATE TABLE user_medications (
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 8 AND 255),
  id TEXT NOT NULL CHECK(length(id) = 36),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
  strength TEXT CHECK(strength IS NULL OR length(trim(strength)) BETWEEN 1 AND 120),
  unit TEXT NOT NULL CHECK(unit IN ('tablet', 'capsule')),
  PRIMARY KEY (owner_id, id)
);
