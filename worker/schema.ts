import {
  sqliteTable,
  text,
  primaryKey,
  unique,
  foreignKey,
  real,
  index,
  uniqueIndex,
  check,
  integer,
} from 'drizzle-orm/sqlite-core'
import { writableMedicineTypes } from '../src/lib/quantity-policy'
import { sql } from 'drizzle-orm'

export const userMedications = sqliteTable(
  'user_medications',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    label: text('label').notNull(),
    strength: text('strength'),
    revision: integer('revision').notNull().default(0),
    archivedAt: text('archived_at'),
    everHadSchedule: integer('ever_had_schedule', { mode: 'boolean' }).notNull().default(false),
    everHadDose: integer('ever_had_dose', { mode: 'boolean' }).notNull().default(false),
    startingCount: real('starting_count'),
    stockCount: real('stock_count'),
    lowStockThreshold: real('low_stock_threshold'),
    quantityReviewRevision: integer('quantity_review_revision').notNull().default(0),
    quantityScale: integer('quantity_scale'),
    quantityMax: real('quantity_max'),
    stockStartedAt: text('stock_started_at'),
    creationRequest: text('creation_request'),
    creationResult: text('creation_result'),
    unit: text('unit', { enum: writableMedicineTypes }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    // Reserve approved Types in storage; the shared policy controls Worker acceptance.
    check(
      'user_medications_unit',
      sql`${table.unit} IN ('tablet', 'capsule', 'liquid', 'inhaler', 'drops')`,
    ),
  ],
)

export const dailySchedules = sqliteTable(
  'daily_schedules',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    medicineId: text('medicine_id').notNull(),
    startDate: text('start_date').notNull(),
    times: text('times', { mode: 'json' }).$type<{ time: string; quantity: number }[]>().notNull(),
    originalTimes: text('original_times', { mode: 'json' }).$type<
      { time: string; quantity: number }[]
    >(),
    confirmedAt: text('confirmed_at').notNull(),
    weekdays: text('weekdays', { mode: 'json' })
      .$type<number[]>()
      .notNull()
      .default([0, 1, 2, 3, 4, 5, 6]),
    endDate: text('end_date'),
    intervalHours: integer('interval_hours'),
    basedOnId: text('based_on_id'),
    editRequest: text('edit_request'),
    stoppedAt: text('stopped_at'),
    pausedAt: text('paused_at'),
    anchorDate: text('anchor_date'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    unique().on(table.ownerId, table.basedOnId),
    uniqueIndex('daily_schedules_initial')
      .on(table.ownerId, table.medicineId)
      .where(sql`${table.basedOnId} IS NULL`),
    index('daily_schedules_owner_medicine').on(table.ownerId, table.medicineId),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
  ],
)

export const doseRecords = sqliteTable(
  'dose_records',
  {
    strengthRevisionId: text('strength_revision_id'),
    strength: text('strength'),
    originalStrength: text('original_strength'),
    medicineLabel: text('medicine_label'),
    unit: text('unit'),
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    takenAt: text('taken_at').notNull(),
    quantity: real('quantity').notNull(),
    outcome: text('outcome', { enum: ['Taken'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt] }),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('dose_records_owner_due').on(table.ownerId, table.dueAt),
    check('dose_records_outcome', sql`${table.outcome} = 'Taken'`),
  ],
)

export const skippedDoseRecords = sqliteTable(
  'skipped_dose_records',
  {
    strengthRevisionId: text('strength_revision_id'),
    strength: text('strength'),
    originalStrength: text('original_strength'),
    medicineLabel: text('medicine_label'),
    unit: text('unit'),
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    outcome: text('outcome', { enum: ['Skipped'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt] }),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('skipped_dose_records_owner_due').on(table.ownerId, table.dueAt),
    check('skipped_dose_records_outcome', sql`${table.outcome} = 'Skipped'`),
  ],
)

export const doseCorrections = sqliteTable(
  'dose_corrections',
  {
    strengthRevisionId: text('strength_revision_id'),
    strength: text('strength'),
    originalStrength: text('original_strength'),
    medicineLabel: text('medicine_label'),
    unit: text('unit'),
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    revision: integer('revision').notNull(),
    actionId: text('action_id').notNull(),
    expectedOutcome: text('expected_outcome', { enum: ['Taken', 'Skipped'] }).notNull(),
    outcome: text('outcome', { enum: ['Taken', 'Skipped'] }).notNull(),
    takenAt: text('taken_at'),
    quantity: real('quantity'),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt, table.revision] }),
    unique().on(table.ownerId, table.actionId),
    foreignKey({
      columns: [table.ownerId, table.scheduleId],
      foreignColumns: [dailySchedules.ownerId, dailySchedules.id],
    }),
    index('dose_corrections_owner_due').on(table.ownerId, table.dueAt),
    check('dose_corrections_outcome', sql`${table.outcome} IN ('Taken', 'Skipped')`),
    check(
      'dose_corrections_expected_outcome',
      sql`${table.expectedOutcome} IN ('Taken', 'Skipped')`,
    ),
    check(
      'dose_corrections_details',
      sql`(${table.outcome} = 'Taken' AND ${table.takenAt} IS NOT NULL AND ${table.quantity} IS NOT NULL AND ${table.quantity} > 0) OR (${table.outcome} = 'Skipped' AND ${table.takenAt} IS NULL AND ${table.quantity} IS NULL)`,
    ),
  ],
)

export const unscheduledDoses = sqliteTable(
  'unscheduled_doses',
  {
    strengthRevisionId: text('strength_revision_id'),
    strength: text('strength'),
    originalStrength: text('original_strength'),
    medicineLabel: text('medicine_label'),
    unit: text('unit'),
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    revision: integer('revision').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    takenAt: text('taken_at').notNull(),
    quantity: real('quantity').notNull(),
    removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
    request: text('request').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id, table.revision] }),
    unique().on(table.ownerId, table.actionId),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
    index('unscheduled_doses_owner_taken').on(table.ownerId, table.takenAt),
    index('unscheduled_doses_owner_medicine_taken').on(
      table.ownerId,
      table.medicineId,
      table.takenAt,
    ),
    check('unscheduled_doses_revision', sql`${table.revision} >= 0`),
    check('unscheduled_doses_quantity', sql`${table.quantity} > 0`),
    check('unscheduled_doses_removed', sql`${table.removed} IN (0, 1)`),
  ],
)

export const medicineStrengthRevisions = sqliteTable(
  'medicine_strength_revisions',
  {
    ownerId: text('owner_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    id: text('id').notNull(),
    strength: text('strength'),
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    effectiveAt: text('effective_at').notNull(),
    sequence: integer('sequence').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.medicineId, table.id] }),
    unique().on(table.ownerId, table.medicineId, table.sequence),
    index('medicine_strength_effective').on(
      table.ownerId,
      table.medicineId,
      table.effectiveAt,
      table.sequence,
    ),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
  ],
)

export const medicineEdits = sqliteTable(
  'medicine_edits',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    kind: text('kind', { enum: ['correctDetails', 'changeStrength'] }).notNull(),
    strengthRevisionId: text('strength_revision_id').notNull(),
    strength: text('strength'),
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    effectiveAt: text('effective_at'),
    confirmedAt: text('confirmed_at').notNull(),
    request: text('request').notNull(),
    previousDetails: text('previous_details'),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId, table.expectedRevision),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
    check('medicine_edits_kind', sql`${table.kind} IN ('correctDetails','changeStrength')`),
  ],
)

export const medicineTypeCorrections = sqliteTable(
  'medicine_type_corrections',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    reviewRevision: integer('review_revision').notNull(),
    fromUnit: text('from_unit').notNull(),
    unit: text('unit').notNull(),
    quantityScale: integer('quantity_scale').notNull(),
    quantityMax: real('quantity_max').notNull(),
    confirmedAt: text('confirmed_at').notNull(),
    count: real('count'),
    request: text('request').notNull(),
    repairs: text('repairs').notNull(),
    strengthRevisionId: text('strength_revision_id'),
    label: text('label'),
    strength: text('strength'),
    previousDetails: text('previous_details'),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId, table.expectedRevision),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }).onDelete('cascade'),
  ],
)

export const medicineDoseQuantityRepairs = sqliteTable(
  'medicine_dose_quantity_repairs',
  {
    ownerId: text('owner_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    doseKey: text('dose_key').notNull(),
    revision: integer('revision').notNull(),
    quantity: real('quantity').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.doseKey, table.revision] }),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }).onDelete('cascade'),
  ],
)

export const medicineArchives = sqliteTable(
  'medicine_archives',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    confirmedAt: text('confirmed_at').notNull(),
    request: text('request').notNull(),
    stoppedScheduleId: text('stopped_schedule_id'),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId, table.expectedRevision),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
  ],
)

export const medicineRestores = sqliteTable(
  'medicine_restores',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    confirmedAt: text('confirmed_at').notNull(),
    request: text('request').notNull(),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId, table.expectedRevision),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }),
  ],
)

// No Medicine FK: deletion receipts and facts must survive the deleted record.
export const medicineDeletions = sqliteTable(
  'medicine_deletions',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    deletedAt: text('deleted_at').notNull(),
    request: text('request').notNull(),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId),
  ],
)

// One row per Firebase installation; saving from another account moves it (#353).
export const deviceRegistrations = sqliteTable(
  'device_registrations',
  {
    installationId: text('installation_id').primaryKey().notNull(),
    ownerId: text('owner_id').notNull(),
    token: text('token').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('device_registrations_owner').on(table.ownerId)],
)

// One row per Occurrence a due-reminder run found in its window; claims lease it (#366).
export const originalReminders = sqliteTable(
  'original_reminders',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    state: text('state', { enum: ['pending', 'submitted', 'dropped'] })
      .notNull()
      .default('pending'),
    claimToken: text('claim_token'),
    leaseUntil: text('lease_until'),
    settledAt: text('settled_at'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt] }),
    index('original_reminders_state_due').on(table.state, table.dueAt),
    check('original_reminders_state', sql`${table.state} IN ('pending', 'submitted', 'dropped')`),
  ],
)

// One row per Follow-up reminder a due-reminder run found due (#31): reminder 1 at due +40
// minutes, 2 at due +80. Claims lease it as for Original reminders.
export const followUpReminders = sqliteTable(
  'follow_up_reminders',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    reminder: integer('reminder').notNull(),
    state: text('state', { enum: ['pending', 'submitted', 'dropped'] })
      .notNull()
      .default('pending'),
    claimToken: text('claim_token'),
    leaseUntil: text('lease_until'),
    settledAt: text('settled_at'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt, table.reminder] }),
    index('follow_up_reminders_state_due').on(table.state, table.dueAt),
    check('follow_up_reminders_reminder', sql`${table.reminder} IN (1, 2)`),
    check('follow_up_reminders_state', sql`${table.state} IN ('pending', 'submitted', 'dropped')`),
  ],
)

// One Follow-up reminder a Snooze reserved (#36), keyed like follow_up_reminders and by its action.
export const snoozes = sqliteTable(
  'snoozes',
  {
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    reminder: integer('reminder').notNull(),
    actionId: text('action_id').notNull(),
    acceptedAt: text('accepted_at').notNull(),
    targetAt: text('target_at').notNull(),
    state: text('state', { enum: ['pending', 'submitted', 'dropped'] })
      .notNull()
      .default('pending'),
    claimToken: text('claim_token'),
    leaseUntil: text('lease_until'),
    settledAt: text('settled_at'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.scheduleId, table.dueAt, table.reminder] }),
    unique().on(table.ownerId, table.actionId),
    uniqueIndex('snoozes_one_pending')
      .on(table.ownerId, table.scheduleId, table.dueAt)
      .where(sql`${table.state} = 'pending'`),
    index('snoozes_state_target').on(table.state, table.targetAt),
    check('snoozes_reminder', sql`${table.reminder} IN (1, 2)`),
    check('snoozes_state', sql`${table.state} IN ('pending', 'submitted', 'dropped')`),
  ],
)

// One submission to one Device registration; never the token or medication name (#366).
// `reminder` names what it submitted: 0 the Original reminder, 1 and 2 the Follow-up reminders.
export const deliveryAttempts = sqliteTable(
  'delivery_attempts',
  {
    id: text('id').primaryKey().notNull(),
    ownerId: text('owner_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    dueAt: text('due_at').notNull(),
    installationId: text('installation_id').notNull(),
    outcome: text('outcome', { enum: ['accepted', 'rejected', 'transient'] }).notNull(),
    code: text('code'),
    attemptedAt: text('attempted_at').notNull(),
    reminder: integer('reminder').notNull().default(0),
  },
  (table) => [
    index('delivery_attempts_occurrence').on(table.ownerId, table.scheduleId, table.dueAt),
    index('delivery_attempts_attempted').on(table.attemptedAt, table.outcome),
    index('delivery_attempts_final').on(table.ownerId, table.dueAt, table.reminder),
    check(
      'delivery_attempts_outcome',
      sql`${table.outcome} IN ('accepted', 'rejected', 'transient')`,
    ),
    check('delivery_attempts_reminder', sql`${table.reminder} IN (0, 1, 2)`),
  ],
)

// Account-wide preferences (#35, #37); no row reads as defaults, Quiet hours and Medication names
// off.
export const accountPreferences = sqliteTable(
  'account_preferences',
  {
    ownerId: text('owner_id').primaryKey().notNull(),
    quietHours: integer('quiet_hours', { mode: 'boolean' }).notNull().default(false),
    medicationNames: integer('medication_names', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('account_preferences_quiet_hours', sql`${table.quietHours} IN (0, 1)`),
    check('account_preferences_medication_names', sql`${table.medicationNames} IN (0, 1)`),
  ],
)

// One receipt per Quiet hours set, keyed by its action ID (#35).
export const quietHoursReceipts = sqliteTable(
  'quiet_hours_receipts',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    quietHours: integer('quiet_hours', { mode: 'boolean' }).notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    check('quiet_hours_receipts_quiet_hours', sql`${table.quietHours} IN (0, 1)`),
  ],
)

// One receipt per Medication names set, keyed by its action ID (#37).
export const medicationNamesReceipts = sqliteTable(
  'medication_names_receipts',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicationNames: integer('medication_names', { mode: 'boolean' }).notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    check('medication_names_receipts_medication_names', sql`${table.medicationNames} IN (0, 1)`),
  ],
)

// Starting counts, count corrections and refills outlive the current tracking state.
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    medicineId: text('medicine_id').notNull(),
    count: real('count').notNull(),
    unit: text('unit', { enum: writableMedicineTypes }).notNull(),
    occurredAt: text('occurred_at').notNull(),
    kind: text('kind', { enum: ['startingCount', 'countCorrection', 'refill'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }).onDelete('cascade'),
  ],
)

export const medicineStockActions = sqliteTable(
  'medicine_stock_actions',
  {
    ownerId: text('owner_id').notNull(),
    actionId: text('action_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    kind: text('kind', {
      enum: ['stockOn', 'stockOff', 'stockCorrection', 'stockRefill', 'stockThreshold'],
    }).notNull(),
    count: real('count'),
    unit: text('unit'),
    confirmedAt: text('confirmed_at').notNull(),
    request: text('request').notNull(),
    result: text('result'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.actionId] }),
    unique().on(table.ownerId, table.medicineId, table.expectedRevision),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }).onDelete('cascade'),
  ],
)

// One movement per dose version that changes stock; migration 0026 triggers write and apply it.
export const intakeStockMovements = sqliteTable(
  'intake_stock_movements',
  {
    ownerId: text('owner_id').notNull(),
    medicineId: text('medicine_id').notNull(),
    doseKey: text('dose_key').notNull(),
    revision: integer('revision').notNull(),
    countChange: real('count_change').notNull(),
    unit: text('unit', { enum: writableMedicineTypes }).notNull(),
    occurredAt: text('occurred_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.doseKey, table.revision] }),
    foreignKey({
      columns: [table.ownerId, table.medicineId],
      foreignColumns: [userMedications.ownerId, userMedications.id],
    }).onDelete('cascade'),
    check('intake_stock_movements_count_change', sql`${table.countChange} <> 0`),
  ],
)
