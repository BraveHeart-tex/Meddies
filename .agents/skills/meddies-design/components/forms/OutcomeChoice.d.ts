/**
 * Explicit Taken / Skipped choice for recording a dose. Starts unselected (null) — opening a sheet never records anything.
 */
export interface OutcomeChoiceProps {
  value?: 'taken' | 'skipped' | null;
  onChange?: (value: 'taken' | 'skipped') => void;
  takenLabel?: string;
  skippedLabel?: string;
  style?: React.CSSProperties;
}
export declare function OutcomeChoice(props: OutcomeChoiceProps): JSX.Element;
