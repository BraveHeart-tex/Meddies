-- Delivery attempts are never deleted, so their reads must search an index, not scan (#422).
-- The Healthy run check reads one attempt window across owners; the final-answer lookup reads
-- one owner's due instant and reminder.
CREATE INDEX delivery_attempts_attempted ON delivery_attempts(attempted_at, outcome);
CREATE INDEX delivery_attempts_final ON delivery_attempts(owner_id, due_at, reminder);
