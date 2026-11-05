import React from 'react';
import { Sheet } from '../../components/overlays/Sheet.jsx';
import { PillTile } from '../../components/medication/PillTile.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Icon } from '../../components/core/Icon.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Button } from '../../components/core/Button.jsx';
import { OutcomeChoice } from '../../components/forms/OutcomeChoice.jsx';
import { ChipGroup } from '../../components/forms/ChipGroup.jsx';
import { Stepper } from '../../components/forms/Stepper.jsx';
import { TextField } from '../../components/forms/TextField.jsx';

function minutesBetween(a, b) {
  const t = (s) => { const p = s.split(':'); return +p[0] * 60 + +p[1]; };
  return t(b) - t(a);
}

export function RecordDoseSheet({ open, dose, med, now, initialOutcome, onCancel, onSave }) {
  const [outcome, setOutcome] = React.useState(null);
  const [when, setWhen] = React.useState('now');
  const [other, setOther] = React.useState('14:15');
  const [qty, setQty] = React.useState(1);
  React.useEffect(() => { if (open) { setOutcome(initialOutcome || null); setWhen('now'); setQty(dose ? dose.qty : 1); } }, [open, dose && dose.id]);
  if (!dose || !med) return <Sheet open={false} />;
  const actual = when === 'now' ? now : when === 'sched' ? dose.time : other;
  const diff = minutesBetween(dose.time, actual);
  const diffLabel = diff === 0 ? 'Same as scheduled' : Math.abs(diff) + ' min ' + (diff > 0 ? 'after' : 'before') + ' scheduled';
  const verb = outcome === 'skipped' ? 'Skipped at' : 'Taken at';
  return (
    <Sheet open={open} onClose={onCancel} label={'Record ' + med.name}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <PillTile tone={med.tone} shape={med.shape} size={52} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: 'var(--weight-heavy) 23px/1.1 var(--font-family-base)' }}>{med.name}</span>
          <span style={{ font: 'var(--type-support)', color: 'var(--text-muted)' }}>{med.strength} · {med.form}</span>
        </div>
        <IconButton icon="close" label="Close" onClick={onCancel} />
      </div>
      <Card variant="sunken" padding="12px 14px" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="clock" size={18} color="var(--text-muted)" />
        <span style={{ font: 'var(--weight-bold) var(--size-body-sm)/1.2 var(--font-family-base)', color: 'var(--text-muted)' }}>Scheduled</span>
        <span style={{ marginLeft: 'auto', font: 'var(--weight-heavy) var(--size-body-sm)/1.2 var(--font-family-base)' }}>{dose.time} today</span>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ font: 'var(--type-card-title)' }}>What happened?</span>
        <OutcomeChoice value={outcome} onChange={setOutcome} />
      </div>
      {outcome ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: 'var(--type-card-title)' }}>{verb}</span>
            <span style={{ font: 'var(--type-detail)', color: 'var(--text-muted)' }}>{diffLabel}</span>
          </div>
          <ChipGroup label={verb} value={when} onChange={setWhen}
            options={[{ value: 'now', label: 'Now · ' + now }, { value: 'sched', label: 'At ' + dose.time }, { value: 'other', label: when === 'other' ? other : 'Other', grow: false }]} />
          {when === 'other' ? <TextField type="time" value={other} onChange={setOther} /> : null}
        </div>
      ) : (
        <div style={{ font: 'var(--type-support)', color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>Nothing is recorded until you choose and save.</div>
      )}
      {outcome === 'taken' ? <Stepper label="Amount" value={qty} unit={med.form} onChange={setQty} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Button size="xl" fullWidth disabled={!outcome} onClick={() => onSave({ outcome, actual, qty })}>
          {outcome === 'skipped' ? 'Save as skipped' : outcome === 'taken' ? 'Save as taken' : 'Choose an outcome'}
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onCancel}>Cancel</Button>
      </div>
    </Sheet>
  );
}
