window.MEDDIES_DATA = {
  now: '14:38',
  dateLabel: 'Thursday, 5 November',
  user: 'Mia',
  meds: [
    { id: 'd3', name: 'Vitamin D3', strength: '1000 IU', form: 'tablet', schedule: 'Every day · 09:00', stock: 46, tone: 'butter', shape: 'round' },
    { id: 'mg', name: 'Magnesium', strength: '200 mg', form: 'tablet', schedule: 'Every day · 14:00', stock: 8, low: true, tone: 'blush', shape: 'scored' },
    { id: 'o3', name: 'Omega-3', strength: '1000 mg', form: 'capsule', schedule: 'Every day · 20:00', stock: 52, tone: 'peach', shape: 'capsule' },
    { id: 'fe', name: 'Iron bisglycinate', strength: '14 mg', form: 'tablet', schedule: 'Mon, Wed, Fri · 08:00', stock: 27, tone: 'plum', shape: 'square' },
    { id: 'ce', name: 'Cetirizine', strength: '10 mg', form: 'tablet', schedule: null, stock: 21, tone: 'mist', shape: 'ring' }
  ],
  doses: [
    { id: 'x1', medId: 'd3', time: '09:00', qty: 1, status: 'taken', actual: '09:12' },
    { id: 'x2', medId: 'mg', time: '14:00', qty: 1, status: 'notLogged' },
    { id: 'x3', medId: 'o3', time: '20:00', qty: 1, status: 'scheduled' }
  ]
};
