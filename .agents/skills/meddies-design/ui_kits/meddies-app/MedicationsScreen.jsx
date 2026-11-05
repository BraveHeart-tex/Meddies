import React from 'react';
import { AppHeader } from '../../components/navigation/AppHeader.jsx';
import { Button } from '../../components/core/Button.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { MedicationRow } from '../../components/medication/MedicationRow.jsx';

export function MedicationsScreen({ data, onAdd, onNotice }) {
  const [q, setQ] = React.useState('');
  const match = (m) => m.name.toLowerCase().includes(q.toLowerCase());
  const scheduled = data.meds.filter((m) => m.schedule && match(m));
  const asNeeded = data.meds.filter((m) => !m.schedule && match(m));
  const low = data.meds.filter((m) => m.low).length;
  const Group = ({ label }) => <div style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 4px 0' }}>{label}</div>;
  return (
    <div style={{ padding: '14px 20px 130px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AppHeader title="Medications" subtitle={data.meds.length + ' medications · ' + low + ' running low'}
        action={<Button size="md" pill icon="plus" onClick={onAdd}>Add</Button>} />
      <TextField icon="search" placeholder="Search medications" value={q} onChange={setQ} />
      {scheduled.length ? <Group label="On a schedule" /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -6 }}>
        {scheduled.map((m) => <MedicationRow key={m.id} {...m} />)}
      </div>
      {asNeeded.length ? <Group label="No schedule" /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -6 }}>
        {asNeeded.map((m) => <MedicationRow key={m.id} {...m} onAddSchedule={() => onNotice('Scheduling isn’t designed yet')} />)}
      </div>
      {!scheduled.length && !asNeeded.length ? <div style={{ font: 'var(--type-support)', color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No medications match “{q}”.</div> : null}
    </div>
  );
}
