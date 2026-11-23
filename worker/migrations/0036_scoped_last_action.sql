-- Bound the Medicine lastActionId lookup to its owner and Medicine (#470). The lookup
-- filtered a UNION ALL of the five Medicine action receipt tables outside the union, so
-- each Medicine read and new receipt scanned every owner's receipts. Each branch now
-- filters by owner and Medicine and searches its UNIQUE(owner_id,medicine_id,
-- expected_revision) index; lastActionId is still the action with the highest expected
-- revision. medicine_records is recreated in full, changing only that lookup. Stored
-- receipts are not rewritten.
DROP VIEW medicine_records;

CREATE VIEW medicine_records AS SELECT m.owner_id,m.id,m.label,
 json_object('id',m.id,'label',m.label,'strength',m.strength,'unit',m.unit,
 'stock',json(json_patch(CASE WHEN m.stock_count IS NULL THEN json_object('tracked',json('false')) ELSE json_object('tracked',json('true'),'count',MAX(m.stock_count,0),'intakePastCount',json(CASE WHEN m.stock_count<0 THEN 'true' ELSE 'false' END)) END, json_patch(
 CASE WHEN m.low_stock_threshold IS NULL THEN '{}' ELSE json_object('threshold',m.low_stock_threshold) END,
 CASE WHEN m.archived_at IS NULL AND m.stock_count<m.low_stock_threshold THEN json_object('low',json('true')) ELSE '{}' END))),
 'revision' ,m.revision, 'archivedAt' ,m.archived_at, 'lastActionId' ,(SELECT action_id FROM (
   SELECT action_id,expected_revision FROM medicine_edits WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_archives WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_restores WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_stock_actions WHERE owner_id=m.owner_id AND medicine_id=m.id
   UNION ALL SELECT action_id,expected_revision FROM medicine_type_corrections WHERE owner_id=m.owner_id AND medicine_id=m.id)
   ORDER BY expected_revision DESC LIMIT 1), 'everHadSchedule' ,json(CASE
   m.ever_had_schedule WHEN 1 THEN 'true' ELSE 'false' END),
 'everHadDose',json(CASE m.ever_had_dose WHEN 1 THEN 'true' ELSE 'false' END),
 'latestTakenAt' ,(SELECT MAX(taken_at) FROM (
   SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_records d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=m.owner_id AND s.medicine_id=m.id
   UNION ALL SELECT d.taken_at FROM daily_schedules s CROSS JOIN dose_corrections d ON d.owner_id=s.owner_id AND
     d.schedule_id=s.id WHERE s.owner_id=m.owner_id AND s.medicine_id=m.id AND d.taken_at IS NOT NULL
   UNION ALL SELECT u.taken_at FROM unscheduled_doses u WHERE u.owner_id=m.owner_id AND u.medicine_id=m.id)),
 'currentStrengthRevisionId' ,(SELECT id FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id AND
   r.medicine_id=m.id ORDER BY effective_at DESC, sequence DESC LIMIT 1),
 'strengthRevisions',json((SELECT json_group_array(json(value)) FROM (
 SELECT json_object( 'id' ,r.id, 'strength' ,r.strength, 'label' ,r.label, 'unit' ,r.unit, 'effectiveAt'
   ,r.effective_at,
 'previousValues',json((SELECT json_group_array(json(previous_details)) FROM (
 SELECT previous_details, expected_revision FROM medicine_edits e WHERE e.owner_id=r.owner_id AND e.medicine_id=r.medicine_id AND
   e.strength_revision_id=r.id AND e.kind= 'correctDetails' AND e.previous_details IS NOT NULL
 UNION ALL
 SELECT json_extract(c.previous_details,'$."'||r.id||'"'), expected_revision
 FROM medicine_type_corrections c WHERE c.owner_id=r.owner_id AND c.medicine_id=r.medicine_id
   AND json_extract(c.previous_details,'$."'||r.id||'"') IS NOT NULL
 ORDER BY expected_revision
 )))) AS value FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id AND r.medicine_id=m.id ORDER BY
   r.effective_at,r.sequence
 )))) AS record FROM user_medications m;
