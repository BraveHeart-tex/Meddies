/**
 * Dose / stock status pill. Icon + label are mandatory — never communicate status by colour alone.
 * "Not logged" means a reminder passed with no record; it must never imply intake.
 */
export interface StatusBadgeProps {
  status: 'taken' | 'notLogged' | 'scheduled' | 'skipped' | 'low';
  /** Actual time, appended to the label, e.g. "Taken 09:12". */
  time?: string;
  /** Override label entirely (e.g. "8 left"). */
  label?: string;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
