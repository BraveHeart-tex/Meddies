export type IconName =
  | 'check' | 'clock' | 'notLogged' | 'skipped' | 'warning' | 'plus' | 'minus' | 'close'
  | 'search' | 'settings' | 'today' | 'medications' | 'history' | 'chevronRight';

/** Meddies line icon. Rounded caps, 1.6–2.2 stroke, inherits currentColor. */
export interface IconProps {
  name: IconName;
  /** Rendered px size. Default 16. */
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Accessible label; omit for decorative icons. */
  title?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element | null;
