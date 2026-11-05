/**
 * The "Up next" hero on Today — the single most important action. Taken / Skip open the Record dose sheet; they never log silently.
 * @startingPoint section="Medication" subtitle="Up next hero card with Taken / Skip" viewport="402x260"
 */
export interface NextDoseCardProps {
  eyebrow?: string;
  name: string;
  strength?: string;
  dose?: string;
  dueTime?: string;
  status?: 'notLogged' | 'scheduled';
  tone?: 'butter' | 'blush' | 'peach' | 'plum' | 'mist';
  shape?: 'round' | 'scored' | 'capsule' | 'square' | 'ring';
  onTaken?: () => void;
  onSkip?: () => void;
  style?: React.CSSProperties;
}
export declare function NextDoseCard(props: NextDoseCardProps): JSX.Element;
