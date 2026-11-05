/**
 * Medication list item: identity tile, name, strength/form, schedule, stock. No schedule → dashed card + "Add schedule".
 * @startingPoint section="Medication" subtitle="Medication list row with schedule and stock" viewport="390x100"
 */
export interface MedicationRowProps {
  name: string;
  strength?: string;
  form?: string;
  /** Human schedule, e.g. "Every day · 09:00". Omit/null for as-needed medications. */
  schedule?: string | null;
  /** Units left. */
  stock?: number;
  low?: boolean;
  tone?: 'butter' | 'blush' | 'peach' | 'plum' | 'mist';
  shape?: 'round' | 'scored' | 'capsule' | 'square' | 'ring';
  onAddSchedule?: () => void;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function MedicationRow(props: MedicationRowProps): JSX.Element;
