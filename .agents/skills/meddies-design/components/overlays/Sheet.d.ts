/** Bottom sheet with scrim and grab handle. Renders absolutely inside the nearest positioned (screen) container. */
export interface SheetProps {
  open?: boolean;
  onClose?: () => void;
  /** Accessible dialog label. */
  label?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Sheet(props: SheetProps): JSX.Element | null;
