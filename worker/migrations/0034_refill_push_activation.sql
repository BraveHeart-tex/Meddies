CREATE TABLE refill_push_activation (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);

-- Record launch and forfeit existing episode budgets in the same write.
CREATE TRIGGER refill_push_activate AFTER INSERT ON refill_push_activation
BEGIN
  UPDATE low_stock_episodes SET push_eligible = 0 WHERE push_eligible = 1;
END;
