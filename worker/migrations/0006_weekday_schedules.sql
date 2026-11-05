ALTER TABLE daily_schedules ADD COLUMN weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]' CHECK(json_valid(weekdays) AND json_array_length(weekdays) BETWEEN 1 AND 7);
ALTER TABLE daily_schedules ADD COLUMN end_date TEXT CHECK(end_date IS NULL OR length(end_date) = 10);
