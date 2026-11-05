import React from 'react';
import { AppHeader } from '../../components/navigation/AppHeader.jsx';
import { NextDoseCard } from '../../components/medication/NextDoseCard.jsx';
import { DoseCard } from '../../components/medication/DoseCard.jsx';
import { Card } from '../../components/core/Card.jsx';

export function TodayScreen({ data, doses, onOpenDose, onSettings }) {
  const med = (id) => data.meds.find((m) => m.id === id);
  const next = doses.find((d) => d.status === 'notLogged') || doses.find((d) => d.status === 'scheduled');
  const logged = doses.filter((d) => d.status === 'taken' || d.status === 'skipped').length;
  const remaining = doses.filter((d) => d.status === 'scheduled' && d !== next);
  const nm = next ? med(next.medId) : null;
  return (
    <div style={{ padding: '14px 20px 130px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AppHeader eyebrow={data.dateLabel} title={'Good afternoon, ' + data.user} onSettings={onSettings} />
      {next ? (
        <NextDoseCard eyebrow={next.status === 'notLogged' ? 'Up next' : 'Later today'} name={nm.name} strength={nm.strength}
          dose={next.qty + ' ' + nm.form} dueTime={next.time} status={next.status} tone={nm.tone} shape={nm.shape}
          onTaken={() => onOpenDose(next.id, 'taken')} onSkip={() => onOpenDose(next.id, 'skipped')} />
      ) : (
        <Card variant="accent" padding={20}><div style={{ font: 'var(--type-heading)' }}>All logged for today</div><div style={{ font: 'var(--type-support)', color: 'var(--text-secondary)', marginTop: 4 }}>Nothing else scheduled. Rest easy.</div></Card>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
        <span style={{ font: 'var(--type-heading)' }}>Today’s doses</span>
        <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)' }}>{logged} of {doses.length} logged</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -6 }}>
        {doses.map((d) => {
          const m = med(d.medId);
          return <DoseCard key={d.id} time={d.time} name={m.name} detail={m.strength + ' · ' + d.qty + ' ' + m.form} status={d.status} statusTime={d.actual} onClick={() => onOpenDose(d.id, null)} />;
        })}
      </div>
      {next && next.status === 'notLogged' && remaining.length ? (
        <div style={{ font: 'var(--type-support)', color: 'var(--text-muted)', textAlign: 'center', padding: '0 24px' }}>After {nm.name}, nothing else until this evening.</div>
      ) : null}
    </div>
  );
}
