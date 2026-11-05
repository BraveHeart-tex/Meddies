/** Floating pill tab bar: Today · Medications · History. Active tab = blush capsule + berry label. Position inside a relative screen container. */
export interface BottomNavProps {
  active?: 'today' | 'medications' | 'history';
  onChange?: (id: 'today' | 'medications' | 'history') => void;
  /** Absolute-position above the home indicator (default true). */
  floating?: boolean;
  style?: React.CSSProperties;
}
export declare function BottomNav(props: BottomNavProps): JSX.Element;
