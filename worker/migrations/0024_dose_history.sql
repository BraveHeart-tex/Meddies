-- Dose history (#386) reads one medication's Taken doses. Scheduled doses reach it through its
-- Schedule versions and the (owner_id, schedule_id, due_at) primary keys; Unscheduled doses through
-- their medication.
CREATE INDEX daily_schedules_owner_medicine ON daily_schedules(owner_id, medicine_id);
CREATE INDEX unscheduled_doses_owner_medicine_taken
 ON unscheduled_doses(owner_id, medicine_id, taken_at);
