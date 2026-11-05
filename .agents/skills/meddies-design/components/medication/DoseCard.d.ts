/** One scheduled dose on Today. Left column is the SCHEDULED time; the badge carries the ACTUAL time once logged. */
export interface DoseCardProps {
  /** Scheduled time, 24h "HH:MM". */
  time: string;
  name: string;
  /** e.g. "200 mg · 1 tablet". */
  detail?: string;
  status?: 'taken' | 'notLogged' | 'scheduled' | 'skipped';
  /** Actual intake time for taken/skipped. */
  statusTime?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function DoseCard(props: DoseCardProps): JSX.Element;
