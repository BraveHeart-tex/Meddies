# Meddies app — UI kit

Interactive recreation of the **1a Cozy Care** direction (source: `Meddies Visual Directions.dc.html`, column 1a).

- `index.html` — 390×844 phone; click-through Today → Record dose → toast/Undo, Medications (search works), History placeholder.
- `TodayScreen.jsx` — greeting header, Up next hero, Today's doses list.
- `MedicationsScreen.jsx` — header + Add, search, scheduled / no-schedule groups, low stock.
- `RecordDoseSheet.jsx` — explicit outcome, scheduled vs actual time, amount, Save/Cancel. Save disabled until an outcome is chosen.
- `data.js` — the shared sample data (Thu 5 Nov, 14:38).

Not designed yet (shown as placeholders/notices): History, Settings, Add medication, scheduling.
