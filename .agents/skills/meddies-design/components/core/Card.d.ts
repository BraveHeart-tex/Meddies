/** Flat container. Cards never cast shadows in Meddies — separation comes from white-on-cream + warm border. */
export interface CardProps {
  children?: React.ReactNode;
  /** default = white/border r22 · attention = blush border (needs a response) · accent = blush fill r28 (Up next) · dashed = incomplete (no schedule) · sunken = cream info row. */
  variant?: 'default' | 'attention' | 'accent' | 'dashed' | 'sunken';
  padding?: number | string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;
