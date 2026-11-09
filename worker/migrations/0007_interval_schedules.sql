ALTER TABLE daily_schedules ADD COLUMN interval_hours INTEGER CHECK(interval_hours IS NULL OR (typeof(interval_hours) = 'integer' AND interval_hours BETWEEN 1 AND 24));
