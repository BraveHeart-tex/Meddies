ALTER TABLE low_stock_episodes ADD COLUMN targets_selected INTEGER NOT NULL DEFAULT 0
  CHECK (targets_selected IN (0, 1));

CREATE TABLE refill_targets (
  episode_id TEXT NOT NULL REFERENCES low_stock_episodes(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  PRIMARY KEY (episode_id, installation_id)
);
CREATE INDEX refill_targets_installation ON refill_targets(installation_id) WHERE revoked = 0;

CREATE TRIGGER refill_select_targets AFTER UPDATE OF targets_selected ON low_stock_episodes
WHEN OLD.targets_selected = 0 AND NEW.targets_selected = 1
BEGIN
  INSERT INTO refill_targets(episode_id, installation_id)
  SELECT NEW.id, installation_id FROM device_registrations WHERE owner_id = NEW.owner_id;
END;

-- Renewing a token preserves the registration. Removal or a change of owner ends it.
CREATE TRIGGER refill_revoke_removed_registration AFTER DELETE ON device_registrations
BEGIN
  UPDATE refill_targets SET revoked = 1 WHERE installation_id = OLD.installation_id AND revoked = 0;
END;

CREATE TRIGGER refill_revoke_transferred_registration AFTER UPDATE OF owner_id ON device_registrations
WHEN OLD.owner_id != NEW.owner_id
BEGIN
  UPDATE refill_targets SET revoked = 1 WHERE installation_id = OLD.installation_id AND revoked = 0;
END;

-- Attempts survive the end of an episode. A committed indeterminate attempt authorizes
-- exactly one provider call. It never becomes retryable without a known provider answer.
CREATE TABLE refill_delivery_attempts (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('indeterminate', 'accepted', 'retryable', 'rejected'))
);
CREATE INDEX refill_attempts_target ON refill_delivery_attempts(episode_id, installation_id, id DESC);

CREATE VIEW eligible_refill_episodes AS
SELECT e.id, e.owner_id, e.medicine_id, e.targets_selected, m.label
FROM low_stock_episodes e
JOIN user_medications m ON m.owner_id = e.owner_id AND m.id = e.medicine_id
WHERE e.push_eligible = 1 AND m.archived_at IS NULL AND m.stock_count < m.low_stock_threshold;

CREATE VIEW eligible_refill_targets AS
SELECT e.id AS episode_id, t.installation_id, a.id AS previous_attempt_id
FROM eligible_refill_episodes e
JOIN refill_targets t ON t.episode_id = e.id AND t.revoked = 0
JOIN device_registrations d ON d.installation_id = t.installation_id AND d.owner_id = e.owner_id
LEFT JOIN refill_delivery_attempts a ON a.id = (
  SELECT id FROM refill_delivery_attempts
  WHERE episode_id = e.id AND installation_id = t.installation_id
  ORDER BY id DESC LIMIT 1
)
WHERE a.id IS NULL OR a.outcome = 'retryable';
